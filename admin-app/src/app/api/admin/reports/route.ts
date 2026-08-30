import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/supabase/admin-server";

const contentActions = ["keep", "remind", "delete", "dismiss"] as const;
const userActions = ["no_violation", "convert_content", "profile_revision", "warn", "restrict", "suspend", "ban"] as const;
const allowedActions = [...contentActions, ...userActions, "mark_suspicious", "temporary_hide", "restore"] as const;

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
  if (body.action === "mark_suspicious") {
    const { data, error } = await supabase.rpc("admin_mark_report_case_suspicious", {
      p_case_id: body.caseId,
      p_reason: body.reason?.trim() || null,
    });
    const result = data as { ok?: boolean; message?: string } | null;
    if (error || !result?.ok) {
      const raw = error?.message || result?.message || "";
      if (/admin_mark_report_case_suspicious/.test(raw)) {
        return NextResponse.json({ error: "标记恶意举报功能尚未启用，请先执行数据库迁移。" }, { status: 500 });
      }
      return NextResponse.json({ error: result?.message || "标记恶意举报失败，请稍后重试。" }, { status: 500 });
    }
    return NextResponse.json({ success: true, message: result.message || "该案件已标记为恶意举报。" });
  }
  if (body.action === "temporary_hide" || body.action === "restore") {
    const hidden = body.action === "temporary_hide";
    if (hidden && !body.reason?.trim()) {
      return NextResponse.json({ error: "请填写隐藏原因。" }, { status: 400 });
    }
    const { data, error } = await supabase.rpc("admin_toggle_report_temporary_hide", {
      p_case_id: body.caseId,
      p_hidden: hidden,
      p_reason: body.reason?.trim() || null,
    });
    const result = data as { ok?: boolean; message?: string } | null;
    if (error || !result?.ok) {
      const raw = error?.message || result?.message || "";
      if (/admin_toggle_report_temporary_hide/.test(raw)) {
        return NextResponse.json({ error: "暂时隐藏功能尚未启用，请先执行数据库迁移。" }, { status: 500 });
      }
      return NextResponse.json({ error: result?.message || (hidden ? "暂时隐藏失败，请稍后重试。" : "恢复展示失败，请稍后重试。") }, { status: 500 });
    }
    return NextResponse.json({ success: true, message: result.message || (hidden ? "该内容已暂时隐藏。" : "该内容已恢复公开展示。") });
  }
  const isUserAction = (userActions as readonly string[]).includes(body.action);
  if (!isUserAction && ["dismiss", "remind", "delete"].includes(body.action) && !body.reason?.trim()) {
    return NextResponse.json({ error: "请填写处理原因。" }, { status: 400 });
  }
  const rpcName = isUserAction ? "admin_resolve_user_report_case" : "admin_resolve_report_case";
  const contentNote = [body.reason?.trim(), body.note?.trim()].filter(Boolean).join("；") || null;
  const params = isUserAction ? {
    p_case_id: body.caseId,
    p_action: body.action,
    p_reason: body.reason?.trim() || null,
    p_note: body.note?.trim() || null,
    p_options: typeof body.options === "object" && body.options ? body.options : {},
  } : {
    p_case_id: body.caseId,
    p_action: body.action,
    p_note: contentNote,
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
