"use client";
/* eslint-disable @next/next/no-img-element -- 头像按数据库地址展示。 */

import Link from "next/link";
import { FormEvent, useState } from "react";
import { fetchWithTimeout } from "@/lib/adminFetch";
import { normalizeModerationReason } from "@/lib/moderationReasons";
import AdminDetailFrame from "../../AdminDetailFrame";

type RecentReportRow = {
  id: string;
  target_type?: string | null;
  target_id?: string | null;
  target_title?: string | null;
  target_nickname?: string | null;
  reason_category?: string | null;
  details?: string | null;
  status?: string | null;
  created_at?: string | null;
};

type TargetDistributionRow = {
  target_type?: string | null;
  target_id?: string | null;
  target_title?: string | null;
  target_user_id?: string | null;
  target_nickname?: string | null;
  count?: number;
  last_at?: string | null;
};

type MaliciousHistoryRow = {
  id: string;
  category?: string | null;
  summary?: string | null;
  status?: string | null;
  confirmed_at?: string | null;
};

type RestrictionHistoryRow = {
  id: string;
  restriction_type?: string | null;
  status?: string | null;
  reason?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  lifted_at?: string | null;
  created_at?: string | null;
};

type ReporterDetailPayload = {
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
  reporter_stats: {
    total_reports?: number;
    pending_reports?: number;
    valid_reports?: number;
    invalid_reports?: number;
    duplicate_attempts?: number;
    reports_last_24h?: number;
    reports_last_30d?: number;
    last_report_at?: string | null;
    report_restricted_until?: string | null;
    malicious_report_count?: number;
    report_restriction_count?: number;
    low_quality?: boolean;
    low_quality_reason?: string | null;
    low_quality_at?: string | null;
    risk_score?: number;
    risk_level?: "normal" | "high" | "urgent";
  };
  report_permission: {
    status: "active" | "restricted";
    restricted_until?: string | null;
  };
  recent_reports: RecentReportRow[];
  target_distribution: TargetDistributionRow[];
  focused_target: { target_user_id: string; nickname?: string | null; count: number } | null;
  malicious_history: MaliciousHistoryRow[];
  restriction_history: RestrictionHistoryRow[];
};

type ModalKind = "keep" | "lowQuality" | null;

const userStatusLabels: Record<string, string> = { active: "正常", warned: "已警告", restricted: "受限", suspended: "已暂停", banned: "已封禁" };
const riskLabels: Record<string, string> = { normal: "正常", high: "高风险", urgent: "紧急风险" };
const targetTypeLabels: Record<string, string> = { post: "作品", comment: "评论", user: "用户" };
const reportStatusLabels: Record<string, string> = { pending: "待处理", reviewing: "处理中", resolved: "已处理", cancelled: "已取消" };

const dateText = (value?: string | null) => value ? new Date(value).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" }) : "—";
const fullDate = (value?: string | null) => value ? new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }) : "—";

export default function ReporterDetailClient({ detail, adminInitial = "A" }: { detail: ReporterDetailPayload; adminInitial?: string }) {
  const [modal, setModal] = useState<ModalKind>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [copiedId, setCopiedId] = useState(false);

  const user = detail.user;
  const stats = detail.reporter_stats;
  const lowQuality = Boolean(stats.low_quality);
  const isRestricted = detail.report_permission.status === "restricted";

  const copyUserId = async () => {
    try {
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(user.id);
      setCopiedId(true);
      setSuccess("已复制用户 ID");
      window.setTimeout(() => setCopiedId(false), 1500);
    } catch {
      setSuccess("复制失败，请手动复制。");
    }
  };

  const openKeep = () => {
    setReason(""); setError(""); setSuccess(""); setModal("keep");
  };

  const openLowQuality = () => {
    setReason(""); setError(""); setSuccess(""); setModal("lowQuality");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (modal === "lowQuality" && !reason.trim()) { setError("请填写处理说明。"); return; }
    setBusy(true); setError(""); setSuccess("");
    try {
      const url = modal === "keep" ? "/api/admin/reporters/keep" : "/api/admin/reporters/low-quality";
      const body = modal === "keep"
        ? { userId: user.id, reason: reason.trim() || null }
        : { userId: user.id, lowQuality: !lowQuality, reason: reason.trim() };
      const response = await fetchWithTimeout(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json().catch(() => null) as { error?: string; message?: string } | null;
      setBusy(false);
      if (!response.ok) { setError(payload?.error || "操作失败，请稍后重试。"); return; }
      setModal(null);
      setReason("");
      setSuccess(payload?.message || "操作已完成。");
      window.setTimeout(() => window.location.reload(), 900);
    } catch (caught) {
      setBusy(false);
      setError(caught instanceof Error ? caught.message : "操作失败，请稍后重试。");
    }
  };

  const statusPill = <span className={`admin-user-status ${user.moderation_status || ""}`}>{userStatusLabels[user.moderation_status || ""] || user.moderation_status || "未知"}</span>;

  return (
    <AdminDetailFrame activeView="reportwork" breadcrumb="管理后台 / 举报者风险 / 详情" adminInitial={adminInitial}>
    <div className="admin-reporter-detail-page admin-detail-shell">
      <header className="admin-detail-top">
        <Link href="/admin?view=reportwork" className="admin-btn admin-btn-light">← 返回作品举报</Link>
        <span className="admin-detail-queue-label">举报者风险详情</span>
        <button className="admin-btn admin-btn-light" type="button" disabled>下一个举报者 →</button>
      </header>

      <div className="admin-review-heading">
        <div className="admin-detail-title-line">
          {statusPill}
          <span className="admin-reporter-risk-pill">{riskLabels[stats.risk_level || "normal"] || "正常"}</span>
          <h1>{user.nickname || "未命名用户"}</h1>
        </div>
        <div className="admin-detail-meta-line">
          <p className="admin-detail-meta">
            举报者风险 · 注册于 {fullDate(user.created_at)} · 举报权限：{isRestricted ? `受限${detail.report_permission.restricted_until ? `至 ${dateText(detail.report_permission.restricted_until)}` : ""}` : "正常"}
            {user.moderated_at ? ` · 最近处置 ${fullDate(user.moderated_at)}` : ""}
          </p>
          <div className="admin-entity-ids"><button type="button" className={`admin-copy-id${copiedId ? " is-copied" : ""}`} title="点击复制用户 ID" onClick={() => void copyUserId()}>{copiedId ? "已复制用户 ID" : `用户 ${user.id}`}</button></div>
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
            <div className="admin-panel-title-row"><h2>举报行为统计</h2><span>{stats.risk_level === "normal" ? "正常" : riskLabels[stats.risk_level || "normal"]}</span></div>
            <dl>
              <dt>累计举报 / 成立 / 不成立</dt><dd>{stats.total_reports ?? 0} / {stats.valid_reports ?? 0} / {stats.invalid_reports ?? 0}</dd>
              <dt>待处理 / 重复尝试</dt><dd>{stats.pending_reports ?? 0} / {stats.duplicate_attempts ?? 0}</dd>
              <dt>24 小时 / 30 天举报</dt><dd>{stats.reports_last_24h ?? 0} / {stats.reports_last_30d ?? 0}</dd>
              <dt>风险分</dt><dd>{stats.risk_score ?? 0} / 100</dd>
              <dt>恶意举报记录</dt><dd>{stats.malicious_report_count ?? 0} 次</dd>
              <dt>举报限制次数</dt><dd>{stats.report_restriction_count ?? 0} 次</dd>
              <dt>最近举报</dt><dd>{fullDate(stats.last_report_at)}</dd>
              <dt>低质量队列</dt><dd>{lowQuality ? `已标记（${stats.low_quality_reason || "未填写原因"}）` : "未标记"}</dd>
            </dl>
          </section>
        </aside>

        <article className="admin-detail-content">
          <section className="admin-detail-panel admin-content-panel">
            <div className="admin-panel-title-row"><h2>近期举报</h2><span>{detail.recent_reports.length} 条</span></div>
            {detail.recent_reports.length ? <div className="admin-risk-list">{detail.recent_reports.map((row) => <div className="admin-risk-item" key={row.id}>
              <strong>{targetTypeLabels[row.target_type || ""] || "内容"}举报 · {reportStatusLabels[row.status || ""] || row.status || "未知"}</strong>
              <span>{row.target_title || "未知对象"}{row.target_nickname ? ` · ${row.target_nickname}` : ""}</span>
              <small>{normalizeModerationReason(row.reason_category) || "未填写原因"}{row.details ? ` · ${row.details}` : ""}</small>
              <small className="admin-mono">{dateText(row.created_at)} · 对象 ID {row.target_id || "—"}</small>
            </div>)}</div> : <p className="admin-detail-empty">该用户还没有举报记录。</p>}
          </section>

          <section className="admin-detail-panel admin-content-panel">
            <div className="admin-panel-title-row"><h2>举报对象分布</h2><span>{detail.target_distribution.length} 类</span></div>
            {detail.target_distribution.length ? <div className="admin-risk-list">{detail.target_distribution.map((row, index) => <div className="admin-risk-item" key={`${row.target_type}-${row.target_id}-${index}`}>
              <strong>{targetTypeLabels[row.target_type || ""] || "内容"} · {row.target_title || "未知对象"} ×{row.count ?? 0}</strong>
              <div className="admin-risk-tags"><span>{row.target_nickname ? `对象用户：${row.target_nickname}` : "对象用户未知"}</span><span>最近 {dateText(row.last_at)}</span></div>
            </div>)}</div> : <p className="admin-detail-empty">暂无举报对象分布。</p>}
            {detail.focused_target ? <div className="admin-notice-hint">集中举报对象：{detail.focused_target.nickname || "未命名用户"}（{detail.focused_target.count} 次）</div> : null}
          </section>

          <section className="admin-detail-panel admin-content-panel">
            <div className="admin-panel-title-row"><h2>恶意举报历史</h2><span>{detail.malicious_history.length} 条</span></div>
            {detail.malicious_history.length ? <div className="admin-risk-list">{detail.malicious_history.map((row) => <div className="admin-risk-item" key={row.id}>
              <strong>{normalizeModerationReason(row.category) || "恶意举报"} · {row.status === "active" ? "有效" : "已撤销"}</strong>
              {row.summary ? <small>{row.summary}</small> : null}
              <small>确认于 {fullDate(row.confirmed_at)}</small>
            </div>)}</div> : <p className="admin-detail-empty">没有恶意举报确认记录。</p>}
          </section>

          <section className="admin-detail-panel admin-content-panel">
            <div className="admin-panel-title-row"><h2>举报限制历史</h2><span>{detail.restriction_history.length} 条</span></div>
            {detail.restriction_history.length ? <div className="admin-risk-list">{detail.restriction_history.map((row) => <div className="admin-risk-item" key={row.id}>
              <strong>举报限制 · {row.status === "active" ? "生效中" : "已解除"}</strong>
              <div className="admin-risk-tags"><span>{dateText(row.starts_at)} 起</span>{row.ends_at ? <span>至 {dateText(row.ends_at)}</span> : <span>永久</span>}{row.lifted_at ? <span>解除于 {dateText(row.lifted_at)}</span> : null}</div>
              {row.reason ? <small>原因：{row.reason}</small> : null}
            </div>)}</div> : <p className="admin-detail-empty">没有举报限制记录。</p>}
          </section>
        </article>

        <aside className="admin-review-action-column">
          <section className="admin-detail-panel">
            <h2>举报者处置</h2>
            <p>确认保留权限不会改变现有限制，只写入审计日志；低质量队列标记用于风险筛选，不会自动限制功能。</p>
            <div className="admin-report-actions-column">
              <button className="admin-detail-secondary" type="button" onClick={openKeep}>保留举报权限</button>
              <button className={lowQuality ? "admin-detail-danger" : "admin-detail-secondary"} type="button" onClick={openLowQuality}>{lowQuality ? "移出低质量队列" : "标记低质量举报"}</button>
              <Link className="admin-detail-secondary admin-link-button" href={`/admin/users/${user.id}`}>打开用户详情</Link>
            </div>
          </section>
        </aside>
      </div>

      {modal ? <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setModal(null); }}><form className="admin-modal" role="dialog" aria-modal="true" aria-labelledby={modal === "keep" ? "keep-report-title" : "low-quality-title"} onSubmit={submit}>
        <div className="admin-modal-header"><div><h2 id={modal === "keep" ? "keep-report-title" : "low-quality-title"}>{modal === "keep" ? "确认保留该用户的举报权限？" : lowQuality ? "移出低质量举报队列？" : "标记该用户为低质量举报？"}</h2><p className="admin-modal-desc">{modal === "keep" ? "该操作只写入审核日志，保留现有举报限制与统计不变，便于说明管理员已复核该举报者。" : "标记后会在举报中心的风险筛选与列表中优先展示，方便后续集中复核；可随时移出。"}</p></div></div>
        <label className="admin-field">{modal === "keep" ? "处理说明（可选）" : "处理说明（必填）"}<textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder={modal === "keep" ? "记录保留权限的原因，会写入审核日志" : "记录标记低质量的原因，会写入审核日志"} disabled={busy} /></label>
        {error ? <div className="admin-alert admin-alert-error" role="alert">{error}</div> : null}
        <div className="admin-modal-actions">
          <button className="admin-btn admin-btn-light" type="button" disabled={busy} onClick={() => setModal(null)}>取消</button>
          <button className={modal === "lowQuality" && !lowQuality ? "admin-btn admin-btn-danger-fill" : "admin-btn admin-btn-primary"} type="submit" disabled={busy}>{busy ? "提交中…" : "确认提交"}</button>
        </div>
      </form></div> : null}

      {success ? <div className="admin-toast" role="status">{success}</div> : null}
    </div>
    </AdminDetailFrame>
  );
}
