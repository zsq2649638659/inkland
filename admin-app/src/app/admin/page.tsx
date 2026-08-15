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
  const [reviewCasesResult, reportCasesResult, feedbacksResult, rulesResult] = await Promise.all([
    supabase.from("moderation_review_cases").select("id, post_id, post_version_id, status, priority, route_reason, screening_status, screening_sources, submission_number, created_at, updated_at").in("status", ["pending", "reviewing", "service_error"]).order("created_at", { ascending: false }).limit(100),
    supabase.from("moderation_report_cases").select("id, target_type, target_id, target_user_id, status, priority, outcome, primary_reason_category, report_count, first_reported_at, last_reported_at, created_at").in("status", ["pending", "reviewing"]).order("last_reported_at", { ascending: false }).limit(50),
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
  const reportCaseIds = (reportCasesResult.data || []).map((item) => item.id);
  const { data: reportSnapshots } = reportCaseIds.length
    ? await supabase.from("moderation_report_snapshots").select("case_id, object_snapshot, context_snapshot").in("case_id", reportCaseIds)
    : { data: [] };
  const snapshotMap = new Map((reportSnapshots || []).map((snapshot) => [snapshot.case_id, snapshot]));
  const reportCases = (reportCasesResult.data || []).map((item) => {
    const snapshot = snapshotMap.get(item.id);
    const object = (snapshot?.object_snapshot || {}) as Record<string, unknown>;
    const context = (snapshot?.context_snapshot || {}) as Record<string, unknown>;
    let targetTitle = "";
    let targetSummary = "";
    let authorNickname = "";
    if (item.target_type === "post") {
      targetTitle = String(object.title || "");
      targetSummary = String(object.content || "");
      authorNickname = String(context.author_nickname || "");
    } else if (item.target_type === "comment") {
      targetTitle = `评论于《${String(context.post_title || "未知作品")}》`;
      targetSummary = String(object.content || "");
      authorNickname = String(context.comment_author_nickname || "");
    } else {
      targetTitle = String(object.nickname || "未知用户");
      targetSummary = String(object.bio || "");
      authorNickname = String(object.nickname || "");
    }
    return { ...item, target_title: targetTitle, target_summary: targetSummary.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\s+/g, " ").trim().slice(0, 160), author_nickname: authorNickname };
  });
  return <AdminDashboard adminName={account.display_name || "管理员"}
    adminEmail={account.email}
    initialView={initialView}
    initialReviews={reviewItems as never[]}
    initialReports={reportCases as never[]}
    initialFeedbacks={(feedbacksResult.data || []) as never[]}
    initialRules={(rulesResult.data || []) as never[]}
    rulesReady={!rulesResult.error}
    loadErrors={[reviewCasesResult.error?.message, reportCasesResult.error?.message, feedbacksResult.error?.message].filter(Boolean) as string[]}
  />;
}
