import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/supabase/admin-server";
import AdminDashboard, { type AdminView } from "./AdminDashboard";

export const metadata = { title: "管理后台 — inkland", robots: { index: false, follow: false } };

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ view?: string; q?: string; query?: string }> }) {
  const { view, q, query } = await searchParams;
  const allowedViews: AdminView[] = ["reviews", "reports", "users", "feedbacks", "rules"];
  const initialView: AdminView = allowedViews.includes(view as AdminView) ? (view as AdminView) : "reviews";
  const initialQuery = (q || query || "").trim().slice(0, 100);
  const { supabase, user, account } = await getAdminContext();
  if (!user || !account) redirect("/admin/login");
  const [postsResult, reviewCasesResult, seriesCasesResult, reportCasesResult, feedbacksResult, rulesResult, rulesCountResult] = await Promise.all([
    supabase.from("posts").select("id, title, content, post_type, status, review_status, review_reason, created_at, user_id, author:profiles!posts_user_id_fkey(nickname)").eq("review_status", "pending").order("created_at", { ascending: false }).limit(50),
    supabase.from("moderation_review_cases").select("id, post_id, status, screening_status, priority, route_reason").in("status", ["pending", "service_error"]).in("screening_status", ["completed", "failed"]).order("created_at", { ascending: false }).limit(100),
    supabase.from("series_moderation_review_cases").select("id, series_id, status, screening_status, priority, route_reason, created_at").in("status", ["pending", "reviewing"]).order("created_at", { ascending: false }).limit(100),
    supabase.from("moderation_report_cases").select("id, target_type, target_id, target_user_id, status, priority, outcome, primary_reason_category, report_count, first_reported_at, last_reported_at, created_at").in("status", ["pending", "reviewing"]).order("last_reported_at", { ascending: false }).limit(50),
    supabase.from("feedbacks").select("id, type, content, status, created_at, user_id").in("status", ["pending", "reviewing"]).order("created_at", { ascending: false }).limit(50),
    supabase.from("moderation_rules").select("id, rule_type, pattern, category, severity, risk_level, min_hits, description, enabled, hit_count, updated_at").order("created_at", { ascending: false }).limit(100),
    supabase.from("moderation_rules").select("id", { count: "exact", head: true }),
  ]);
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
  const reviewCaseByPostId = new Map<string, string>();
  for (const reviewCase of reviewCasesResult.data || []) {
    if (!reviewCaseByPostId.has(reviewCase.post_id)) reviewCaseByPostId.set(reviewCase.post_id, reviewCase.id);
  }
  const humanReviewPosts = (postsResult.data || []).flatMap((post) => {
    const reviewCaseId = reviewCaseByPostId.get(post.id);
    return reviewCaseId ? [{ ...post, review_case_id: reviewCaseId }] : [];
  });
  const seriesIds = (seriesCasesResult.data || []).map((item) => item.series_id);
  const { data: reviewSeries } = seriesIds.length
    ? await supabase.from("series").select("id, name, description, user_id, created_at, review_status").in("id", seriesIds)
    : { data: [] };
  const seriesMap = new Map((reviewSeries || []).map((item) => [item.id, item]));
  const humanReviewSeries = (seriesCasesResult.data || []).map((item) => ({ ...item, series: seriesMap.get(item.series_id) || null }));
  return <AdminDashboard adminName={account.display_name || "管理员"}
    adminEmail={account.email}
    initialView={initialView}
    initialQuery={initialQuery}
    initialPosts={humanReviewPosts as never[]}
    initialSeriesReviews={humanReviewSeries as never[]}
    initialReports={reportCases as never[]}
    initialFeedbacks={(feedbacksResult.data || []) as never[]}
    initialRules={(rulesResult.data || []) as never[]}
    initialRuleTotal={rulesCountResult.count ?? (rulesResult.data || []).length}
    rulesReady={!rulesResult.error && !rulesCountResult.error}
    loadErrors={[postsResult.error?.message, reviewCasesResult.error?.message, seriesCasesResult.error?.message, reportCasesResult.error?.message, feedbacksResult.error?.message].filter(Boolean) as string[]}
  />;
}
