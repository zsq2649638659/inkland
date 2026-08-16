import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/supabase/admin-server";

const contentActions = ["keep", "remind", "delete", "dismiss"] as const;
const userActions = ["no_violation", "convert_content", "profile_revision", "warn", "restrict", "suspend", "ban"] as const;
const allowedActions = [...contentActions, ...userActions] as const;

export async function PATCH(request: Request) {
  const { supabase, user } = await getAdminContext();
  if (!user) return NextResponse.json({ error: "请先登录管理员后台" }, { status: 401 });
  const body = await request.json().catch(() => null) as {
    caseId?: string;
    action?: string;
    note?: string;
    reason?: string;
    options?: Record<string, unknown>;
  } | null;
  if (!body?.caseId || !body.action || !allowedActions.includes(body.action as (typeof allowedActions)[number])) {
    return NextResponse.json({ error: "处理参数无效" }, { status: 400 });
  }
  const isUserAction = (userActions as readonly string[]).includes(body.action);
  const rpcName = isUserAction ? "admin_resolve_user_report_case" : "admin_resolve_report_case";
  const params = isUserAction ? {
    p_case_id: body.caseId,
    p_action: body.action,
    p_reason: body.reason?.trim() || null,
    p_note: body.note?.trim() || null,
    p_options: typeof body.options === "object" && body.options ? body.options : {},
  } : {
    p_case_id: body.caseId,
    p_action: body.action,
    p_note: body.note?.trim() || null,
  };
  const { data, error } = await supabase.rpc(rpcName, params);
  const result = data as { ok?: boolean; message?: string } | null;
  if (error || !result?.ok) {
    const raw = error?.message || result?.message || "";
    if (/admin_resolve_report_case/.test(raw)) {
      return NextResponse.json({ error: isUserAction ? "用户举报处理功能尚未启用，请先执行数据库迁移。" : "举报处理功能尚未启用，请先执行数据库迁移。" }, { status: 500 });
    }
    return NextResponse.json({ error: result?.message || "举报案件处理失败，请稍后重试。" }, { status: 500 });
  }
  return NextResponse.json({ success: true, message: result.message || "举报案件已处理完成。" });
}
