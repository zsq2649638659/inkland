import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/supabase/admin-server";
import AdminDashboard, { type AdminView } from "./AdminDashboard";

export const metadata = { title: "管理后台 — inkland", robots: { index: false, follow: false } };

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const allowedViews: AdminView[] = ["reviews", "reports", "users", "feedbacks", "rules"];
  const initialView: AdminView = allowedViews.includes(view as AdminView) ? (view as AdminView) : "reviews";
  const { supabase, user, account } = await getAdminContext();
  if (!user || !account) redirect("/admin/login");
  const [reviewCasesResult, reportsResult, commentReportsResult, feedbacksResult, rulesResult] = await Promise.all([
    supabase.from("moderation_review_cases").select("id, post_id, post_version_id, status, priority, route_reason, screening_status, screening_sources, submission_number, created_at, updated_at").in("status", ["pending", "reviewing", "service_error"]).order("created_at", { ascending: false }).limit(100),
    supabase.from("content_reports").select("id, target_type, target_id, reporter_id, reason, status, created_at, reporter:profiles!content_reports_reporter_id_fkey(nickname)").in("status", ["pending", "reviewing"]).order("created_at", { ascending: false }).limit(50),
    supabase.from("comment_reports").select("id, comment_id, reporter_id, reason, status, created_at, reporter:profiles!comment_reports_reporter_id_fkey(nickname), comment:comments!comment_reports_comment_id_fkey(id, content, user_id, author:profiles!comments_user_id_fkey(nickname), post:posts!comments_post_id_fkey(id, title))").in("status", ["pending", "reviewing"]).order("created_at", { ascending: false }).limit(50),
    supabase.from("feedbacks").select("id, type, content, status, created_at, user_id").in("status", ["pending", "reviewing"]).order("created_at", { ascending: false }).limit(50),
    supabase.from("moderation_rules").select("id, rule_type, pattern, category, severity, description, enabled, hit_count, updated_at").order("created_at", { ascending: false }).limit(200),
  ]);
  const reviewCases = reviewCasesResult.data || [];
  const versionIds = [...new Set(reviewCases.map((reviewCase) => reviewCase.post_version_id).filter(Boolean))];
  const postIds = [...new Set(reviewCases.map((reviewCase) => reviewCase.post_id).filter(Boolean))];
  const caseIds = reviewCases.map((reviewCase) => reviewCase.id);
  const [{ data: reviewVersions }, { data: reviewPosts }, { data: caseFindings }] = await Promise.all([
    versionIds.length ? supabase.from("post_versions").select("id, post_id, version_number, submission_number, title, post_type, content_rating, visibility, submitted_at, created_at").in("id", versionIds) : Promise.resolve({ data: [] }),
    postIds.length ? supabase.from("posts").select("id, user_id, title, post_type, content_rating, status, review_submission_number, author:profiles!posts_user_id_fkey(nickname)").in("id", postIds) : Promise.resolve({ data: [] }),
    caseIds.length ? supabase.from("moderation_findings").select("id, review_case_id").in("review_case_id", caseIds) : Promise.resolve({ data: [] }),
  ]);
  const versionMap = new Map((reviewVersions || []).map((version) => [version.id, version]));
  const postMap = new Map((reviewPosts || []).map((post) => [post.id, post]));
  const findingsByCase = new Map<string, number>();
  for (const finding of caseFindings || []) {
    findingsByCase.set(finding.review_case_id, (findingsByCase.get(finding.review_case_id) || 0) + 1);
  }
  const reviewItems = reviewCases.map((reviewCase) => ({
    id: reviewCase.id,
    post_id: reviewCase.post_id,
    post_version_id: reviewCase.post_version_id,
    status: reviewCase.status,
    priority: reviewCase.priority,
    route_reason: reviewCase.route_reason,
    screening_status: reviewCase.screening_status,
    screening_sources: reviewCase.screening_sources,
    submission_number: reviewCase.submission_number,
    created_at: reviewCase.created_at,
    updated_at: reviewCase.updated_at,
    version: versionMap.get(reviewCase.post_version_id) || null,
    post: postMap.get(reviewCase.post_id) || null,
    findings_count: findingsByCase.get(reviewCase.id) || 0,
  }));
  const postReportIds = (reportsResult.data || []).filter((report) => report.target_type === "post").map((report) => report.target_id);
  const userReportIds = (reportsResult.data || []).filter((report) => report.target_type === "user").map((report) => report.target_id);
  const [{ data: reportedPosts }, { data: reportedUsers }] = await Promise.all([
    postReportIds.length ? supabase.from("posts").select("id, title, content, post_type, user_id, author:profiles!posts_user_id_fkey(nickname)").in("id", postReportIds) : Promise.resolve({ data: [] }),
    userReportIds.length ? supabase.from("profiles").select("id, nickname, bio").in("id", userReportIds) : Promise.resolve({ data: [] }),
  ]);
  const reportedPostMap = new Map((reportedPosts || []).map((post) => [post.id, post]));
  const userMap = new Map((reportedUsers || []).map((profile) => [profile.id, profile]));
  const enrichedContentReports = (reportsResult.data || []).map((report) => ({ ...report, target: report.target_type === "post" ? reportedPostMap.get(report.target_id) : userMap.get(report.target_id), source: "content" }));
  return <AdminDashboard adminName={account.display_name || "管理员"}
    adminEmail={account.email}
    initialView={initialView}
    initialReviews={reviewItems as never[]}
    initialReports={[...enrichedContentReports, ...((commentReportsResult.data || []).map((report) => ({ ...report, target_type: "comment", target_id: report.comment_id, source: "comment" })) || [])] as never[]}
    initialFeedbacks={(feedbacksResult.data || []) as never[]}
    initialRules={(rulesResult.data || []) as never[]}
    rulesReady={!rulesResult.error}
    loadErrors={[reviewCasesResult.error?.message, reportsResult.error?.message, commentReportsResult.error?.message, feedbacksResult.error?.message].filter(Boolean) as string[]}
  />;
}
