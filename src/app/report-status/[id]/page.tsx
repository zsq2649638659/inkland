"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import HomeSidebar from "@/components/HomeSidebar";
import EmptyState from "@/components/EmptyState";
import { useAuth } from "@/components/AuthProvider";

interface ReportCase {
  id: string;
  status: string;
  outcome?: string | null;
  target_type?: string | null;
  target_id?: string | null;
  target_post_id?: string | null;
  created_at: string;
  updated_at?: string | null;
  metadata?: { note?: string | null; resolution_note?: string | null } | null;
}

interface ReportStatusResponse {
  ok: boolean;
  error?: string;
  case?: ReportCase;
}

const statusCopy: Record<string, { label: string; description: string }> = {
  pending: { label: "受理中", description: "举报已进入处理队列，平台会根据内容和证据继续核查。" },
  reviewing: { label: "人工核查中", description: "管理员正在核对举报对象、上下文和相关证据。" },
  resolved: { label: "已处理", description: "这条举报已有处理结论。若对象已下架或删除，页面会保留状态说明。" },
  closed: { label: "已结束", description: "这条举报已结束处理。" },
  cancelled: { label: "已撤销", description: "这条举报已被撤销，平台不会继续推进本次处理。" },
};

const outcomeLabels: Record<string, string> = {
  kept: "保留内容",
  reminded: "已提醒相关用户",
  deleted: "已删除内容",
  no_violation: "举报不成立",
};

export default function ReportStatusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, loading: authLoading } = useAuth();
  const [reportCase, setReportCase] = useState<ReportCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const loginHref = useMemo(() => `/login?next=${encodeURIComponent(`/report-status/${id}`)}`, [id]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void (async () => {
      try {
        const response = await fetch(`/api/report-status/${encodeURIComponent(id)}`, { cache: "no-store" });
        const payload = await response.json() as ReportStatusResponse;
        if (!active) return;
        if (!response.ok || !payload.ok || !payload.case) setError(payload.error || "举报状态暂时无法读取，请稍后再试。");
        else setReportCase(payload.case);
      } catch {
        if (active) setError("举报状态暂时无法读取，请稍后再试。");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [id, user]);

  if (authLoading || (user && loading)) {
    return <div className="min-h-screen bg-paper"><div className="main-container"><HomeSidebar /><main className="content-area"><div className="settings-panel">正在读取举报状态…</div></main></div></div>;
  }
  if (!user) {
    return <div className="min-h-screen bg-paper"><div className="main-container"><HomeSidebar /><main className="content-area"><EmptyState icon="fa-flag" title="登录后查看举报状态" actionLabel="登录" actionHref={loginHref} /></main></div></div>;
  }
  if (error || !reportCase) {
    return <div className="min-h-screen bg-paper"><div className="main-container"><HomeSidebar /><main className="content-area"><EmptyState icon="fa-flag" title={error || "举报状态不存在"} actionLabel="返回消息" actionHref="/notifications" /></main></div></div>;
  }

  const copy = statusCopy[reportCase.status] || statusCopy.pending;
  const targetLabel = reportCase.target_type === "comment" ? "评论" : reportCase.target_type === "post" ? "作品" : "用户对象";
  const targetHref = reportCase.target_type === "post" && reportCase.target_id
    ? `/read/${reportCase.target_id}`
    : reportCase.target_type === "comment" && reportCase.target_post_id && reportCase.target_id
      ? `/read/${reportCase.target_post_id}#comments`
      : reportCase.target_type === "user" && reportCase.target_id
        ? `/user/${reportCase.target_id}`
        : null;
  const targetActionLabel = reportCase.target_type === "comment" ? "查看原评论" : reportCase.target_type === "user" ? "查看对象账号" : "查看作品";
  const resolutionNote = reportCase.metadata?.resolution_note || reportCase.metadata?.note;

  return (
    <div className="min-h-screen bg-paper pb-20 lg:pb-0">
      <div className="main-container">
        <HomeSidebar />
        <main className="content-area">
          <div className="page-header">
            <div><h1 className="page-title">举报处理状态</h1><p className="settings-panel-desc">举报对象：{targetLabel} · 编号 {reportCase.id.slice(0, 8)}</p></div>
            <Link className="btn-ghost" href="/notifications">返回消息</Link>
          </div>
          <section className="settings-panel" aria-live="polite">
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: reportCase.status === "resolved" || reportCase.status === "closed" ? "#5d9b73" : "var(--color-primary)" }} />
              <strong style={{ fontSize: 20 }}>{copy.label}</strong>
            </div>
            <p className="settings-panel-desc">{copy.description}</p>
            <dl style={{ display: "grid", gap: 12, marginTop: 24 }}>
              <div><dt className="settings-form-label">提交时间</dt><dd>{new Date(reportCase.created_at).toLocaleString("zh-CN")}</dd></div>
              {reportCase.updated_at && <div><dt className="settings-form-label">最近更新</dt><dd>{new Date(reportCase.updated_at).toLocaleString("zh-CN")}</dd></div>}
              {reportCase.outcome && <div><dt className="settings-form-label">处理结论</dt><dd>{outcomeLabels[reportCase.outcome] || reportCase.outcome}</dd></div>}
              {resolutionNote && <div><dt className="settings-form-label">平台说明</dt><dd>{resolutionNote}</dd></div>}
            </dl>
            {targetHref && <Link href={targetHref} className="settings-btn-save" style={{ display: "inline-flex", marginTop: 24 }}>{targetActionLabel}</Link>}
          </section>
        </main>
      </div>
    </div>
  );
}
