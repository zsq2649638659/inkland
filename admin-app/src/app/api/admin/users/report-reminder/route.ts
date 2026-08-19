import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/supabase/admin-server";

export async function POST(request: Request) {
  const { supabase, user } = await getAdminContext();
  if (!user) return NextResponse.json({ error: "请先登录管理员后台" }, { status: 401 });

  const body = await request.json().catch(() => null) as { userId?: string; reason?: string } | null;
  if (!body?.userId) return NextResponse.json({ error: "用户 ID 不能为空。" }, { status: 400 });
  if (!body.reason?.trim()) return NextResponse.json({ error: "请填写提醒内容。" }, { status: 400 });

  const { data, error } = await supabase.rpc("admin_send_report_rule_reminder", {
    p_user_id: body.userId,
    p_reason: body.reason.trim(),
  });
  const result = data as { ok?: boolean; message?: string } | null;
  if (error || !result?.ok) {
    const raw = error?.message || result?.message || "";
    if (/admin_send_report_rule_reminder/.test(raw)) {
      return NextResponse.json({ error: "举报规则提醒功能尚未启用，请先执行模块7数据库迁移。" }, { status: 500 });
    }
    return NextResponse.json({ error: result?.message || "提醒发送失败，请稍后重试。" }, { status: 500 });
  }
  return NextResponse.json({ success: true, message: result.message || "举报规则提醒已发送。" });
}
