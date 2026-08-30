import { getAdminContext } from "@/lib/supabase/admin-server";
import { getModerationReasonAliases, MODERATION_REASON_OPTIONS, normalizeModerationReason } from "@/lib/moderationReasons";

const categories = new Set<string>(MODERATION_REASON_OPTIONS);
const riskLevels = new Set(["low", "medium", "high"]);
const riskFilters = new Set(["all", "low", "medium", "high", "whitelist"]);
const riskDefaultMinHits: Record<string, number> = { low: 5, medium: 3, high: 1 };
const RULE_SELECT = "id, public_id, rule_type, pattern, category, severity, risk_level, min_hits, description, enabled, hit_count, updated_at";
const MAX_BULK_IDS = 2000;

function normalizeIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_BULK_IDS) return null;
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string" || !item.trim()) return null;
    const id = item.trim();
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids.length > 0 ? ids : null;
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

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

export async function GET(request: Request) {
  const context = await requireAdmin();
  if (context.error || !context.user) return context.error || Response.json({ error: "管理员登录已失效。" }, { status: 401 });

  const url = new URL(request.url);
  const page = Math.max(1, Math.min(100000, Number(url.searchParams.get("page")) || 1));
  const pageSize = Math.max(1, Math.min(500, Number(url.searchParams.get("pageSize")) || 100));
  const risk = url.searchParams.get("risk") ?? "all";
  if (!riskFilters.has(risk)) return Response.json({ error: "风险筛选条件不正确。" }, { status: 400 });
  const category = normalizeModerationReason((url.searchParams.get("category") ?? "").trim().slice(0, 100));
  if (category && !categories.has(category)) return Response.json({ error: "问题分类不正确。" }, { status: 400 });
  const enabledRaw = url.searchParams.get("enabled");
  if (enabledRaw !== null && !["true", "false", "1", "0"].includes(enabledRaw)) return Response.json({ error: "规则状态筛选条件不正确。" }, { status: 400 });
  const enabled = enabledRaw === null ? null : enabledRaw === "true" || enabledRaw === "1";
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);

  let query = context.supabase.from("moderation_rules").select(RULE_SELECT, { count: "exact" });
  if (risk === "whitelist") {
    query = query.eq("rule_type", "whitelist");
  } else if (risk !== "all") {
    query = query.eq("rule_type", "keyword").eq("risk_level", risk);
  }
  if (category) query = query.in("category", getModerationReasonAliases(category));
  if (enabled !== null) query = query.eq("enabled", enabled);
  if (q) query = query.ilike("pattern", `%${escapeLike(q)}%`);
  const start = (page - 1) * pageSize;
  const result = await query.range(start, start + pageSize - 1).order("created_at", { ascending: false });
  const { data, error, count } = result as unknown as { data: Array<Record<string, unknown>> | null; error: { code?: string; message?: string } | null; count: number | null };
  if (error) {
    if (isMissingRiskColumns(error)) return Response.json({ error: "风险分级功能尚未启用，请先执行 moderation-risk-thresholds-v1.sql。" }, { status: 503 });
    if (isMissingRulesTable(error)) return Response.json({ error: "审核规则数据表尚未启用。" }, { status: 503 });
    return Response.json({ error: "规则列表加载失败。" }, { status: 500 });
  }

  const [allCountResult, lowCountResult, mediumCountResult, highCountResult, whitelistCountResult] = await Promise.all([
    context.supabase.from("moderation_rules").select("id", { count: "exact", head: true }),
    context.supabase.from("moderation_rules").select("id", { count: "exact", head: true }).eq("rule_type", "keyword").eq("risk_level", "low"),
    context.supabase.from("moderation_rules").select("id", { count: "exact", head: true }).eq("rule_type", "keyword").eq("risk_level", "medium"),
    context.supabase.from("moderation_rules").select("id", { count: "exact", head: true }).eq("rule_type", "keyword").eq("risk_level", "high"),
    context.supabase.from("moderation_rules").select("id", { count: "exact", head: true }).eq("rule_type", "whitelist"),
  ]);
  const total = count ?? data?.length ?? 0;
  return Response.json({
    rules: data ?? [],
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    page,
    pageSize,
    counts: {
      all: allCountResult.count ?? 0,
      low: lowCountResult.count ?? 0,
      medium: mediumCountResult.count ?? 0,
      high: highCountResult.count ?? 0,
      whitelist: whitelistCountResult.count ?? 0,
    },
  });
}

export async function POST(request: Request) {
  const context = await requireAdmin();
  if (context.error || !context.user) return context.error || Response.json({ error: "管理员登录已失效。" }, { status: 401 });
  const adminId = context.user.id;

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const ruleType = body?.ruleType;
  const pattern = typeof body?.pattern === "string" ? body.pattern.trim() : "";
  const category = typeof body?.category === "string" ? normalizeModerationReason(body.category) : body?.category;
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
    .select("id, public_id, rule_type, pattern, category, severity, risk_level, min_hits, description, enabled, hit_count, updated_at")
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
  const body = await request.json().catch(() => null) as { id?: unknown; ids?: unknown; enabled?: unknown; category?: unknown; riskLevel?: unknown; minHits?: unknown; description?: unknown } | null;
  if (!body) return Response.json({ error: "请求内容不正确。" }, { status: 400 });
  const ids = normalizeIds(body.ids);
  if (ids) {
    const hasEnabled = body.enabled !== undefined;
    const hasCategory = body.category !== undefined;
    const hasRisk = body.riskLevel !== undefined;
    const hasMinHits = body.minHits !== undefined;
    if (hasEnabled && typeof body.enabled !== "boolean") return Response.json({ error: "规则状态不正确。" }, { status: 400 });
    const category = typeof body.category === "string" ? normalizeModerationReason(body.category) : body.category;
    if (hasCategory && (typeof category !== "string" || !categories.has(category))) return Response.json({ error: "问题分类不正确。" }, { status: 400 });
    if (!hasEnabled && !hasCategory && !hasRisk && !hasMinHits) return Response.json({ error: "没有需要更新的规则内容。" }, { status: 400 });
    if (hasRisk && typeof body.riskLevel !== "string") return Response.json({ error: "风险级别不正确。" }, { status: 400 });
    if (hasRisk && !riskLevels.has(body.riskLevel as string)) return Response.json({ error: "风险级别不正确。" }, { status: 400 });

    const updates: Record<string, unknown> = { updated_by: adminId };
    if (hasCategory) updates.category = category;
    if (hasRisk) {
      const riskLevel = body.riskLevel as string;
      const parsedMinHits = hasMinHits ? parseMinHits(body.minHits) : null;
      if (hasMinHits && (parsedMinHits === null || Number.isNaN(parsedMinHits))) return Response.json({ error: "最低命中次数必须是 1 至 999 的整数。" }, { status: 400 });
      updates.risk_level = riskLevel;
      updates.min_hits = parsedMinHits ?? riskDefaultMinHits[riskLevel];
      updates.severity = riskLevel === "high" ? "high" : "review";
    } else if (hasMinHits) {
      const parsedMinHits = parseMinHits(body.minHits);
      if (parsedMinHits === null || Number.isNaN(parsedMinHits)) return Response.json({ error: "最低命中次数必须是 1 至 999 的整数。" }, { status: 400 });
      updates.min_hits = parsedMinHits;
    }
    if (hasEnabled) updates.enabled = body.enabled;

    let query = context.supabase
      .from("moderation_rules")
      .update(updates)
      .in("id", ids)
    .select("id, public_id, rule_type, pattern, risk_level, min_hits, enabled");
    if (hasRisk || hasMinHits) query = query.eq("rule_type", "keyword");
    const { data, error } = await query;
    if (error) {
      if (isMissingRiskColumns(error)) return Response.json({ error: "风险分级功能尚未启用，请先执行 moderation-risk-thresholds-v1.sql。" }, { status: 503 });
      return Response.json({ error: isMissingRulesTable(error) ? "审核规则数据表尚未启用。" : "规则更新失败。" }, { status: isMissingRulesTable(error) ? 503 : 500 });
    }
    const updated = data ?? [];
    const riskNote = hasRisk ? `风险等级=${updates.risk_level}，最低命中=${updates.min_hits}` : "";
    const statusNote = hasEnabled ? `状态=${body.enabled ? "启用" : "停用"}` : "";
    const action = hasCategory
      ? "bulk_update_moderation_rule_category"
      : hasRisk
      ? "bulk_update_moderation_rule_risk"
      : hasEnabled
        ? (body.enabled ? "bulk_enable_moderation_rules" : "bulk_disable_moderation_rules")
        : "bulk_update_moderation_rules";
    await context.supabase.from("admin_audit_logs").insert({
      admin_id: adminId,
      action,
      target_type: "moderation_rules",
      target_id: null,
      note: `批量处理${updated.length} 条规则${riskNote ? `，${riskNote}` : ""}${statusNote ? `，${statusNote}` : ""}`,
      metadata: { ids, count: updated.length },
    });
    return Response.json({ updated: updated.length, rules: updated });
  }

  if (typeof body?.id !== "string") return Response.json({ error: "缺少规则编号。" }, { status: 400 });
  if (body.enabled !== undefined && typeof body.enabled !== "boolean") return Response.json({ error: "规则状态不正确。" }, { status: 400 });
  const category = typeof body.category === "string" ? normalizeModerationReason(body.category) : body.category;
  if (body.category !== undefined && (typeof category !== "string" || !categories.has(category))) return Response.json({ error: "问题分类不正确。" }, { status: 400 });

  const updates: Record<string, unknown> = { updated_by: adminId };
  if (body.enabled !== undefined) updates.enabled = body.enabled;
  if (body.category !== undefined) updates.category = category;
  if (body.riskLevel !== undefined) {
    if (typeof body.riskLevel !== "string" || !riskLevels.has(body.riskLevel)) return Response.json({ error: "风险级别不正确。" }, { status: 400 });
    const riskLevel = body.riskLevel;
    const parsedMinHits = body.minHits === undefined ? null : parseMinHits(body.minHits);
    if (body.minHits !== undefined && (parsedMinHits === null || Number.isNaN(parsedMinHits))) return Response.json({ error: "最低命中次数必须是 1 至 999 的整数。" }, { status: 400 });
    updates.risk_level = riskLevel;
    updates.min_hits = parsedMinHits ?? riskDefaultMinHits[riskLevel];
    updates.severity = riskLevel === "high" ? "high" : "review";
  } else if (body.minHits !== undefined) {
    const parsedMinHits = parseMinHits(body.minHits);
    if (parsedMinHits === null || Number.isNaN(parsedMinHits)) return Response.json({ error: "最低命中次数必须是 1 至 999 的整数。" }, { status: 400 });
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
    .select("id, public_id, rule_type, pattern, category, severity, risk_level, min_hits, description, enabled, hit_count, updated_at")
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
  const url = new URL(request.url);
  const singleId = url.searchParams.get("id");
  const idsParam = url.searchParams.get("ids");
  if (singleId) {
    const { data, error } = await context.supabase
      .from("moderation_rules")
      .delete()
      .eq("id", singleId)
      .select("id, pattern")
      .maybeSingle();
    if (error) return Response.json({ error: isMissingRulesTable(error) ? "审核规则数据表尚未启用。" : "规则删除失败。" }, { status: isMissingRulesTable(error) ? 503 : 500 });
    if (!data) return Response.json({ error: "找不到这条规则。" }, { status: 404 });
    await context.supabase.from("admin_audit_logs").insert({ admin_id: adminId, action: "delete_moderation_rule", target_type: "moderation_rule", target_id: data.id, note: data.pattern });
    return Response.json({ ok: true, deleted: 1, rules: [data] });
  }
  if (!idsParam || !idsParam.trim()) return Response.json({ error: "缺少规则编号。" }, { status: 400 });
  const ids = [...new Set(idsParam.split(",").map((item) => item.trim()).filter(Boolean))];
  if (ids.length === 0) return Response.json({ error: "缺少规则编号。" }, { status: 400 });
  if (ids.length > MAX_BULK_IDS) return Response.json({ error: `单次最多删除 ${MAX_BULK_IDS} 条规则。` }, { status: 400 });

  const { data, error } = await context.supabase
    .from("moderation_rules")
    .delete()
    .in("id", ids)
    .select("id, pattern");
  if (error) return Response.json({ error: isMissingRulesTable(error) ? "审核规则数据表尚未启用。" : "规则删除失败。" }, { status: isMissingRulesTable(error) ? 503 : 500 });
  if (!data || data.length === 0) return Response.json({ error: "没有找到可删除的规则。" }, { status: 404 });
  await context.supabase.from("admin_audit_logs").insert({
    admin_id: adminId,
    action: "bulk_delete_moderation_rules",
    target_type: "moderation_rules",
    target_id: null,
    note: `批量删除敏感词：${data.length} 条`,
    metadata: { ids, count: data.length },
  });
  return Response.json({ ok: true, deleted: data.length, rules: data });
}
