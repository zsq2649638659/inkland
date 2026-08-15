import { notFound, redirect } from "next/navigation";
import { getAdminContext } from "@/lib/supabase/admin-server";
import ReportDetailClient from "./ReportDetailClient";

export const metadata = { title: "举报案件详情 — Inkland 管理后台", robots: { index: false, follow: false } };

export default async function ReportCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getAdminContext();
  if (!user) redirect("/admin/login");

  const [{ data: reportCase }, { data: snapshot }, contentReportsResult, commentReportsResult] = await Promise.all([
    supabase.from("moderation_report_cases").select("id, target_type, target_id, target_user_id, status, priority, outcome, primary_reason_category, report_count, first_reported_at, last_reported_at, created_at, resolved_by, resolved_at, metadata").eq("id", id).maybeSingle(),
    supabase.from("moderation_report_snapshots").select("target_type, target_id, author_id, post_id, object_snapshot, context_snapshot, captured_at").eq("case_id", id).maybeSingle(),
    supabase.from("content_reports").select("id, target_type, target_id, reporter_id, reason, reason_category, details, evidence, status, created_at, reporter:profiles!content_reports_reporter_id_fkey(nickname)").eq("case_id", id).order("created_at", { ascending: true }),
    supabase.from("comment_reports").select("id, comment_id, reporter_id, reason, reason_category, details, evidence, status, created_at, reporter:profiles!comment_reports_reporter_id_fkey(nickname)").eq("case_id", id).order("created_at", { ascending: true }),
  ]);

  if (reportCase === null || reportCase === undefined) {
    if ((contentReportsResult.error || commentReportsResult.error)?.message?.includes("case_id")) {
      notFound();
    }
  }
  if (!reportCase) notFound();

  const reportRows = [
    ...((contentReportsResult.data || []).map((report) => ({ ...report, kind: "content" as const }))),
    ...((commentReportsResult.data || []).map((report) => ({ ...report, kind: "comment" as const }))),
  ].sort((a, b) => a.created_at.localeCompare(b.created_at));

  let reporterStats: Array<{ user_id: string; total_reports: number; valid_reports: number; invalid_reports: number; reports_last_24h: number; report_restricted_until?: string | null }> = [];
  const reporterIds = [...new Set(reportRows.map((report) => report.reporter_id).filter((value): value is string => Boolean(value)))];
  if (reporterIds.length) {
    const { data: stats } = await supabase.from("user_reporter_stats").select("user_id, total_reports, valid_reports, invalid_reports, reports_last_24h, report_restricted_until").in("user_id", reporterIds);
    reporterStats = (stats || []) as typeof reporterStats;
  }

  const targetUserId = reportCase.target_user_id || snapshot?.author_id || null;
  let violations: Array<{ id: string; source_type: string; content_type: string | null; category: string; severity: string; summary: string | null; status: string; confirmed_at: string }> = [];
  if (targetUserId) {
    const { data } = await supabase.from("user_violations").select("id, source_type, content_type, category, severity, summary, status, confirmed_at").eq("user_id", targetUserId).order("confirmed_at", { ascending: false }).limit(30);
    violations = (data || []) as typeof violations;
  }

  return <ReportDetailClient
    reportCase={reportCase as never}
    snapshot={snapshot as never}
    reports={reportRows as never}
    violations={violations as never}
    reporterStats={reporterStats as never}
  />;
}
