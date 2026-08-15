"use client";
/* eslint-disable @next/next/no-img-element -- 举报证据需要按快照中的原始地址展示。 */

import Link from "next/link";
import { FormEvent, useState } from "react";
import { fetchWithTimeout } from "@/lib/adminFetch";

type CaseRow = {
  id: string;
  target_type: "post" | "comment" | "user";
  target_id: string;
  target_user_id?: string | null;
  status: string;
  priority: string;
  outcome?: string | null;
  primary_reason_category?: string | null;
  report_count: number;
  first_reported_at: string;
  last_reported_at: string;
  created_at: string;
  resolved_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

type SnapshotRow = {
  target_type: "post" | "comment" | "user";
  target_id: string;
  author_id?: string | null;
  post_id?: string | null;
  object_snapshot: Record<string, unknown>;
  context_snapshot?: Record<string, unknown>;
  captured_at: string;
};

type ReportRow = {
  id: string;
  kind: "content" | "comment";
  reporter_id?: string | null;
  reporter?: { nickname?: string | null } | null;
  reason?: string | null;
  reason_category?: string | null;
  details?: string | null;
  status?: string | null;
  created_at: string;
  target_type?: string | null;
  comment_id?: string | null;
};

type ViolationRow = {
  id: string;
  source_type: string;
  content_type?: string | null;
  category: string;
  severity: string;
  summary?: string | null;
  status: string;
  confirmed_at: string;
};

type ReporterStatRow = {
  user_id: string;
  total_reports: number;
  valid_reports: number;
  invalid_reports: number;
  reports_last_24h: number;
  report_restricted_until?: string | null;
};

type Props = {
  reportCase: CaseRow;
  snapshot: SnapshotRow | null;
  reports: ReportRow[];
  violations: ViolationRow[];
  reporterStats: ReporterStatRow[];
};

type ReportAction = "keep" | "remind" | "delete" | "dismiss" | "no_violation";

const targetLabels: Record<string, string> = { post: "作品", comment: "评论", user: "用户" };
const statusLabels: Record<string, string> = { pending: "待处理", reviewing: "处理中", resolved: "已处理", cancelled: "已取消" };
const priorityLabels: Record<string, string> = { normal: "普通", high: "优先", urgent: "紧急" };
const outcomeLabels: Record<string, string> = { kept: "保留", reminded: "已提醒", deleted: "已删除", no_violation: "未发现违规" };
const severityLabels: Record<string, string> = { minor: "轻微", standard: "普通", serious: "严重", critical: "紧急" };
const reminderQuickReasons = ["举报理由与内容明显无关", "短时间大量重复举报", "反复举报已判定无问题内容", "补充说明含辱骂或威胁", "请勿滥用举报功能"];

function text(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function imageUrls(content: string) {
  return [...content.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]);
}

function plainText(content: string) {
  return content.replace(/!\[[^\]]*\]\(([^)]+)\)/g, "").trim();
}

export default function ReportDetailClient({ reportCase, snapshot, reports, violations, reporterStats }: Props) {
  const [pendingAction, setPendingAction] = useState<ReportAction | null>(null);
  const [note, setNote] = useState("");
  const [modalError, setModalError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reminderTarget, setReminderTarget] = useState<{ userId: string; nickname: string } | null>(null);
  const [reminderReason, setReminderReason] = useState("");
  const [reminderCustomReason, setReminderCustomReason] = useState(false);
  const [reminderBusy, setReminderBusy] = useState(false);
  const [reminderError, setReminderError] = useState("");
  const [success, setSuccess] = useState("");

  const object = (snapshot?.object_snapshot || {}) as Record<string, unknown>;
  const context = (snapshot?.context_snapshot || {}) as Record<string, unknown>;
  const isPost = reportCase.target_type === "post";
  const isComment = reportCase.target_type === "comment";
  const isUser = reportCase.target_type === "user";

  const targetTitle = isPost
    ? text(object.title) || "未知作品"
    : isComment
      ? `评论于《${text(context.post_title) || "未知作品"}》`
      : text(object.nickname) || "未知用户";
  const targetAuthor = isPost
    ? text(context.author_nickname) || "未知作者"
    : isComment
      ? text(context.comment_author_nickname) || "未知用户"
      : text(object.nickname) || "未知用户";

  const content = isComment
    ? text(object.content) || "评论内容已不存在"
    : isPost
      ? text(object.content)
      : text(object.bio);
  const images = imageUrls(content);
  const contentText = plainText(content);

  const actions: Array<{ key: ReportAction; label: string; danger?: boolean }> = isComment
    ? [
        { key: "keep", label: "保留评论" },
        { key: "remind", label: "保留并提醒" },
        { key: "delete", label: "删除评论", danger: true },
        { key: "dismiss", label: "驳回举报" },
      ]
    : isPost
      ? [
          { key: "keep", label: "保留作品" },
          { key: "delete", label: "删除作品", danger: true },
          { key: "dismiss", label: "驳回举报" },
        ]
      : [
          { key: "no_violation", label: "未发现账号违规" },
          { key: "dismiss", label: "驳回举报" },
        ];

  const modalCopy: Record<ReportAction, { title: string; desc: string; confirm: string; danger?: boolean }> = {
    keep: {
      title: `确认保留${targetLabels[reportCase.target_type]}？`,
      desc: "举报不成立。内容不会被删除，也不会通知内容作者；举报人会收到统一处理完成通知。",
      confirm: "确认保留",
    },
    remind: {
      title: "保留并发送文明提醒？",
      desc: "评论会保留，系统将向评论作者发送一条文明提醒；默认不计入正式违规记录。",
      confirm: "确认提醒",
    },
    delete: {
      title: `确认删除${targetLabels[reportCase.target_type]}？`,
      desc: "删除后无法恢复。作者会收到删除通知，本案件将计入确认违规记录。",
      confirm: "确认删除",
      danger: true,
    },
    dismiss: {
      title: "驳回该举报案件？",
      desc: "视为举报不成立，不会通知内容作者；举报人会收到统一处理完成通知。",
      confirm: "确认驳回",
    },
    no_violation: {
      title: "确认未发现账号违规？",
      desc: "案件将标记为未发现违规，不会对用户账号产生提醒或处罚。",
      confirm: "确认处理",
    },
  };

  const runAction = async (action: ReportAction) => {
    setBusy(true);
    setModalError("");
    try {
      const response = await fetchWithTimeout("/api/admin/reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: reportCase.id, action, note: note.trim() || undefined }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { error?: string } | null;
        setBusy(false);
        setModalError(result?.error || "举报案件处理失败，请稍后重试。");
        return;
      }
      window.location.assign("/admin?view=reports");
    } catch (error) {
      setBusy(false);
      setModalError(error instanceof Error ? error.message : "举报案件处理失败，请稍后重试。");
    }
  };

  const openReminder = (userId: string, nickname: string) => {
    setReminderTarget({ userId, nickname });
    setReminderReason(""); setReminderCustomReason(false); setReminderError(""); setSuccess("");
  };

  const submitReminder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reminderTarget) return;
    if (!reminderReason.trim()) { setReminderError("请填写提醒内容。"); return; }
    setReminderBusy(true); setReminderError(""); setSuccess("");
    try {
      const response = await fetchWithTimeout("/api/admin/users/report-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: reminderTarget.userId, reason: reminderReason.trim() }),
      });
      const payload = await response.json().catch(() => null) as { error?: string; message?: string } | null;
      setReminderBusy(false);
      if (!response.ok) { setReminderError(payload?.error || "提醒发送失败，请稍后重试。"); return; }
      setReminderTarget(null);
      setReminderReason(""); setReminderCustomReason(false);
      setSuccess(payload?.message || "举报规则提醒已发送。");
    } catch (error) {
      setReminderBusy(false);
      setReminderError(error instanceof Error ? error.message : "提醒发送失败，请稍后重试。");
    }
  };

  const reportStatusLabel = (status?: string | null) => status === "pending" ? "待处理" : status === "reviewing" ? "处理中" : status === "resolved" ? "已处理" : status || "未知";

  return (
    <main className="admin-detail-shell">
      <header className="admin-detail-top">
        <Link href="/admin?view=reports" className="admin-back-link">← 返回举报中心</Link>
        <span className="admin-detail-status">{statusLabels[reportCase.status] || reportCase.status}</span>
      </header>

      <div className="admin-review-heading">
        <div className="admin-detail-kicker">REPORT CASE · {targetLabels[reportCase.target_type]?.toUpperCase() || "OBJECT"}</div>
        <h1>{targetTitle}</h1>
        <div className="admin-detail-meta">
          目标作者：{targetAuthor} · {reportCase.report_count} 人举报 · 首次 {new Date(reportCase.first_reported_at).toLocaleString("zh-CN")} · 最近 {new Date(reportCase.last_reported_at).toLocaleString("zh-CN")}
        </div>
      </div>

      <div className="admin-review-layout">
        <aside className="admin-review-summary-column">
          <section className="admin-detail-panel">
            <h2>案件信息</h2>
            <dl>
              <dt>案件状态</dt>
              <dd>{statusLabels[reportCase.status] || reportCase.status}</dd>
              <dt>优先级</dt>
              <dd>{priorityLabels[reportCase.priority] || reportCase.priority}</dd>
              <dt>主要原因</dt>
              <dd>{reportCase.primary_reason_category || "未填写"}</dd>
              <dt>目标 ID</dt>
              <dd className="admin-mono">{reportCase.target_id}</dd>
              {reportCase.outcome ? <><dt>处理结果</dt><dd>{outcomeLabels[reportCase.outcome] || reportCase.outcome}</dd></> : null}
              {reportCase.resolved_at ? <><dt>处理时间</dt><dd>{new Date(reportCase.resolved_at).toLocaleString("zh-CN")}</dd></> : null}
            </dl>
          </section>

          <section className="admin-detail-panel">
            <div className="admin-panel-title-row"><h2>举报明细</h2><span>{reports.length} 条</span></div>
            {reports.length ? <div className="admin-risk-list">{reports.map((report) => {
              const stat = reporterStats.find((item) => item.user_id === report.reporter_id);
              const reporterId = report.reporter_id;
              return <div className="admin-risk-item" key={report.id}>
                <strong>{report.kind === "comment" ? "评论举报" : report.target_type === "post" ? "作品举报" : "用户举报"} · {report.reporter?.nickname || "匿名用户"}</strong>
                <div className="admin-risk-tags"><span>{report.reason_category || report.reason || "未填写原因"}</span><span>{reportStatusLabel(report.status)}</span></div>
                {report.details && report.details !== report.reason ? <small>补充说明：{report.details}</small> : null}
                <small>提交于 {new Date(report.created_at).toLocaleString("zh-CN")}</small>
                {stat ? <small>该举报人累计 {stat.total_reports} 次 · 成立 {stat.valid_reports} · 不成立 {stat.invalid_reports} · 24 小时 {stat.reports_last_24h} 次{stat.report_restricted_until ? ` · 举报受限至 ${new Date(stat.report_restricted_until).toLocaleDateString("zh-CN")}` : ""}</small> : null}
                {reporterId ? <div className="admin-report-stat-actions">
                  <Link href={`/admin/users/${reporterId}`} className="admin-inline-link">查看用户并处罚</Link>
                  <button className="admin-inline-btn" type="button" onClick={() => openReminder(reporterId, report.reporter?.nickname || "该用户")}>发送举报规则提醒</button>
                </div> : null}
              </div>;
            })}</div> : <p className="admin-detail-empty">没有找到该案件的举报明细。</p>}
          </section>

          <section className="admin-detail-panel">
            <div className="admin-panel-title-row"><h2>目标用户违规记录</h2><span>{violations.length} 条</span></div>
            {violations.length ? <div className="admin-risk-list">{violations.map((item) => <div className="admin-risk-item" key={item.id}>
              <strong>{item.content_type ? targetLabels[item.content_type] || item.content_type : "账号"} · {item.category}</strong>
              <div className="admin-risk-tags"><span>{severityLabels[item.severity] || item.severity}</span><span>{item.status === "active" ? "有效" : "已撤销"}</span></div>
              {item.summary ? <small>{item.summary}</small> : null}
              <small>确认于 {new Date(item.confirmed_at).toLocaleString("zh-CN")}</small>
            </div>)}</div> : <p className="admin-detail-empty">该用户没有确认违规记录。</p>}
          </section>
        </aside>

        <article className="admin-detail-content admin-review-main">
          <section className="admin-evidence-document">
            <div className="admin-document-label">举报内容快照 · {new Date(snapshot?.captured_at || reportCase.created_at).toLocaleString("zh-CN")}</div>
            <h2>{isPost ? "作品全文" : isComment ? "评论原文" : "用户资料"}</h2>

            {isPost ? <dl className="admin-snapshot-meta">
              <dt>内容评级</dt><dd>{text(object.content_rating) || "未记录"}</dd>
              {text(object.series_name) ? <><dt>所属连载</dt><dd>{text(object.series_name)}{text(object.chapter_number) ? ` · 第 ${text(object.chapter_number)} 章` : ""}</dd></> : null}
              {text(object.published_at) ? <><dt>发布时间</dt><dd>{new Date(text(object.published_at)).toLocaleString("zh-CN")}</dd></> : null}
              {text(object.visibility) ? <><dt>可见范围</dt><dd>{text(object.visibility)}</dd></> : null}
            </dl> : null}

            {isUser ? <div className="admin-user-profile">
              {text(object.avatar_url) ? <img src={text(object.avatar_url)} alt="用户头像" className="admin-user-avatar" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : <span className="admin-user-avatar admin-user-avatar-empty">{targetAuthor.slice(0, 1)}</span>}
              <div><strong>{targetAuthor}</strong><span>{text(object.moderation_status) ? `账号状态：${text(object.moderation_status)}` : "账号状态：未记录"}{text(object.created_at) ? ` · 注册于 ${new Date(text(object.created_at)).toLocaleDateString("zh-CN")}` : ""}</span></div>
            </div> : null}

            {contentText ? <div className="admin-long-content">{contentText}</div> : <p className="admin-detail-empty">{isUser ? "该用户没有填写个人简介。" : "快照中没有可读取的文字内容。"}</p>}
            {isPost && text(object.author_note) ? <section className="admin-author-note"><h3>作者的话</h3><p>{text(object.author_note)}</p></section> : null}

            {images.length ? <div className="admin-detail-images">{images.map((url, index) => {
              const unavailable = url.startsWith("private://");
              return <figure key={`${url}-${index}`}>
                {unavailable ? <div className="admin-image-unavailable"><strong>图片 {index + 1} 暂时无法显示</strong><span>原图已迁移或需要私有访问配置。</span></div> : <a href={url} target="_blank" rel="noreferrer" title="打开原图"><img src={url} alt={`被举报内容图片 ${index + 1}`} /></a>}
                <figcaption>图片 {index + 1}</figcaption>
              </figure>;
            })}</div> : null}

            {isComment ? <div className="admin-context-card"><span>评论所属作品</span><strong>{text(context.post_title) || "未知作品"}</strong><p>以下是被举报评论提交时的原文快照，作品后续修改不影响本证据。</p></div> : null}
          </section>
        </article>

        <aside className="admin-review-action-column">
          <section className="admin-detail-panel">
            <h2>处理举报</h2>
            <p>请先阅读左侧完整证据，再选择处理动作。</p>
            <div className="admin-report-actions-column">
              {actions.map((action) => <button className={action.danger ? "admin-detail-danger" : "admin-detail-secondary"} key={action.key} disabled={busy} onClick={() => { setNote(""); setModalError(""); setPendingAction(action.key); }}>{action.label}</button>)}
            </div>
            <small>处理完成后，所有举报人都会收到统一的“举报已处理”通知；系统不会公开保留、删除或处罚结果。</small>
          </section>
        </aside>
      </div>

      {pendingAction ? <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setPendingAction(null); }}><div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="resolve-report-title">
        <div className="admin-modal-header"><div><h2 id="resolve-report-title">{modalCopy[pendingAction].title}</h2><p className="admin-modal-desc">{modalCopy[pendingAction].desc}</p></div></div>
        <label className="admin-field">处理备注（可选）<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="记录给审核日志的内部备注，不会展示给用户" /></label>
        {modalError ? <div className="admin-alert admin-alert-error" role="alert">{modalError}</div> : null}
        <div className="admin-modal-actions">
          <button className="admin-btn admin-btn-light" type="button" disabled={busy} onClick={() => setPendingAction(null)}>取消</button>
          <button className={modalCopy[pendingAction].danger ? "admin-btn admin-btn-danger-fill" : "admin-btn admin-btn-primary"} type="button" disabled={busy} onClick={() => void runAction(pendingAction)}>{busy ? "处理中…" : modalCopy[pendingAction].confirm}</button>
        </div>
      </div></div> : null}

      {reminderTarget ? <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !reminderBusy) setReminderTarget(null); }}><form className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="report-reminder-title" onSubmit={submitReminder}>
        <div className="admin-modal-header"><div><h2 id="report-reminder-title">向举报人发送规则提醒？</h2><p className="admin-modal-desc">提醒将发送给“{reminderTarget.nickname}”的站内通知，不写入违规记录，也不会自动限制举报功能。</p></div></div>
        <div className="admin-field admin-warn-reason-field"><span className="admin-field-label">常见提醒原因</span><div className="admin-warn-reason-options">{reminderQuickReasons.map((item) => <button className={reminderReason === item && !reminderCustomReason ? "admin-warn-reason-chip is-selected" : "admin-warn-reason-chip"} type="button" key={item} disabled={reminderBusy} onClick={() => { setReminderReason(item); setReminderCustomReason(false); }}>{item}</button>)}<button className={reminderCustomReason ? "admin-warn-reason-chip is-other is-selected" : "admin-warn-reason-chip is-other"} type="button" disabled={reminderBusy} onClick={() => { setReminderCustomReason(true); if (!reminderReason.trim()) setReminderReason(""); }}>其他原因</button></div></div>
        <label className="admin-field">提醒内容<input value={reminderCustomReason ? reminderReason : ""} onChange={(event) => setReminderReason(event.target.value)} maxLength={500} placeholder={reminderCustomReason ? "请输入提醒内容，会展示给用户" : "请选择上方常见原因，或点“其他原因”输入"} disabled={reminderBusy || !reminderCustomReason} /></label>
        {reminderError ? <div className="admin-alert admin-alert-error" role="alert">{reminderError}</div> : null}
        <div className="admin-modal-actions">
          <button className="admin-btn admin-btn-light" type="button" disabled={reminderBusy} onClick={() => setReminderTarget(null)}>取消</button>
          <button className="admin-btn admin-btn-primary" type="submit" disabled={reminderBusy}>{reminderBusy ? "发送中…" : "发送提醒"}</button>
        </div>
      </form></div> : null}

      {success ? <div className="admin-toast" role="status">{success}</div> : null}
    </main>
  );
}
