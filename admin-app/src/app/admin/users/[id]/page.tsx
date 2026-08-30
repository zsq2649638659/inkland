import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/supabase/admin-server";
import UserDetailClient from "./UserDetailClient";

export const metadata = { title: "用户详情 — Inkland 管理后台", robots: { index: false, follow: false } };

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getAdminContext();
  if (!user) redirect("/admin/login");

  const { data, error } = await supabase.rpc("admin_user_detail", { p_user_id: id });
  const detail = data as {
    ok?: boolean;
    message?: string;
    user?: Record<string, unknown>;
    stats?: Record<string, number>;
    recent_posts?: Array<Record<string, unknown>>;
    recent_comments?: Array<Record<string, unknown>>;
    violations?: Array<Record<string, unknown>>;
    restrictions?: Array<Record<string, unknown>>;
    reporter_stats?: Record<string, unknown> | null;
  } | null;

  const { data: profileRevisions } = await supabase
    .from("profile_revision_requests")
    .select("id, issue_type, issue_detail, hidden_fields, status, created_at, confirmed_at")
    .eq("user_id", id)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error || !detail?.ok) {
    const raw = error?.message || detail?.message || "";
    if (/admin_user_detail/.test(raw)) {
      return <div className="admin-detail-shell"><div className="admin-detail-top"><span className="admin-back-link">← 返回用户管理</span></div><div className="admin-alert admin-alert-error">用户详情功能尚未启用，请先执行模块6数据库迁移后再打开此页面。</div></div>;
    }
    return <div className="admin-detail-shell"><div className="admin-detail-top"><span className="admin-back-link">← 返回用户管理</span></div><div className="admin-alert admin-alert-error">{detail?.message || "用户详情读取失败，请稍后重试。"}</div></div>;
  }
  if (!detail.user) redirect("/admin?view=users");
  const { data: publicProfile } = await supabase.from("profiles").select("public_id").eq("id", id).maybeSingle();
  detail.user = { ...detail.user, public_id: publicProfile?.public_id || detail.user.public_id };

  const recentPostIds = (detail.recent_posts || []).map((item) => typeof item.id === "string" ? item.id : "").filter(Boolean);
  const recentCommentIds = (detail.recent_comments || []).map((item) => typeof item.id === "string" ? item.id : "").filter(Boolean);
  const recentCommentPostIds = (detail.recent_comments || []).map((item) => typeof item.post_id === "string" ? item.post_id : "").filter(Boolean);
  const violationIds = (detail.violations || []).map((item) => typeof item.id === "string" ? item.id : "").filter(Boolean);
  const restrictionIds = (detail.restrictions || []).map((item) => typeof item.id === "string" ? item.id : "").filter(Boolean);
  const recentReports = Array.isArray(detail.reporter_stats?.recent_reports)
    ? detail.reporter_stats.recent_reports as Array<Record<string, unknown>>
    : [];
  const recentReportTargets = recentReports
    .map((item) => ({ type: typeof item.target_type === "string" ? item.target_type : "", id: typeof item.target_id === "string" ? item.target_id : "" }))
    .filter((item) => item.id);
  const [{ data: recentPosts }, { data: recentComments }, { data: recentCommentPosts }, { data: violations }, { data: restrictions }, { data: reportTargetPosts }, { data: reportTargetComments }, { data: reportTargetUsers }] = await Promise.all([
    recentPostIds.length ? supabase.from("posts").select("id, public_id").in("id", recentPostIds) : Promise.resolve({ data: [] }),
    recentCommentIds.length ? supabase.from("comments").select("id, public_id").in("id", recentCommentIds) : Promise.resolve({ data: [] }),
    recentCommentPostIds.length ? supabase.from("posts").select("id, public_id").in("id", recentCommentPostIds) : Promise.resolve({ data: [] }),
    violationIds.length ? supabase.from("user_violations").select("id, public_id").in("id", violationIds) : Promise.resolve({ data: [] }),
    restrictionIds.length ? supabase.from("user_restrictions").select("id, public_id").in("id", restrictionIds) : Promise.resolve({ data: [] }),
    recentReportTargets.some((item) => item.type === "post") ? supabase.from("posts").select("id, public_id").in("id", recentReportTargets.filter((item) => item.type === "post").map((item) => item.id)) : Promise.resolve({ data: [] }),
    recentReportTargets.some((item) => item.type === "comment") ? supabase.from("comments").select("id, public_id").in("id", recentReportTargets.filter((item) => item.type === "comment").map((item) => item.id)) : Promise.resolve({ data: [] }),
    recentReportTargets.some((item) => item.type === "user") ? supabase.from("profiles").select("id, public_id").in("id", recentReportTargets.filter((item) => item.type === "user").map((item) => item.id)) : Promise.resolve({ data: [] }),
  ]);
  const publicIdMap = new Map([
    ...(recentPosts || []).map((item) => [item.id, item.public_id] as const),
    ...(recentComments || []).map((item) => [item.id, item.public_id] as const),
    ...(recentCommentPosts || []).map((item) => [item.id, item.public_id] as const),
    ...(violations || []).map((item) => [item.id, item.public_id] as const),
    ...(restrictions || []).map((item) => [item.id, item.public_id] as const),
    ...(reportTargetPosts || []).map((item) => [item.id, item.public_id] as const),
    ...(reportTargetComments || []).map((item) => [item.id, item.public_id] as const),
    ...(reportTargetUsers || []).map((item) => [item.id, item.public_id] as const),
  ]);
  detail.recent_posts = (detail.recent_posts || []).map((item) => ({ ...item, public_id: publicIdMap.get(String(item.id)) || item.public_id || null }));
  detail.recent_comments = (detail.recent_comments || []).map((item) => ({
    ...item,
    public_id: publicIdMap.get(String(item.id)) || item.public_id || null,
    post_public_id: publicIdMap.get(String(item.post_id || "")) || null,
  }));
  detail.violations = (detail.violations || []).map((item) => ({ ...item, public_id: publicIdMap.get(String(item.id)) || item.public_id || null }));
  detail.restrictions = (detail.restrictions || []).map((item) => ({ ...item, public_id: publicIdMap.get(String(item.id)) || item.public_id || null }));
  if (detail.reporter_stats) {
    detail.reporter_stats = {
      ...detail.reporter_stats,
      recent_reports: recentReports.map((item) => ({ ...item, target_public_id: publicIdMap.get(String(item.target_id || "")) || null })),
    };
  }

  return <UserDetailClient
    detail={detail as never}
    profileRevisions={(profileRevisions || []) as never}
    adminInitial={user.email?.slice(0, 1).toUpperCase() || "A"}
  />;
}
