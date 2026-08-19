import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/supabase/admin-server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await getAdminContext();
  if (!user) return NextResponse.json({ error: "请先登录管理员后台" }, { status: 401 });
  const { id } = await params;
  const { data, error } = await supabase.rpc("admin_user_detail", { p_user_id: id });
  const result = data as { ok?: boolean; message?: string; user?: unknown } | null;
  if (error || !result?.ok) {
    const raw = error?.message || result?.message || "";
    if (/admin_user_detail/.test(raw)) {
      return NextResponse.json({ error: "用户详情功能尚未启用，请先执行模块6数据库迁移。" }, { status: 500 });
    }
    return NextResponse.json({ error: result?.message || "用户详情读取失败，请稍后重试。" }, { status: 500 });
  }
  if (!result.user) return NextResponse.json({ error: "没有找到该用户。" }, { status: 404 });
  return NextResponse.json({ detail: result });
}
