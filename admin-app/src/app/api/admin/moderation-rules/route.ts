import { getAdminContext } from "@/lib/supabase/admin-server";

const categories = new Set([
  "广告与导流",
  "诈骗与交易风险",
  "人身攻击与骚扰",
  "暴力与威胁",
  "成人与不当内容",
  "其他",
]);
const riskLevels = new Set(["low", "medium", "high"]);
const riskDefaultMinHits: Record<string, number> = { low: 5, medium: 3, high: 1 };

function isMissingRulesTable(error: { code?: string; message?: string } | null) {
  return error?.code === "42P01" || error?.message?.includes("moderation_rules") === true;
}

function isMissingRiskColumns(error: { code?: string; message?: string } | null) {
  return error?.code === "42703" || error?.message?.includes("risk_level") === true || error?.message?.includes("min_hits") === true;
}

function parseMinHits(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 999 ? parsed : NaN;
}

async function requireAdmin() {
  const context = await getAdminContext();
  if (!context.user) return { error: Response.json({ error: "管理员登录已失效。" }, { status: 401 }) };
  return { ...context, error: null };
}

export async function POST(request: Request) {
  const context = await requireAdmin();
  if (context.error || !context.user) return context.error || Response.json({ error: "管理员登录已失效。" }, { status: 401 });
  const adminId = context.user.id;

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const ruleType = body?.ruleType;
  const pattern = typeof body?.pattern === "string" ? body.pattern.trim() : "";
  const category = body?.category;
  const riskLevel = body?.riskLevel;
  const rawMinHits = parseMinHits(body?.minHits);
  const description = typeof body?.description === "string" ? body.description.trim() : null;

  if ((ruleType !== "keyword" && ruleType !== "whitelist") || !pattern || pattern.length > 500 || typeof category !== "string" || !categories.has(category)) {
    return Response.json({ error: "规则内容不完整或格式不正确。" }, { status: 400 });
  }

  if (ruleType === "keyword" && (typeof riskLevel !== "string" || !riskLevels.has(riskLevel))) {
    return Response.json({ error: "风险级别不正确。" }, { status: 400 });
  }
  if (ruleType === "keyword" && Number.isNaN(rawMinHits)) {
    return Response.json({ error: "最低命中次数必须是 1 至 999 的整数。" }, { status: 400 });
  }
  if (ruleType === "whitelist" && (riskLevel !== undefined || body?.minHits !== undefined)) {
    return Response.json({ error: "规则内容不完整或格式不正确。" }, { status: 400 });
  }

  const normalizedRiskLevel = ruleType === "keyword" ? (riskLevel as string) : "low";
  const normalizedMinHits = ruleType === "keyword" ? (rawMinHits ?? riskDefaultMinHits[normalizedRiskLevel]) : 5;
  const { data, error } = await context.supabase
    .from("moderation_rules")
    .insert({ rule_type: ruleType, pattern, category, risk_level: normalizedRiskLevel, min_hits: normalizedMinHits, description: description || null, created_by: adminId, updated_by: adminId })
    .select("id, rule_type, pattern, category, severity, risk_level, min_hits, description, enabled, hit_count, updated_at")
    .single();

  if (error) {
    if (isMissingRiskColumns(error)) return Response.json({ error: "风险分级功能尚未启用，请先执行 moderation-risk-thresholds-v1.sql。" }, { status: 503 });
    if (isMissingRulesTable(error)) return Response.json({ error: "审核规则数据表尚未启用。" }, { status: 503 });
    if (error.code === "23505") return Response.json({ error: "同分类下已经存在相同规则。" }, { status: 409 });
    return Response.json({ error: "规则保存失败。" }, { status: 500 });
  }
  await context.supabase.from("admin_audit_logs").insert({ admin_id: adminId, action: "create_moderation_rule", target_type: "moderation_rule", target_id: data.id, note: `${data.rule_type}:${data.pattern}` });
  return Response.json({ rule: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const context = await requireAdmin();
  if (context.error || !context.user) return context.error || Response.json({ error: "管理员登录已失效。" }, { status: 401 });
  const adminId = context.user.id;
  const body = await request.json().catch(() => null) as { id?: unknown; enabled?: unknown; riskLevel?: unknown; minHits?: unknown; description?: unknown } | null;
  if (typeof body?.id !== "string") return Response.json({ error: "缺少规则编号。" }, { status: 400 });
  if (body.enabled !== undefined && typeof body.enabled !== "boolean") return Response.json({ error: "规则状态不正确。" }, { status: 400 });

  const updates: Record<string, unknown> = { updated_by: adminId };
  if (body.enabled !== undefined) updates.enabled = body.enabled;
  if (body.riskLevel !== undefined) {
    if (typeof body.riskLevel !== "string" || !riskLevels.has(body.riskLevel)) return Response.json({ error: "风险级别不正确。" }, { status: 400 });
    const riskLevel = body.riskLevel;
    const parsedMinHits = parseMinHits(body.minHits);
    if (Number.isNaN(parsedMinHits)) return Response.json({ error: "最低命中次数必须是 1 至 999 的整数。" }, { status: 400 });
    updates.risk_level = riskLevel;
    updates.min_hits = parsedMinHits ?? riskDefaultMinHits[riskLevel];
    updates.severity = riskLevel === "high" ? "high" : "review";
  } else if (body.minHits !== undefined) {
    const parsedMinHits = parseMinHits(body.minHits);
    if (Number.isNaN(parsedMinHits)) return Response.json({ error: "最低命中次数必须是 1 至 999 的整数。" }, { status: 400 });
    updates.min_hits = parsedMinHits;
  }
  if (body.description !== undefined) {
    if (typeof body.description !== "string") return Response.json({ error: "备注内容不正确。" }, { status: 400 });
    updates.description = body.description.trim() || null;
  }
  if (Object.keys(updates).length === 1) return Response.json({ error: "没有需要更新的规则内容。" }, { status: 400 });

  const { data, error } = await context.supabase
    .from("moderation_rules")
    .update(updates)
    .eq("id", body.id)
    .select("id, rule_type, pattern, category, severity, risk_level, min_hits, description, enabled, hit_count, updated_at")
    .maybeSingle();
  if (error) {
    if (isMissingRiskColumns(error)) return Response.json({ error: "风险分级功能尚未启用，请先执行 moderation-risk-thresholds-v1.sql。" }, { status: 503 });
    return Response.json({ error: isMissingRulesTable(error) ? "审核规则数据表尚未启用。" : "规则更新失败。" }, { status: isMissingRulesTable(error) ? 503 : 500 });
  }
  if (!data) return Response.json({ error: "找不到这条规则。" }, { status: 404 });
  const changedRisk = updates.risk_level !== undefined || updates.min_hits !== undefined;
  const changedEnabled = updates.enabled !== undefined;
  const action = changedRisk
    ? "update_moderation_rule"
    : changedEnabled
      ? (data.enabled ? "enable_moderation_rule" : "disable_moderation_rule")
      : "update_moderation_rule";
  const note = changedRisk ? `${data.pattern} | risk_level=${data.risk_level} min_hits=${data.min_hits}` : data.pattern;
  await context.supabase.from("admin_audit_logs").insert({ admin_id: adminId, action, target_type: "moderation_rule", target_id: data.id, note });
  return Response.json({ rule: data });
}

export async function DELETE(request: Request) {
  const context = await requireAdmin();
  if (context.error || !context.user) return context.error || Response.json({ error: "管理员登录已失效。" }, { status: 401 });
  const adminId = context.user.id;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "缺少规则编号。" }, { status: 400 });

  const { data, error } = await context.supabase
    .from("moderation_rules")
    .delete()
    .eq("id", id)
    .select("id, pattern")
    .maybeSingle();
  if (error) return Response.json({ error: isMissingRulesTable(error) ? "审核规则数据表尚未启用。" : "规则删除失败。" }, { status: isMissingRulesTable(error) ? 503 : 500 });
  if (!data) return Response.json({ error: "找不到这条规则。" }, { status: 404 });
  await context.supabase.from("admin_audit_logs").insert({ admin_id: adminId, action: "delete_moderation_rule", target_type: "moderation_rule", target_id: data.id, note: data.pattern });
  return Response.json({ ok: true });
}
