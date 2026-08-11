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
  const [postsResult, reviewCasesResult, reportsResult, commentReportsResult, feedbacksResult, rulesResult] = await Promise.all([
    supabase.from("posts").select("id, title, content, post_type, status, review_status, review_reason, created_at, user_id, author:profiles!posts_user_id_fkey(nickname)").eq("review_status", "pending").order("created_at", { ascending: false }).limit(50),
    supabase.from("moderation_review_cases").select("post_id, status, screening_status, priority, route_reason").in("status", ["pending", "service_error"]).in("screening_status", ["completed", "failed"]).order("created_at", { ascending: false }).limit(100),
    supabase.from("content_reports").select("id, target_type, target_id, reporter_id, reason, status, created_at, reporter:profiles!content_reports_reporter_id_fkey(nickname)").in("status", ["pending", "reviewing"]).order("created_at", { ascending: false }).limit(50),
    supabase.from("comment_reports").select("id, comment_id, reporter_id, reason, status, created_at, reporter:profiles!comment_reports_reporter_id_fkey(nickname), comment:comments!comment_reports_comment_id_fkey(id, content, user_id, author:profiles!comments_user_id_fkey(nickname), post:posts!comments_post_id_fkey(id, title))").in("status", ["pending", "reviewing"]).order("created_at", { ascending: false }).limit(50),
    supabase.from("feedbacks").select("id, type, content, status, created_at, user_id").in("status", ["pending", "reviewing"]).order("created_at", { ascending: false }).limit(50),
    supabase.from("moderation_rules").select("id, rule_type, pattern, category, severity, description, enabled, hit_count, updated_at").order("created_at", { ascending: false }).limit(200),
  ]);
  const postReportIds = (reportsResult.data || []).filter((report) => report.target_type === "post").map((report) => report.target_id);
  const userReportIds = (reportsResult.data || []).filter((report) => report.target_type === "user").map((report) => report.target_id);
  const [{ data: reportedPosts }, { data: reportedUsers }] = await Promise.all([
    postReportIds.length ? supabase.from("posts").select("id, title, content, post_type, user_id, author:profiles!posts_user_id_fkey(nickname)").in("id", postReportIds) : Promise.resolve({ data: [] }),
    userReportIds.length ? supabase.from("profiles").select("id, nickname, bio").in("id", userReportIds) : Promise.resolve({ data: [] }),
  ]);
  const postMap = new Map((reportedPosts || []).map((post) => [post.id, post]));
  const userMap = new Map((reportedUsers || []).map((profile) => [profile.id, profile]));
  const enrichedContentReports = (reportsResult.data || []).map((report) => ({ ...report, target: report.target_type === "post" ? postMap.get(report.target_id) : userMap.get(report.target_id), source: "content" }));
  const humanReviewPostIds = new Set((reviewCasesResult.data || []).map((reviewCase) => reviewCase.post_id));
  const humanReviewPosts = (postsResult.data || []).filter((post) => humanReviewPostIds.has(post.id));
  return <AdminDashboard adminName={account.display_name || "管理员"}
    adminEmail={account.email}
    initialView={initialView}
    initialPosts={humanReviewPosts as never[]}
    initialReports={[...enrichedContentReports, ...((commentReportsResult.data || []).map((report) => ({ ...report, target_type: "comment", target_id: report.comment_id, source: "comment" })) || [])] as never[]}
    initialFeedbacks={(feedbacksResult.data || []) as never[]}
    initialRules={(rulesResult.data || []) as never[]}
    rulesReady={!rulesResult.error}
    loadErrors={[postsResult.error?.message, reviewCasesResult.error?.message, reportsResult.error?.message, commentReportsResult.error?.message, feedbacksResult.error?.message].filter(Boolean) as string[]}
  />;
}
