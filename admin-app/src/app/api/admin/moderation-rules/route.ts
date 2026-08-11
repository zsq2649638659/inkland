import { getAdminContext } from "@/lib/supabase/admin-server";

const categories = new Set([
  "广告与导流",
  "诈骗与交易风险",
  "人身攻击与骚扰",
  "暴力与威胁",
  "成人与不当内容",
  "其他",
]);

function isMissingRulesTable(error: { code?: string; message?: string } | null) {
  return error?.code === "42P01" || error?.message?.includes("moderation_rules") === true;
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
  const severity = body?.severity;
  const description = typeof body?.description === "string" ? body.description.trim() : null;

  if ((ruleType !== "keyword" && ruleType !== "whitelist") || !pattern || pattern.length > 500 || typeof category !== "string" || !categories.has(category) || (severity !== "review" && severity !== "high")) {
    return Response.json({ error: "规则内容不完整或格式不正确。" }, { status: 400 });
  }

  const { data, error } = await context.supabase
    .from("moderation_rules")
    .insert({ rule_type: ruleType, pattern, category, severity: ruleType === "whitelist" ? "review" : severity, description: description || null, created_by: adminId, updated_by: adminId })
    .select("id, rule_type, pattern, category, severity, description, enabled, hit_count, updated_at")
    .single();

  if (error) {
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
  const body = await request.json().catch(() => null) as { id?: unknown; enabled?: unknown } | null;
  if (typeof body?.id !== "string" || typeof body.enabled !== "boolean") return Response.json({ error: "规则状态不正确。" }, { status: 400 });

  const { data, error } = await context.supabase
    .from("moderation_rules")
    .update({ enabled: body.enabled, updated_by: adminId })
    .eq("id", body.id)
    .select("id, rule_type, pattern, category, severity, description, enabled, hit_count, updated_at")
    .maybeSingle();
  if (error) return Response.json({ error: isMissingRulesTable(error) ? "审核规则数据表尚未启用。" : "规则更新失败。" }, { status: isMissingRulesTable(error) ? 503 : 500 });
  if (!data) return Response.json({ error: "找不到这条规则。" }, { status: 404 });
  await context.supabase.from("admin_audit_logs").insert({ admin_id: adminId, action: data.enabled ? "enable_moderation_rule" : "disable_moderation_rule", target_type: "moderation_rule", target_id: data.id, note: data.pattern });
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
