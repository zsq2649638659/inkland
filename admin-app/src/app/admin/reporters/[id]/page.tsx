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

  return <ReporterDetailClient detail={detail as never} adminInitial={user.email?.slice(0, 1).toUpperCase() || "A"} />;
}
