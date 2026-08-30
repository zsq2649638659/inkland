"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { fetchWithTimeout } from "@/lib/adminFetch";
import AdminDetailFrame from "../../AdminDetailFrame";

type FeedbackRow = {
  id: string;
  type: string;
  content: string;
  status: string;
  created_at: string;
  user_id: string;
};

type AuditLog = {
  id: string;
  admin_id?: string | null;
  action: string;
  note?: string | null;
  created_at: string;
};

type Props = {
  feedback: FeedbackRow;
  profile?: { id: string; nickname?: string | null } | null;
  auditLogs: AuditLog[];
  adminInitial?: string;
};

const feedbackTypeLabels: Record<string, string> = {
  feature: "功能建议",
  suggestion: "功能建议",
  bug: "Bug 报告",
  report: "内容举报",
  other: "其他问题",
  "功能建议": "功能建议",
  "Bug 报告": "Bug 报告",
  "内容举报": "内容举报",
  "其他问题": "其他问题",
};
const statusLabels: Record<string, string> = {
  pending: "待处理",
  reviewing: "处理中",
  resolved: "已处理",
  closed: "已关闭",
};
const auditActionLabels: Record<string, string> = {
  resolve_feedback: "标记反馈已处理",
};

const feedbackTypeLabel = (type: string) => feedbackTypeLabels[type] || type;
const dateText = (value?: string | null) => value ? new Date(value).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" }) : "—";
const fullDate = (value?: string | null) => value ? new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }) : "—";

export default function FeedbackDetailClient({ feedback, profile, auditLogs, adminInitial = "A" }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const isPending = feedback.status === "pending" || feedback.status === "reviewing";
  const statusLabel = statusLabels[feedback.status] || feedback.status;
  const typeLabel = feedbackTypeLabel(feedback.type);
  const submitterLabel = profile?.nickname || `用户 ${feedback.user_id.slice(0, 8)}`;

  const copyId = async (key: string, value: string) => {
    try {
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(value);
      setCopiedId(key);
      setSuccess("已复制 ID");
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      setSuccess("复制失败，请手动复制。");
    }
  };

  const resolveFeedback = async () => {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetchWithTimeout("/api/admin/feedbacks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedbackId: feedback.id, status: "resolved" }),
      });
      const payload = await response.json().catch(() => null) as { error?: string; notification?: string; feishuSync?: string } | null;
      if (!response.ok) {
        setError(payload?.error || "反馈处理失败，请稍后重试。");
        setBusy(false);
        return;
      }
      const suffix = payload?.notification === "failed"
        ? "，但用户通知发送失败"
        : payload?.feishuSync === "failed"
          ? "，飞书将在每日任务中重试"
          : "";
      setSuccess(`反馈已标记为处理完成${suffix}，正在返回反馈列表。`);
      window.setTimeout(() => router.push("/admin?view=feedbacks"), 650);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "反馈处理失败，请稍后重试。");
      setBusy(false);
    }
  };

  return (
    <AdminDetailFrame activeView="feedbacks" breadcrumb="管理后台 / 用户反馈 / 详情" adminInitial={adminInitial}>
      <div className="admin-feedback-detail-page admin-detail-shell">
        <header className="admin-detail-top">
          <Link href="/admin?view=feedbacks" className="admin-btn admin-btn-light">← 返回反馈列表</Link>
          <span className="admin-detail-queue-label">用户反馈详情</span>
          <button className="admin-btn admin-btn-light" type="button" disabled>下一条反馈 →</button>
        </header>

        <div className="admin-review-heading">
          <div className="admin-feedback-detail-title-line">
            <div className="admin-feedback-detail-badges">
            <span className={`admin-feedback-detail-status ${isPending ? "is-pending" : "is-resolved"}`}>{statusLabel}</span>
            <span className="admin-feedback-detail-type">{typeLabel}</span>
            </div>
            <h1>{feedback.content}</h1>
          </div>
          <div className="admin-detail-meta-line">
            <p className="admin-detail-meta">由 {submitterLabel} 提交 · 提交于 {fullDate(feedback.created_at)}</p>
            <div className="admin-entity-ids">
              <button type="button" className={`admin-copy-id${copiedId === "feedback" ? " is-copied" : ""}`} title="点击复制反馈 ID" onClick={() => void copyId("feedback", feedback.id)}>{copiedId === "feedback" ? "已复制反馈 ID" : `反馈 ${feedback.id}`}</button>
              <button type="button" className={`admin-copy-id${copiedId === "user" ? " is-copied" : ""}`} title="点击复制用户 ID" onClick={() => void copyId("user", feedback.user_id)}>{copiedId === "user" ? "已复制用户 ID" : `用户 ${feedback.user_id}`}</button>
            </div>
          </div>
        </div>

        <div className="admin-review-layout admin-feedback-detail-layout">
          <article className="admin-detail-content">
            <section className="admin-detail-panel admin-feedback-detail-card">
              <div className="admin-panel-title-row"><h2>反馈原文（前端表单原样回传）</h2><span>{typeLabel}</span></div>
              <p className="admin-feedback-original">{feedback.content}</p>
            </section>

            <section className="admin-detail-panel admin-feedback-detail-card">
              <div className="admin-panel-title-row"><h2>处理轨迹</h2><span>{auditLogs.length + 1} 条</span></div>
              <ol className="admin-feedback-timeline">
                <li><div><strong>收到反馈</strong><span>系统记录了用户提交的反馈</span></div><time>{dateText(feedback.created_at)}</time></li>
                {auditLogs.map((log) => <li key={log.id}><div><strong>{auditActionLabels[log.action] || log.action}</strong><span>{log.note || `管理员 ${log.admin_id?.slice(0, 8) || "操作"} 已更新反馈状态`}</span></div><time>{dateText(log.created_at)}</time></li>)}
              </ol>
            </section>

            <section className="admin-detail-panel admin-feedback-detail-card admin-feedback-submit-card">
              <div className="admin-panel-title-row"><h2>提交信息</h2><span>保留查询记录</span></div>
              <dl className="admin-feedback-detail-facts">
                <dt>提交人</dt><dd>{profile?.nickname || "未读取到昵称"}</dd>
                <dt>用户 ID</dt><dd className="admin-mono">{feedback.user_id}</dd>
                <dt>反馈 ID</dt><dd className="admin-mono">{feedback.id}</dd>
                <dt>首次提交</dt><dd>{fullDate(feedback.created_at)}</dd>
              </dl>
            </section>
          </article>

          <aside className="admin-review-action-column">
            <section className="admin-detail-panel admin-feedback-detail-actions">
              <h2>{isPending ? "处理反馈" : "反馈已归档"}</h2>
              <p>{isPending ? "确认完成后，反馈会进入只读的反馈记录，不会删除原始内容。" : "这条反馈已经处理完成，原始内容和处理轨迹仍可查询。"}</p>
              {isPending ? <button className="admin-feedback-detail-primary" type="button" disabled={busy} onClick={() => void resolveFeedback()}>{busy ? "处理中…" : "标记为已处理"}</button> : <div className="admin-feedback-detail-readonly">只读记录</div>}
              {success ? <div className="admin-feedback-detail-success" role="status">{success}</div> : null}
              {error ? <div className="admin-alert admin-alert-error" role="alert">{error}</div> : null}
              <small>处理操作会写入管理员审计记录。</small>
            </section>
            <section className="admin-detail-panel admin-feedback-detail-actions">
              <h2>相关账号</h2>
              <p>提交人账号信息保持独立，可从用户管理继续查看。</p>
              <Link className="admin-detail-secondary" href={`/admin/users/${feedback.user_id}`}>查看用户详情</Link>
            </section>
          </aside>
        </div>
      </div>
    </AdminDetailFrame>
  );
}
