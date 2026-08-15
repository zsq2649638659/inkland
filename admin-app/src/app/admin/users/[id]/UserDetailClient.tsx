"use client";
/* eslint-disable @next/next/no-img-element -- 头像按数据库地址展示。 */

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type UserDetailPayload = {
  ok: boolean;
  user: {
    id: string;
    nickname?: string | null;
    avatar_url?: string | null;
    bio?: string | null;
    created_at?: string | null;
    moderation_status?: string | null;
    moderation_note?: string | null;
    moderated_at?: string | null;
  };
  stats: {
    total_report_cases: number;
    pending_report_cases: number;
    active_violations: number;
    total_violations: number;
    deleted_items: number;
    active_restrictions: number;
  };
  recent_posts: Array<{
    id: string;
    title?: string | null;
    post_type?: string | null;
    status?: string | null;
    review_status?: string | null;
    visibility?: string | null;
    published_at?: string | null;
    created_at?: string | null;
  }>;
  recent_comments: Array<{
    id: string;
    post_id?: string | null;
    parent_id?: string | null;
    content?: string | null;
    created_at?: string | null;
  }>;
  violations: Array<{
    id: string;
    source_type?: string | null;
    content_type?: string | null;
    category?: string | null;
    severity?: string | null;
    summary?: string | null;
    status?: string | null;
    confirmed_at?: string | null;
    revoked_at?: string | null;
    metadata?: Record<string, unknown> | null;
  }>;
  restrictions: Array<{
    id: string;
    restriction_type?: string | null;
    status?: string | null;
    reason?: string | null;
    starts_at?: string | null;
    ends_at?: string | null;
    lifted_at?: string | null;
    created_at?: string | null;
    metadata?: Record<string, unknown> | null;
  }>;
  reporter_stats: {
    total_reports?: number;
    pending_reports?: number;
    valid_reports?: number;
    invalid_reports?: number;
    duplicate_attempts?: number;
    reports_last_24h?: number;
    last_report_at?: string | null;
    report_restricted_until?: string | null;
  } | null;
};

type EnforcementAction = "warn" | "restrict_comment" | "restrict_publish" | "restrict_report" | "suspend" | "ban";
type LiftMode = "lift" | "restore";

const statusLabels: Record<string, string> = {
  active: "正常",
  warned: "已警告",
  restricted: "受限",
  suspended: "已暂停",
  banned: "已封禁",
};
const restrictionLabels: Record<string, string> = {
  comment: "评论限制",
  publish: "发布限制",
  report: "举报限制",
  account: "账号处罚",
};
const severityLabels: Record<string, string> = {
  minor: "轻微",
  standard: "普通",
  serious: "严重",
  critical: "紧急",
};
const actionCopy: Record<EnforcementAction, { label: string; title: string; desc: string; danger?: boolean }> = {
  warn: { label: "发送警告", title: "向用户发送账号警告？", desc: "警告会写入违规记录并通知用户，账号状态变为“已警告”。不计入功能限制。" },
  restrict_comment: { label: "限制评论", title: "限制该用户发表评论？", desc: "选择结束时间。限制期间评论提交会被前台和数据库双重拦截。" },
  restrict_publish: { label: "限制发布", title: "限制该用户发布内容？", desc: "选择结束时间。限制期间不能新发布、提交审核或重新提交连载审核。" },
  restrict_report: { label: "限制举报", title: "限制该用户提交举报？", desc: "选择结束时间。限制期间作品与评论举报都会被拦截。" },
  suspend: { label: "暂停账号", title: "暂停该用户账号？", desc: "选择结束时间。暂停期间评论、发布和举报均被拦截；已发布内容可勾选隐藏。" },
  ban: { label: "永久封禁", title: "永久封禁该用户账号？", desc: "永久封禁不需要结束时间。账号无法评论、发布或举报；已发布内容可勾选隐藏。" },
};

const dateText = (value?: string | null) => value ? new Date(value).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const fullDate = (value?: string | null) => value ? new Date(value).toLocaleString("zh-CN") : "—";

export default function UserDetailClient({ detail }: { detail: UserDetailPayload }) {
  const [enforceOpen, setEnforceOpen] = useState(false);
  const [liftOpen, setLiftOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [action, setAction] = useState<EnforcementAction>("warn");
  const [reason, setReason] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [countViolation, setCountViolation] = useState(true);
  const [hideContent, setHideContent] = useState(false);
  const [note, setNote] = useState("");

  const [liftMode, setLiftMode] = useState<LiftMode>("lift");
  const [liftType, setLiftType] = useState("all");
  const [liftReason, setLiftReason] = useState("");
  const [restoreContent, setRestoreContent] = useState(false);
  const [liftNote, setLiftNote] = useState("");

  const user = detail.user;
  const stats = detail.stats;
  const needsEnds = ["restrict_comment", "restrict_publish", "restrict_report", "suspend"].includes(action);

  useEffect(() => {
    if (!enforceOpen && !liftOpen) setError("");
  }, [enforceOpen, liftOpen]);

  const submitEnforce = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reason.trim()) { setError("请填写处罚原因。"); return; }
    if (needsEnds && !endsAt) { setError("请选择结束时间。"); return; }
    setBusy(true); setError(""); setSuccess("");
    const response = await fetch("/api/admin/users/enforce", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: user.id,
        action,
        reason: reason.trim(),
        countViolation,
        endsAt: needsEnds ? new Date(endsAt).toISOString() : null,
        hideContent,
        note: note.trim() || null,
      }),
    });
    const payload = await response.json().catch(() => null) as { error?: string; message?: string } | null;
    setBusy(false);
    if (!response.ok) { setError(payload?.error || "处罚操作失败，请稍后重试。"); return; }
    setEnforceOpen(false);
    setSuccess(payload?.message || "处罚已生效。");
    setReason(""); setEndsAt(""); setCountViolation(true); setHideContent(false); setNote("");
    window.setTimeout(() => window.location.reload(), 900);
  };

  const submitLift = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!liftReason.trim()) { setError("请填写解除原因。"); return; }
    setBusy(true); setError(""); setSuccess("");
    const response = await fetch("/api/admin/users/lift", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: user.id,
        action: liftMode,
        restrictionType: liftMode === "restore" ? "account" : liftType,
        reason: liftReason.trim(),
        restoreContent,
        note: liftNote.trim() || null,
      }),
    });
    const payload = await response.json().catch(() => null) as { error?: string; message?: string } | null;
    setBusy(false);
    if (!response.ok) { setError(payload?.error || "解除操作失败，请稍后重试。"); return; }
    setLiftOpen(false);
    setSuccess(payload?.message || "操作已完成。");
    setLiftReason(""); setRestoreContent(false); setLiftNote("");
    window.setTimeout(() => window.location.reload(), 900);
  };

  const statusPill = (status?: string | null) => <span className={`admin-user-status ${status || ""}`}>{statusLabels[status || ""] || status || "未知"}</span>;

  return (
    <main className="admin-detail-shell">
      <header className="admin-detail-top">
        <Link href="/admin?view=users" className="admin-back-link">← 返回用户管理</Link>
        <span className="admin-detail-status">{statusPill(user.moderation_status)}</span>
      </header>

      <div className="admin-review-heading">
        <div className="admin-detail-kicker">USER ACCOUNT · {user.id?.slice(0, 8).toUpperCase() || "USER"}</div>
        <h1>{user.nickname || "未命名用户"}</h1>
        <div className="admin-detail-meta">
          注册于 {fullDate(user.created_at)} · 账号状态：{statusLabels[user.moderation_status || ""] || user.moderation_status || "未知"}
          {user.moderated_at ? ` · 最近处置 ${fullDate(user.moderated_at)}` : ""}
        </div>
      </div>

      <div className="admin-review-layout">
        <aside className="admin-review-summary-column">
          <section className="admin-detail-panel">
            <div className="admin-user-profile">
              {user.avatar_url ? <img src={user.avatar_url} alt="用户头像" className="admin-user-avatar" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : <span className="admin-user-avatar admin-user-avatar-empty">{(user.nickname || "用").slice(0, 1)}</span>}
              <div><strong>{user.nickname || "未命名用户"}</strong><span>用户 ID</span><code className="admin-mono">{user.id}</code></div>
            </div>
            {user.bio ? <p className="admin-user-bio">{user.bio}</p> : <p>该用户没有填写个人简介。</p>}
            {user.moderation_note ? <div className="admin-moderation-note"><strong>最近处置说明</strong><span>{user.moderation_note}</span></div> : null}
          </section>

          <section className="admin-detail-panel">
            <h2>账号统计</h2>
            <div className="admin-user-stat-grid">
              <div><strong>{stats.total_report_cases}</strong><span>举报案件</span></div>
              <div><strong>{stats.pending_report_cases}</strong><span>待处理</span></div>
              <div><strong>{stats.active_violations}</strong><span>有效违规</span></div>
              <div><strong>{stats.total_violations}</strong><span>确认违规</span></div>
              <div><strong>{stats.deleted_items}</strong><span>删除内容</span></div>
              <div><strong>{stats.active_restrictions}</strong><span>有效限制</span></div>
            </div>
          </section>

          <section className="admin-detail-panel">
            <div className="admin-panel-title-row"><h2>举报行为</h2><span>{detail.reporter_stats?.total_reports ?? 0} 次</span></div>
            {detail.reporter_stats ? <dl>
              <dt>待处理举报</dt><dd>{detail.reporter_stats.pending_reports ?? 0}</dd>
              <dt>成立 / 不成立</dt><dd>{detail.reporter_stats.valid_reports ?? 0} / {detail.reporter_stats.invalid_reports ?? 0}</dd>
              <dt>重复尝试</dt><dd>{detail.reporter_stats.duplicate_attempts ?? 0}</dd>
              <dt>24 小时举报</dt><dd>{detail.reporter_stats.reports_last_24h ?? 0}</dd>
              <dt>最近举报</dt><dd>{fullDate(detail.reporter_stats.last_report_at)}</dd>
              <dt>举报受限至</dt><dd>{fullDate(detail.reporter_stats.report_restricted_until)}</dd>
            </dl> : <p>该用户没有举报行为统计。</p>}
          </section>

          <section className="admin-detail-panel">
            <div className="admin-panel-title-row"><h2>违规记录</h2><span>{detail.violations.length} 条</span></div>
            {detail.violations.length ? <div className="admin-risk-list">{detail.violations.map((item) => <div className="admin-risk-item" key={item.id}>
              <strong>{item.content_type || "账号"} · {item.category || "未分类"}</strong>
              <div className="admin-risk-tags"><span>{severityLabels[item.severity || ""] || item.severity}</span><span>{item.status === "active" ? "有效" : "已撤销"}</span></div>
              {item.summary ? <small>{item.summary}</small> : null}
              <small>确认于 {fullDate(item.confirmed_at)}{item.revoked_at ? ` · 撤销于 ${fullDate(item.revoked_at)}` : ""}</small>
            </div>)}</div> : <p className="admin-detail-empty">该用户没有确认违规记录。</p>}
          </section>
        </aside>

        <article className="admin-detail-content">
          <section className="admin-detail-panel admin-content-panel">
            <div className="admin-panel-title-row"><h2>最近作品</h2><span>{detail.recent_posts.length} 条</span></div>
            {detail.recent_posts.length ? <div className="admin-table">{detail.recent_posts.map((post) => <div className="admin-table-row" key={post.id}>
              <div className="admin-work-cell"><div className="admin-work-thumb">{(post.title || "未").slice(0, 1)}</div><div><strong>{post.title || "无标题"}</strong><span>{post.post_type || "作品"} · 状态 {post.status || "—"}{post.review_status ? ` · 审核 ${post.review_status}` : ""}</span></div></div>
              <span className="admin-date-cell">{dateText(post.published_at || post.created_at)}</span>
            </div>)}</div> : <p className="admin-detail-empty">该用户没有作品记录。</p>}
          </section>

          <section className="admin-detail-panel admin-content-panel">
            <div className="admin-panel-title-row"><h2>最近评论</h2><span>{detail.recent_comments.length} 条</span></div>
            {detail.recent_comments.length ? <div className="admin-risk-list">{detail.recent_comments.map((comment) => <div className="admin-risk-item" key={comment.id}>
              <strong>评论于 {fullDate(comment.created_at)}</strong>
              <small>{comment.content || "评论内容已删除"}</small>
              <small className="admin-mono">评论 ID {comment.id} · 作品 ID {comment.post_id || "—"}</small>
            </div>)}</div> : <p className="admin-detail-empty">该用户没有评论记录。</p>}
          </section>

          <section className="admin-detail-panel admin-content-panel">
            <div className="admin-panel-title-row"><h2>限制历史</h2><span>{detail.restrictions.length} 条</span></div>
            {detail.restrictions.length ? <div className="admin-risk-list">{detail.restrictions.map((item) => <div className="admin-risk-item" key={item.id}>
              <strong>{restrictionLabels[item.restriction_type || ""] || item.restriction_type || "限制"} · {item.status === "active" ? "生效中" : "已解除"}</strong>
              <div className="admin-risk-tags"><span>{dateText(item.starts_at)} 起</span>{item.ends_at ? <span>至 {dateText(item.ends_at)}</span> : <span>永久</span>}{item.lifted_at ? <span>解除于 {dateText(item.lifted_at)}</span> : null}</div>
              {item.reason ? <small>原因：{item.reason}</small> : null}
            </div>)}</div> : <p className="admin-detail-empty">该用户没有限制记录。</p>}
          </section>
        </article>

        <aside className="admin-review-action-column">
          <section className="admin-detail-panel">
            <h2>账号处置</h2>
            <p>处罚会真实限制前台功能；是否计入确认违规由你勾选，不会自动累积。</p>
            <div className="admin-report-actions-column">
              {(Object.keys(actionCopy) as EnforcementAction[]).map((key) => <button className={actionCopy[key].danger ? "admin-detail-danger" : "admin-detail-secondary"} key={key} onClick={() => { setAction(key); setError(""); setSuccess(""); setEnforceOpen(true); }}>{actionCopy[key].label}</button>)}
            </div>
          </section>

          <section className="admin-detail-panel">
            <h2>解除与恢复</h2>
            <p>解除单项/全部功能限制，或恢复暂停、封禁账号。</p>
            <div className="admin-report-actions-column">
              <button className="admin-detail-secondary" onClick={() => { setLiftMode("lift"); setLiftType("all"); setError(""); setSuccess(""); setLiftOpen(true); }}>解除功能限制</button>
              <button className="admin-detail-secondary" onClick={() => { setLiftMode("restore"); setRestoreContent(false); setError(""); setSuccess(""); setLiftOpen(true); }}>恢复账号</button>
            </div>
          </section>
        </aside>
      </div>

      {enforceOpen ? <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setEnforceOpen(false); }}><form className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="enforce-user-title" onSubmit={submitEnforce}>
        <div className="admin-modal-header"><div><h2 id="enforce-user-title">{actionCopy[action].title}</h2><p className="admin-modal-desc">{actionCopy[action].desc}</p></div></div>
        <label className="admin-field">处罚类型<select value={action} onChange={(event) => setAction(event.target.value as EnforcementAction)} disabled={busy}><option value="warn">发送警告</option><option value="restrict_comment">限制评论</option><option value="restrict_publish">限制发布</option><option value="restrict_report">限制举报</option><option value="suspend">暂停账号</option><option value="ban">永久封禁</option></select></label>
        <label className="admin-field">处罚原因<input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder="必填，会展示给用户并写入通知" disabled={busy} /></label>
        {needsEnds ? <label className="admin-field">结束时间<input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} disabled={busy} /></label> : null}
        <label className="admin-field admin-check-field"><input type="checkbox" checked={countViolation} onChange={(event) => setCountViolation(event.target.checked)} disabled={busy} /><span>计入确认违规（手动确认才累计，与收到举报次数无关）</span></label>
        {action === "suspend" || action === "ban" ? <label className="admin-field admin-check-field"><input type="checkbox" checked={hideContent} onChange={(event) => setHideContent(event.target.checked)} disabled={busy} /><span>隐藏该用户已发布的作品（不删除，恢复时可选还原）</span></label> : null}
        <label className="admin-field">内部备注（可选）<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="记录给审核日志的内部备注，不会展示给用户" disabled={busy} /></label>
        {error ? <div className="admin-alert admin-alert-error" role="alert">{error}</div> : null}
        <div className="admin-modal-actions">
          <button className="admin-btn admin-btn-light" type="button" disabled={busy} onClick={() => setEnforceOpen(false)}>取消</button>
          <button className={actionCopy[action].danger ? "admin-btn admin-btn-danger-fill" : "admin-btn admin-btn-primary"} type="submit" disabled={busy}>{busy ? "提交中…" : "确认处罚"}</button>
        </div>
      </form></div> : null}

      {liftOpen ? <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setLiftOpen(false); }}><form className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="lift-user-title" onSubmit={submitLift}>
        <div className="admin-modal-header"><div><h2 id="lift-user-title">{liftMode === "restore" ? "恢复该用户账号？" : "解除功能限制？"}</h2><p className="admin-modal-desc">{liftMode === "restore" ? "恢复后账号回到正常或警告状态；勾选可同时还原此前被隐藏的已发布作品。" : "可解除单项限制，或选择“全部”一次解除所有功能限制。"}</p></div></div>
        {liftMode === "lift" ? <label className="admin-field">解除类型<select value={liftType} onChange={(event) => setLiftType(event.target.value)} disabled={busy}><option value="all">全部限制</option><option value="comment">评论限制</option><option value="publish">发布限制</option><option value="report">举报限制</option><option value="account">账号处罚</option></select></label> : null}
        <label className="admin-field">解除原因<input value={liftReason} onChange={(event) => setLiftReason(event.target.value)} maxLength={500} placeholder="必填，会展示给用户并写入通知" disabled={busy} /></label>
        {liftMode === "restore" ? <label className="admin-field admin-check-field"><input type="checkbox" checked={restoreContent} onChange={(event) => setRestoreContent(event.target.checked)} disabled={busy} /><span>还原此前因暂停/封禁隐藏的已发布作品</span></label> : null}
        <label className="admin-field">内部备注（可选）<textarea value={liftNote} onChange={(event) => setLiftNote(event.target.value)} maxLength={500} placeholder="记录给审核日志的内部备注，不会展示给用户" disabled={busy} /></label>
        {error ? <div className="admin-alert admin-alert-error" role="alert">{error}</div> : null}
        <div className="admin-modal-actions">
          <button className="admin-btn admin-btn-light" type="button" disabled={busy} onClick={() => setLiftOpen(false)}>取消</button>
          <button className="admin-btn admin-btn-primary" type="submit" disabled={busy}>{busy ? "提交中…" : liftMode === "restore" ? "确认恢复" : "确认解除"}</button>
        </div>
      </form></div> : null}

      {success ? <div className="admin-toast" role="status">{success}</div> : null}
    </main>
  );
}
