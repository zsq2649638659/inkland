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
  const users = (Array.isArray(result.users) ? result.users : []) as Array<Record<string, unknown> & { id: string; created_at?: string | null }>;
  const ids = users.map((item) => item.id).filter(Boolean);
  const [{ data: profiles }, { data: reporterStats }] = await Promise.all([
    ids.length ? supabase.from("profiles").select("id, public_id, moderation_note, moderated_at").in("id", ids) : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("user_reporter_stats").select("user_id, total_reports, last_report_at").in("user_id", ids) : Promise.resolve({ data: [] }),
  ]);
  const profileMap = new Map((profiles || []).map((item) => [item.id, item]));
  const reporterMap = new Map((reporterStats || []).map((item) => [item.user_id, item]));
  const enrichedUsers = users.map((item) => {
    const profile = profileMap.get(item.id);
    const reporter = reporterMap.get(item.id);
    const activityValues = [reporter?.last_report_at, profile?.moderated_at, item.created_at].filter((value): value is string => Boolean(value));
    const activityAt = activityValues.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || item.created_at || null;
    return {
      ...item,
      moderation_note: profile?.moderation_note || null,
      moderated_at: profile?.moderated_at || null,
      total_reports: reporter?.total_reports || 0,
      last_report_at: reporter?.last_report_at || null,
      activity_at: activityAt,
    };
  });
  return NextResponse.json({ users: enrichedUsers });
}
