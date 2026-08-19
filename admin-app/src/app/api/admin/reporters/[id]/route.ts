import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/supabase/admin-server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await getAdminContext();
  if (!user) return NextResponse.json({ error: "请先登录管理员后台" }, { status: 401 });
  const { id } = await params;
  if (!uuidPattern.test(id)) return NextResponse.json({ error: "用户 ID 无效" }, { status: 400 });

  const { data, error } = await supabase.rpc("admin_reporter_detail_v1", { p_user_id: id });
  const result = data as { ok?: boolean; message?: string; code?: string } | null;
  if (error || !result?.ok) {
    const raw = error?.message || result?.message || "";
    if (/admin_reporter_detail_v1/.test(raw)) {
      return NextResponse.json({ error: "举报者风险页功能尚未启用，请先执行举报中心数据库迁移。" }, { status: 500 });
    }
    if (result?.code === "user_missing") {
      return NextResponse.json({ error: "没有找到该用户。" }, { status: 404 });
    }
    return NextResponse.json({ error: result?.message || "举报者风险数据读取失败，请稍后重试。" }, { status: 500 });
  }
  return NextResponse.json({ detail: result });
}
