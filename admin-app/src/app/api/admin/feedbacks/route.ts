import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/supabase/admin-server";

export async function PATCH(request: Request) {
  const { supabase, user } = await getAdminContext();
  if (!user) return NextResponse.json({ error: "请先登录管理员后台" }, { status: 401 });
  const body = await request.json().catch(() => null) as { feedbackId?: string; status?: string } | null;
  if (!body?.feedbackId || body.status !== "resolved") return NextResponse.json({ error: "处理参数无效" }, { status: 400 });
  const { error } = await supabase.from("feedbacks").update({ status: body.status }).eq("id", body.feedbackId);
  if (error) return NextResponse.json({ error: "反馈状态更新失败，请确认反馈表和 RLS 已配置" }, { status: 500 });
  await supabase.from("admin_audit_logs").insert({ admin_id: user.id, action: "resolve_feedback", target_type: "feedback", target_id: body.feedbackId });
  return NextResponse.json({ success: true });
}
