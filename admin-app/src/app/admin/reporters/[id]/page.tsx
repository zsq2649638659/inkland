import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/supabase/admin-server";
import ReporterDetailClient from "./ReporterDetailClient";

export const metadata = { title: "举报者风险 — Inkland 管理后台", robots: { index: false, follow: false } };

export default async function ReporterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getAdminContext();
  if (!user) redirect("/admin/login");

  const { data, error } = await supabase.rpc("admin_reporter_detail_v1", { p_user_id: id });
  const detail = data as {
    ok?: boolean;
    message?: string;
    user?: Record<string, unknown>;
    reporter_stats?: Record<string, unknown>;
    report_permission?: Record<string, unknown>;
    recent_reports?: Array<Record<string, unknown>>;
    target_distribution?: Array<Record<string, unknown>>;
    focused_target?: Record<string, unknown> | null;
    malicious_history?: Array<Record<string, unknown>>;
    restriction_history?: Array<Record<string, unknown>>;
  } | null;

  if (error || !detail?.ok) {
    const raw = error?.message || detail?.message || "";
    if (/admin_reporter_detail_v1/.test(raw)) {
      return <div className="admin-detail-shell"><div className="admin-detail-top"><span className="admin-back-link">← 返回举报中心</span></div><div className="admin-alert admin-alert-error">举报者风险页功能尚未启用，请先执行举报中心数据库迁移后再打开此页面。</div></div>;
    }
    return <div className="admin-detail-shell"><div className="admin-detail-top"><span className="admin-back-link">← 返回举报中心</span></div><div className="admin-alert admin-alert-error">{detail?.message || "举报者风险数据读取失败，请稍后重试。"}</div></div>;
  }
  if (!detail.user) redirect("/admin?view=reportwork");

  const { data: publicProfile } = await supabase.from("profiles").select("public_id").eq("id", id).maybeSingle();
  const recentReports = Array.isArray(detail.recent_reports) ? detail.recent_reports : [];
  const reportTargets = recentReports
    .map((item) => ({ type: typeof item.target_type === "string" ? item.target_type : "", id: typeof item.target_id === "string" ? item.target_id : "" }))
    .filter((item) => item.id);
  const [{ data: targetPosts }, { data: targetComments }, { data: targetUsers }] = await Promise.all([
    reportTargets.some((item) => item.type === "post") ? supabase.from("posts").select("id, public_id").in("id", reportTargets.filter((item) => item.type === "post").map((item) => item.id)) : Promise.resolve({ data: [] }),
    reportTargets.some((item) => item.type === "comment") ? supabase.from("comments").select("id, public_id").in("id", reportTargets.filter((item) => item.type === "comment").map((item) => item.id)) : Promise.resolve({ data: [] }),
    reportTargets.some((item) => item.type === "user") ? supabase.from("profiles").select("id, public_id").in("id", reportTargets.filter((item) => item.type === "user").map((item) => item.id)) : Promise.resolve({ data: [] }),
  ]);
  const targetPublicIdMap = new Map([
    ...(targetPosts || []).map((item) => [item.id, item.public_id] as const),
    ...(targetComments || []).map((item) => [item.id, item.public_id] as const),
    ...(targetUsers || []).map((item) => [item.id, item.public_id] as const),
  ]);
  detail.user = { ...detail.user, public_id: publicProfile?.public_id || detail.user.public_id };
  detail.recent_reports = recentReports.map((item) => ({ ...item, target_public_id: targetPublicIdMap.get(String(item.target_id || "")) || null }));

  return <ReporterDetailClient detail={detail as never} adminInitial={user.email?.slice(0, 1).toUpperCase() || "A"} />;
}
