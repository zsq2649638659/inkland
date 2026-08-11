import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/supabase/admin-server";

export async function PATCH(request: Request) {
  const { supabase, user } = await getAdminContext();
  if (!user) return NextResponse.json({ error: "请先登录管理员后台" }, { status: 401 });
  const body = await request.json().catch(() => null) as { reportId?: string; status?: string; source?: string; action?: string } | null;
  if (!body?.reportId || !["resolved", "dismissed"].includes(body.status || "")) return NextResponse.json({ error: "处理参数无效" }, { status: 400 });
  const table = body.source === "comment" ? "comment_reports" : "content_reports";
  const update = { status: body.status, resolved_at: new Date().toISOString(), resolved_by: user.id };
  const { error } = await supabase.from(table).update(update).eq("id", body.reportId);
  if (error) return NextResponse.json({ error: "举报状态更新失败，请确认数据库迁移已执行" }, { status: 500 });
  if (body.status === "resolved" && body.action === "delete_comment" && body.source === "comment") {
    const { data: report } = await supabase.from("comment_reports").select("comment_id").eq("id", body.reportId).maybeSingle();
    if (report?.comment_id) await supabase.from("comments").delete().eq("id", report.comment_id);
  }
  if (body.status === "resolved" && body.action === "delete_post" && body.source !== "comment") {
    const { data: report } = await supabase.from("content_reports").select("target_type, target_id").eq("id", body.reportId).maybeSingle();
    if (report?.target_type === "post") await supabase.from("posts").delete().eq("id", report.target_id);
  }
  await supabase.from("admin_audit_logs").insert({ admin_id: user.id, action: body.status === "resolved" ? "resolve_report" : "dismiss_report", target_type: "report", target_id: body.reportId });
  return NextResponse.json({ success: true });
}
