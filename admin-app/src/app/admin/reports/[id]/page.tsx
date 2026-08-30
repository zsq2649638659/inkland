import { notFound, redirect } from "next/navigation";
import { getAdminContext } from "@/lib/supabase/admin-server";
import ReportDetailClient from "./ReportDetailClient";

export const metadata = { title: "举报案件详情 — Inkland 管理后台", robots: { index: false, follow: false } };

type UserDetailPayload = {
  ok: boolean;
  user: {
    id: string;
    public_id?: string | null;
    nickname?: string | null;
    avatar_url?: string | null;
    bio?: string | null;
    created_at?: string | null;
    moderation_status?: string | null;
    moderation_note?: string | null;
    moderated_at?: string | null;
  };
  stats: {
    total_report_cases: number;
    pending_report_cases: number;
    active_violations: number;
    total_violations: number;
    deleted_items: number;
    active_restrictions: number;
    published_posts_count?: number | null;
    following_count?: number | null;
    followers_count?: number | null;
  };
  recent_posts: Array<{
    id: string;
    public_id?: string | null;
    title?: string | null;
    post_type?: string | null;
    status?: string | null;
    review_status?: string | null;
    visibility?: string | null;
    published_at?: string | null;
    created_at?: string | null;
  }>;
  recent_comments: Array<{
    id: string;
    public_id?: string | null;
    post_id?: string | null;
    parent_id?: string | null;
    content?: string | null;
    created_at?: string | null;
  }>;
  violations: Array<{
    id: string;
    public_id?: string | null;
    source_type?: string | null;
    content_type?: string | null;
    category?: string | null;
    severity?: string | null;
    summary?: string | null;
    status?: string | null;
    confirmed_at?: string | null;
    revoked_at?: string | null;
    metadata?: Record<string, unknown> | null;
  }>;
  restrictions: Array<{
    id: string;
    restriction_type?: string | null;
    status?: string | null;
    reason?: string | null;
    starts_at?: string | null;
    ends_at?: string | null;
    lifted_at?: string | null;
    created_at?: string | null;
    metadata?: Record<string, unknown> | null;
  }>;
  reporter_stats: Record<string, unknown> | null;
};

type ReporterDetailPayload = {
  ok: boolean;
  target_distribution: Array<{
    target_type?: string | null;
    target_id?: string | null;
    target_title?: string | null;
    target_user_id?: string | null;
    target_nickname?: string | null;
    count?: number;
    last_at?: string | null;
  }>;
  focused_target: { target_user_id: string; nickname?: string | null; count: number } | null;
};

type ProfileRevisionRow = {
  id: string;
  public_id?: string | null;
  case_id?: string | null;
  issue_type: string;
  issue_detail?: string | null;
  original_profile?: Record<string, unknown> | null;
  hidden_fields?: unknown;
  status?: string | null;
  confirmed_by?: string | null;
  confirmed_at?: string | null;
  created_at?: string | null;
};

export type ReportOperationRecord = {
  case_id: string;
  case?: Record<string, unknown> | null;
  snapshot?: Record<string, unknown> | null;
  reports?: Array<Record<string, unknown>>;
  reporter_stats?: Array<Record<string, unknown>>;
  violations?: Array<Record<string, unknown>>;
  restrictions?: Array<Record<string, unknown>>;
  profile_revisions?: Array<Record<string, unknown>>;
  notifications?: Array<Record<string, unknown>>;
  audit_logs?: Array<Record<string, unknown>>;
};

export default async function ReportCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getAdminContext();
  if (!user) redirect("/admin/login");

  const [{ data: reportCase }, { data: snapshot }, contentReportsResult, commentReportsResult] = await Promise.all([
    supabase.from("moderation_report_cases").select("id, public_id, target_type, target_id, target_user_id, status, priority, outcome, primary_reason_category, report_count, first_reported_at, last_reported_at, created_at, resolved_by, resolved_at, metadata, auto_review_risk, risk_score, suspicious_report, low_quality_queue, hidden_for_review, review_basis").eq("id", id).maybeSingle(),
    supabase.from("moderation_report_snapshots").select("target_type, target_id, author_id, post_id, object_snapshot, context_snapshot, captured_at").eq("case_id", id).maybeSingle(),
    supabase.from("content_reports").select("id, public_id, target_type, target_id, reporter_id, reason, reason_category, details, evidence, status, created_at, reporter:profiles!content_reports_reporter_id_fkey(nickname, public_id)").eq("case_id", id).order("created_at", { ascending: true }),
    supabase.from("comment_reports").select("id, public_id, comment_id, reporter_id, reason, reason_category, details, evidence, status, created_at, reporter:profiles!comment_reports_reporter_id_fkey(nickname, public_id)").eq("case_id", id).order("created_at", { ascending: true }),
  ]);

  if (reportCase === null || reportCase === undefined) {
    if ((contentReportsResult.error || commentReportsResult.error)?.message?.includes("case_id")) {
      notFound();
    }
  }
  if (!reportCase) notFound();

  const targetPublicIdResult = reportCase.target_type === "post"
    ? await supabase.from("posts").select("public_id").eq("id", reportCase.target_id).maybeSingle()
    : reportCase.target_type === "comment"
      ? await supabase.from("comments").select("public_id").eq("id", reportCase.target_id).maybeSingle()
      : await supabase.from("profiles").select("public_id").eq("id", reportCase.target_id).maybeSingle();
  const targetUserIdForDisplay = reportCase.target_user_id || snapshot?.author_id || null;
  const { data: targetUserPublic } = targetUserIdForDisplay
    ? await supabase.from("profiles").select("public_id").eq("id", targetUserIdForDisplay).maybeSingle()
    : { data: null };
  const reportCaseWithPublicIds = {
    ...reportCase,
    target_public_id: targetPublicIdResult.data?.public_id || null,
    target_user_public_id: targetUserPublic?.public_id || null,
  };

  const reportRows = [
    ...((contentReportsResult.data || []).map((report) => ({ ...report, kind: "content" as const }))),
    ...((commentReportsResult.data || []).map((report) => ({ ...report, kind: "comment" as const }))),
  ].sort((a, b) => a.created_at.localeCompare(b.created_at));

  let reporterStats: Array<{
    user_id: string;
    total_reports: number;
    valid_reports: number;
    invalid_reports: number;
    reports_last_24h: number;
    reports_last_30d?: number | null;
    malicious_report_count?: number | null;
    report_restriction_count?: number | null;
    last_report_at?: string | null;
    report_restricted_until?: string | null;
    metadata?: Record<string, unknown> | null;
  }> = [];
  const reporterIds = [...new Set(reportRows.map((report) => report.reporter_id).filter((value): value is string => Boolean(value)))];
  if (reporterIds.length) {
    const { data: stats } = await supabase.from("user_reporter_stats").select("user_id, total_reports, valid_reports, invalid_reports, reports_last_24h, reports_last_30d, malicious_report_count, report_restriction_count, last_report_at, report_restricted_until, metadata").in("user_id", reporterIds);
    reporterStats = (stats || []) as typeof reporterStats;
  }

  const targetUserId = reportCase.target_user_id || snapshot?.author_id || null;
  let violations: Array<{ id: string; source_type: string; content_type: string | null; category: string; severity: string; summary: string | null; status: string; confirmed_at: string; metadata?: Record<string, unknown> | null }> = [];
  if (targetUserId) {
    const { data } = await supabase.from("user_violations").select("id, public_id, source_type, content_type, category, severity, summary, status, confirmed_at, metadata").eq("user_id", targetUserId).order("confirmed_at", { ascending: false }).limit(30);
    violations = (data || []) as typeof violations;
  }

  let userContent: Array<{ id: string; public_id?: string | null; type: "post" | "comment"; title: string; snippet: string; created_at: string }> = [];
  let userDetail: UserDetailPayload | null = null;
  let profileRevisions: ProfileRevisionRow[] = [];
  let targetReporterDetail: ReporterDetailPayload | null = null;
  let operationRecord: ReportOperationRecord | null = null;
  if (targetUserId && reportCase.target_type === "user") {
    const [{ data: posts }, { data: comments }, userDetailResult, revisionResult, reporterDetailResult, publishedPostsCountResult, followingCountResult, followersCountResult] = await Promise.all([
      supabase.from("posts").select("id, public_id, title, content, created_at").eq("user_id", targetUserId).order("created_at", { ascending: false }).limit(20),
      supabase.from("comments").select("id, public_id, content, created_at, post_id").eq("user_id", targetUserId).order("created_at", { ascending: false }).limit(20),
      supabase.rpc("admin_user_detail", { p_user_id: targetUserId }),
      supabase.from("profile_revision_requests").select("id, public_id, case_id, issue_type, issue_detail, original_profile, hidden_fields, status, confirmed_by, confirmed_at, created_at").eq("user_id", targetUserId).order("created_at", { ascending: false }).limit(20),
      supabase.rpc("admin_reporter_detail_v1", { p_user_id: targetUserId }),
      supabase.from("posts").select("id", { count: "exact", head: true }).eq("user_id", targetUserId).eq("status", "published"),
      supabase.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", targetUserId),
      supabase.from("follows").select("id", { count: "exact", head: true }).eq("following_id", targetUserId),
    ]);
    const { data: targetProfile } = await supabase.from("profiles").select("public_id").eq("id", targetUserId).maybeSingle();
    const postIds = [...new Set((comments || []).map((comment) => comment.post_id).filter((value): value is string => Boolean(value)))];
    const titleMap: Record<string, string> = {};
    if (postIds.length) {
      const { data: postTitles } = await supabase.from("posts").select("id, title").in("id", postIds);
      for (const post of postTitles || []) titleMap[post.id] = post.title || "未知作品";
    }
    const strip = (value: string) => value.replace(/!\[[^\]]*\]\([^)]+\)/g, "").trim();
    userContent = [
      ...(posts || []).map((post) => ({ id: post.id, public_id: post.public_id, type: "post" as const, title: post.title || "未命名作品", snippet: strip(post.content || "").slice(0, 160), created_at: post.created_at })),
      ...(comments || []).map((comment) => ({ id: comment.id, public_id: comment.public_id, type: "comment" as const, title: `评论于《${titleMap[comment.post_id] || "未知作品"}》`, snippet: strip(comment.content || "").slice(0, 160), created_at: comment.created_at })),
    ].sort((a, b) => b.created_at.localeCompare(a.created_at));
    const ud = userDetailResult.data as UserDetailPayload | null;
    userDetail = ud && ud.ok ? {
      ...ud,
      user: { ...ud.user, public_id: targetProfile?.public_id || ud.user.public_id },
      stats: {
        ...ud.stats,
        published_posts_count: publishedPostsCountResult.error ? null : publishedPostsCountResult.count ?? 0,
        following_count: followingCountResult.error ? null : followingCountResult.count ?? 0,
        followers_count: followersCountResult.error ? null : followersCountResult.count ?? 0,
      },
    } : null;
    profileRevisions = (revisionResult.data || []) as ProfileRevisionRow[];
    const rd = reporterDetailResult.data as ReporterDetailPayload | null;
    targetReporterDetail = rd && rd.ok ? rd : null;
  }

  const operationRecordResult = await supabase.rpc("admin_report_operation_record_v1", { p_case_id: id });
  const operationRecordPayload = operationRecordResult.data as { ok?: boolean } | null;
  if (operationRecordPayload?.ok) {
    operationRecord = operationRecordResult.data as unknown as ReportOperationRecord;
  }

  return <ReportDetailClient
    reportCase={reportCaseWithPublicIds as never}
    snapshot={snapshot as never}
    reports={reportRows as never}
    violations={violations as never}
    reporterStats={reporterStats as never}
    userContent={userContent}
    userDetail={userDetail as never}
    profileRevisions={profileRevisions as never}
    targetReporterDetail={targetReporterDetail as never}
    operationRecord={operationRecord as never}
    adminInitial={user.email?.slice(0, 1).toUpperCase() || "A"}
  />;
}
