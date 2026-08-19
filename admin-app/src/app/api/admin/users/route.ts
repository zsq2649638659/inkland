import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/supabase/admin-server";

export async function GET(request: Request) {
  const { supabase, user } = await getAdminContext();
  if (!user) return NextResponse.json({ error: "请先登录管理员后台" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query") || "";
  const limit = Number(searchParams.get("limit") || 50);
  const { data, error } = await supabase.rpc("admin_user_search", {
    p_query: query,
    p_limit: Number.isFinite(limit) ? limit : 50,
  });
  const result = data as { ok?: boolean; users?: unknown[]; message?: string } | null;
  if (error || !result?.ok) {
    const raw = error?.message || result?.message || "";
    if (/admin_user_search/.test(raw)) {
      return NextResponse.json({ error: "用户管理功能尚未启用，请先执行模块6数据库迁移。" }, { status: 500 });
    }
    return NextResponse.json({ error: result?.message || "用户搜索失败，请稍后重试。" }, { status: 500 });
  }
  return NextResponse.json({ users: result.users || [] });
}
