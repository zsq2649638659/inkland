import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/supabase/admin-server";
import AdminDashboard from "./AdminDashboard";

export const metadata = { title: "管理后台 — inkland", robots: { index: false, follow: false } };

export default async function AdminPage() {
  const { supabase, user, account } = await getAdminContext();
  if (!user || !account) redirect("/admin/login");
  const [postsResult, reportsResult, commentReportsResult, feedbacksResult] = await Promise.all([
    supabase.from("posts").select("id, title, post_type, status, review_status, review_reason, created_at, user_id, author:profiles!posts_user_id_fkey(nickname)").eq("review_status", "pending").order("created_at", { ascending: false }).limit(50),
    supabase.from("content_reports").select("id, target_type, target_id, reason, status, created_at, reporter:profiles!content_reports_reporter_id_fkey(nickname)").in("status", ["pending", "reviewing"]).order("created_at", { ascending: false }).limit(50),
    supabase.from("comment_reports").select("id, comment_id, reason, status, created_at, reporter:profiles!comment_reports_reporter_id_fkey(nickname)").in("status", ["pending", "reviewing"]).order("created_at", { ascending: false }).limit(50),
    supabase.from("feedbacks").select("id, type, content, status, created_at, user_id").in("status", ["pending", "reviewing"]).order("created_at", { ascending: false }).limit(50),
  ]);
  return <main className="admin-page-shell"><div className="admin-page-header"><div><p className="admin-kicker">INKLAND OPERATIONS</p><h1>管理后台</h1><p className="admin-page-subtitle">审核作品、处理举报和跟进用户反馈。</p></div><span className="admin-role-badge">{account.display_name || "管理员"}</span></div><AdminDashboard
    initialPosts={(postsResult.data || []) as never[]}
    initialReports={[...((reportsResult.data || []).map((report) => ({ ...report, source: "content" })) || []), ...((commentReportsResult.data || []).map((report) => ({ id: report.id, target_type: "comment", target_id: report.comment_id, reason: report.reason, status: report.status, created_at: report.created_at, reporter: report.reporter, source: "comment" })) || [])] as never[]}
    initialFeedbacks={(feedbacksResult.data || []) as never[]}
    loadErrors={[postsResult.error?.message, reportsResult.error?.message, commentReportsResult.error?.message, feedbacksResult.error?.message].filter(Boolean) as string[]}
  /></main>;
}
