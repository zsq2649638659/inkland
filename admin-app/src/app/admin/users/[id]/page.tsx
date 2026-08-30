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

  return <UserDetailClient
    detail={detail as never}
    profileRevisions={(profileRevisions || []) as never}
    adminInitial={user.email?.slice(0, 1).toUpperCase() || "A"}
  />;
}
