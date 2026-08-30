import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/supabase/admin-server";

const tabs = ["cases", "reporters", "target_users"] as const;
const statuses = ["all", "pending", "reviewing", "kept", "reminded", "deleted", "no_violation", "content_case", "profile_changes", "warned", "restricted", "suspended", "banned"] as const;
const priorities = ["all", "normal", "high", "urgent"] as const;
const targetTypes = ["all", "post", "comment", "user"] as const;

export async function GET(request: Request) {
  const { supabase, user } = await getAdminContext();
  if (!user) return NextResponse.json({ error: "请先登录管理员后台" }, { status: 401 });

  const url = new URL(request.url);
  const tab = url.searchParams.get("tab") || "cases";
  const status = url.searchParams.get("status") || "all";
  const priority = url.searchParams.get("priority") || "all";
  const targetType = url.searchParams.get("targetType") || "all";
  const multiReportRaw = url.searchParams.get("multiReport");
  const suspiciousRaw = url.searchParams.get("suspicious");
  const serviceErrorRaw = url.searchParams.get("serviceError");
  const lowQualityRaw = url.searchParams.get("lowQuality");
  const hiddenRaw = url.searchParams.get("hidden");
  const query = (url.searchParams.get("q") || "").trim().slice(0, 100);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 100), 1), 200);

  if (!tabs.includes(tab as (typeof tabs)[number])
    || !statuses.includes(status as (typeof statuses)[number])
    || !priorities.includes(priority as (typeof priorities)[number])
    || !targetTypes.includes(targetType as (typeof targetTypes)[number])) {
    return NextResponse.json({ error: "筛选参数无效" }, { status: 400 });
  }

  const parseBool = (raw: string | null) => raw === "1" || raw === "true" ? true : null;
  const { data, error } = await supabase.rpc("admin_report_center_v2", {
    p_tab: tab,
    p_status: status,
    p_priority: priority,
    p_target_type: targetType,
    p_multi_report: parseBool(multiReportRaw),
    p_suspicious: parseBool(suspiciousRaw),
    p_service_error: parseBool(serviceErrorRaw),
    p_low_quality: parseBool(lowQualityRaw),
    p_hidden: parseBool(hiddenRaw),
    p_query: query,
    p_limit: limit,
  });
  const result = data as { ok?: boolean; message?: string; cases?: unknown; reporters?: unknown; target_users?: unknown; counts?: unknown; filtered?: unknown } | null;
  if (error || !result?.ok) {
    const raw = error?.message || result?.message || "";
    if (/admin_report_center_v[12]/.test(raw)) {
      return NextResponse.json({ error: "举报中心功能尚未启用，请先执行举报中心数据库迁移。" }, { status: 500 });
    }
    return NextResponse.json({ error: result?.message || "举报中心数据读取失败，请稍后重试。" }, { status: 500 });
  }

  const cases = Array.isArray(result.cases) ? result.cases as Array<Record<string, unknown>> : [];
  const caseIds = cases.map((item) => typeof item.id === "string" ? item.id : "").filter(Boolean);
  const [{ data: caseDetails }, contentReportsResult, commentReportsResult, snapshotsResult] = await Promise.all([
    caseIds.length
      ? supabase.from("moderation_report_cases").select("id, public_id, target_type, target_id, target_user_id").in("id", caseIds)
      : Promise.resolve({ data: [], error: null }),
    caseIds.length
      ? supabase.from("content_reports").select("case_id, reporter_id, created_at, reporter:profiles!content_reports_reporter_id_fkey(nickname, public_id)").in("case_id", caseIds).order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    caseIds.length
      ? supabase.from("comment_reports").select("case_id, reporter_id, created_at, reporter:profiles!comment_reports_reporter_id_fkey(nickname, public_id)").in("case_id", caseIds).order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    caseIds.length
      ? supabase.from("moderation_report_snapshots").select("case_id, post_id, context_snapshot").in("case_id", caseIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  type ReportDetail = { case_id?: string | null; reporter_id?: string | null; created_at?: string | null; reporter?: { nickname?: string | null; public_id?: string | null } | Array<{ nickname?: string | null; public_id?: string | null }> | null };
  const latestReportByCase = new Map<string, { reporterId: string | null; reporterNickname: string | null; reporterCount: number; latestTime: number }>();
  const reportsByCase = new Map<string, Set<string>>();
  for (const report of [...(contentReportsResult.data || []), ...(commentReportsResult.data || [])] as ReportDetail[]) {
    if (!report.case_id) continue;
    const current = latestReportByCase.get(report.case_id) || { reporterId: null, reporterNickname: null, reporterCount: 0, latestTime: 0 };
    const reporterIds = reportsByCase.get(report.case_id) || new Set<string>();
    if (report.reporter_id) reporterIds.add(report.reporter_id);
    reportsByCase.set(report.case_id, reporterIds);
    const nestedReporter = Array.isArray(report.reporter) ? report.reporter[0] : report.reporter;
    const reportTime = report.created_at ? new Date(report.created_at).getTime() : 0;
    if (!current.reporterId || reportTime >= current.latestTime) {
      current.reporterId = report.reporter_id || null;
      current.reporterNickname = nestedReporter?.nickname || null;
      current.latestTime = reportTime;
    }
    current.reporterCount = reporterIds.size;
    latestReportByCase.set(report.case_id, current);
  }

  const snapshotByCase = new Map<string, { postId: string | null; postTitle: string | null }>();
  for (const snapshot of (snapshotsResult.data || []) as Array<{ case_id?: string | null; post_id?: string | null; context_snapshot?: Record<string, unknown> | null }>) {
    if (!snapshot.case_id) continue;
    const title = typeof snapshot.context_snapshot?.post_title === "string" ? snapshot.context_snapshot.post_title : null;
    snapshotByCase.set(snapshot.case_id, { postId: snapshot.post_id || null, postTitle: title });
  }

  const caseDetailMap = new Map((caseDetails || []).map((item) => [item.id, item]));
  const snapshotPostIds = [...new Set([...snapshotByCase.values()].map((item) => item.postId).filter((value): value is string => Boolean(value)))];
  const targetIdsByType = {
    post: [...new Set([
      ...(caseDetails || []).filter((item) => item.target_type === "post").map((item) => item.target_id),
      ...snapshotPostIds,
    ])],
    comment: (caseDetails || []).filter((item) => item.target_type === "comment").map((item) => item.target_id),
    user: (caseDetails || []).filter((item) => item.target_type === "user").map((item) => item.target_id),
  };
  const targetUserIds = [...new Set((caseDetails || []).map((item) => item.target_user_id).filter((value): value is string => Boolean(value)))];
  const [{ data: targetPosts }, { data: targetComments }, { data: targetUsers }, { data: targetUserProfiles }] = await Promise.all([
    targetIdsByType.post.length ? supabase.from("posts").select("id, public_id").in("id", targetIdsByType.post) : Promise.resolve({ data: [] }),
    targetIdsByType.comment.length ? supabase.from("comments").select("id, public_id").in("id", targetIdsByType.comment) : Promise.resolve({ data: [] }),
    targetIdsByType.user.length ? supabase.from("profiles").select("id, public_id").in("id", targetIdsByType.user) : Promise.resolve({ data: [] }),
    targetUserIds.length ? supabase.from("profiles").select("id, public_id").in("id", targetUserIds) : Promise.resolve({ data: [] }),
  ]);
  const targetPublicIdMap = new Map([
    ...(targetPosts || []).map((item) => [item.id, item.public_id] as const),
    ...(targetComments || []).map((item) => [item.id, item.public_id] as const),
    ...(targetUsers || []).map((item) => [item.id, item.public_id] as const),
    ...(targetUserProfiles || []).map((item) => [item.id, item.public_id] as const),
  ]);
  const enrichedCases = cases.map((item) => {
    const caseId = typeof item.id === "string" ? item.id : "";
    const reporter = latestReportByCase.get(caseId);
    const snapshot = snapshotByCase.get(caseId);
    const detail = caseDetailMap.get(caseId);
    const nestedReporter = reporter?.reporterId
      ? [...(contentReportsResult.data || []), ...(commentReportsResult.data || [])].find((row) => row.reporter_id === reporter.reporterId)?.reporter
      : null;
    const reporterProfile = Array.isArray(nestedReporter) ? nestedReporter[0] : nestedReporter;
    return {
      ...item,
      public_id: item.public_id || detail?.public_id || null,
      target_public_id: targetPublicIdMap.get(String(item.target_id || detail?.target_id || "")) || null,
      target_user_public_id: (detail?.target_user_id || String(item.target_user_id || "")) ? targetPublicIdMap.get(detail?.target_user_id || String(item.target_user_id || "")) || null : null,
      ...(reporter ? {
        reporter_count: reporter.reporterCount,
        latest_reporter_id: reporter.reporterId,
        latest_reporter_nickname: reporter.reporterNickname,
        latest_reporter_public_id: reporterProfile?.public_id || null,
      } : {}),
      ...(snapshot ? {
        snapshot_post_id: snapshot.postId,
        snapshot_post_public_id: snapshot.postId ? targetPublicIdMap.get(snapshot.postId) || null : null,
        snapshot_post_title: snapshot.postTitle,
      } : {}),
    };
  });
  return NextResponse.json({
    success: true,
    cases: enrichedCases,
    reporters: result.reporters || [],
    targetUsers: result.target_users || [],
    counts: result.counts || {},
    filtered: result.filtered || { cases: 0, reporters: 0, target_users: 0 },
  });
}
