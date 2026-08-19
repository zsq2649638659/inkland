import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/supabase/admin-server";

export async function POST(request: Request) {
  const { supabase, user } = await getAdminContext();
  if (!user) return NextResponse.json({ error: "请先登录管理员后台" }, { status: 401 });
  const body = await request.json().catch(() => null) as { userId?: string; lowQuality?: boolean; reason?: string } | null;
  if (!body?.userId || typeof body.lowQuality !== "boolean") {
    return NextResponse.json({ error: "处理参数无效" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("admin_set_reporter_low_quality", {
    p_user_id: body.userId,
    p_low_quality: body.lowQuality,
    p_reason: body.reason?.trim() || null,
  });
  const result = data as { ok?: boolean; message?: string } | null;
  if (error || !result?.ok) {
    const raw = error?.message || result?.message || "";
    if (/admin_set_reporter_low_quality/.test(raw)) {
      return NextResponse.json({ error: "低质量队列功能尚未启用，请先执行举报中心数据库迁移。" }, { status: 500 });
    }
    return NextResponse.json({ error: result?.message || "操作失败，请稍后重试。" }, { status: 500 });
  }
  return NextResponse.json({ success: true, message: result.message || "低质量队列已更新。" });
}
