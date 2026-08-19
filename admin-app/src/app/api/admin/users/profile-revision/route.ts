import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/supabase/admin-server";

export async function POST(request: Request) {
  const { supabase, user } = await getAdminContext();
  if (!user) return NextResponse.json({ error: "请先登录管理员后台" }, { status: 401 });

  const body = await request.json().catch(() => null) as { requestId?: string } | null;
  if (!body?.requestId) {
    return NextResponse.json({ error: "资料整改记录无效" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("admin_confirm_profile_revision", {
    p_request_id: body.requestId,
  });
  const result = data as { ok?: boolean; message?: string } | null;
  if (error || !result?.ok) {
    const raw = error?.message || result?.message || "";
    if (/admin_confirm_profile_revision/.test(raw)) {
      return NextResponse.json({ error: "资料整改确认功能尚未启用，请先执行数据库迁移。" }, { status: 500 });
    }
    return NextResponse.json({ error: result?.message || "资料整改确认失败，请稍后重试。" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: result.message || "资料整改已确认。" });
}
