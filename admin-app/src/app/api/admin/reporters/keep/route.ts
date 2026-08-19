import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/supabase/admin-server";

export async function POST(request: Request) {
  const { supabase, user } = await getAdminContext();
  if (!user) return NextResponse.json({ error: "请先登录管理员后台" }, { status: 401 });
  const body = await request.json().catch(() => null) as { userId?: string; reason?: string } | null;
  if (!body?.userId) return NextResponse.json({ error: "用户参数无效" }, { status: 400 });

  const { data, error } = await supabase.rpc("admin_keep_report_permission", {
    p_user_id: body.userId,
    p_reason: body.reason?.trim() || null,
  });
  const result = data as { ok?: boolean; message?: string } | null;
  if (error || !result?.ok) {
    const raw = error?.message || result?.message || "";
    if (/admin_keep_report_permission/.test(raw)) {
      return NextResponse.json({ error: "保留举报权限功能尚未启用，请先执行举报中心数据库迁移。" }, { status: 500 });
    }
    return NextResponse.json({ error: result?.message || "操作失败，请稍后重试。" }, { status: 500 });
  }
  return NextResponse.json({ success: true, message: result.message || "已确认保留该用户的举报权限。" });
}
