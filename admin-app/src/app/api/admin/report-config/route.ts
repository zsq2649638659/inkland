import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/supabase/admin-server";

export async function GET() {
  const { supabase, user } = await getAdminContext();
  if (!user) return NextResponse.json({ error: "请先登录管理员后台" }, { status: 401 });

  const { data, error } = await supabase.rpc("admin_get_report_limit");
  const result = data as { ok?: boolean; daily_report_limit?: number; message?: string } | null;
  if (error || !result?.ok) {
    const raw = error?.message || result?.message || "";
    if (/admin_get_report_limit/.test(raw)) {
      return NextResponse.json({ error: "举报上限配置功能尚未启用，请先执行模块7数据库迁移。" }, { status: 500 });
    }
    return NextResponse.json({ error: result?.message || "举报上限读取失败，请稍后重试。" }, { status: 500 });
  }
  return NextResponse.json({ success: true, dailyReportLimit: result.daily_report_limit ?? 20 });
}

export async function PATCH(request: Request) {
  const { supabase, user } = await getAdminContext();
  if (!user) return NextResponse.json({ error: "请先登录管理员后台" }, { status: 401 });

  const body = await request.json().catch(() => null) as { dailyReportLimit?: unknown } | null;
  const limit = Number(body?.dailyReportLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    return NextResponse.json({ error: "每日举报上限需为 1 到 1000 之间的整数。" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("admin_update_report_limit", { p_limit: limit });
  const result = data as { ok?: boolean; daily_report_limit?: number; message?: string } | null;
  if (error || !result?.ok) {
    const raw = error?.message || result?.message || "";
    if (/admin_update_report_limit/.test(raw)) {
      return NextResponse.json({ error: "举报上限配置功能尚未启用，请先执行模块7数据库迁移。" }, { status: 500 });
    }
    return NextResponse.json({ error: result?.message || "举报上限更新失败，请稍后重试。" }, { status: 500 });
  }
  return NextResponse.json({ success: true, dailyReportLimit: result.daily_report_limit ?? limit, message: result.message || "每日举报上限已更新。" });
}
