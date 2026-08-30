"use client";
/* eslint-disable @next/next/no-img-element -- 头像按数据库地址展示。 */

import Link from "next/link";
import { FormEvent, useState } from "react";
import { fetchWithTimeout } from "@/lib/adminFetch";
import { MODERATION_REASON_OPTIONS, normalizeModerationReason } from "@shared/moderationReasons";
import AdminDetailFrame from "../../AdminDetailFrame";

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
    recent_reports?: Array<{
      id: string;
      target_type?: string | null;
      target_id?: string | null;
      reason_category?: string | null;
      details?: string | null;
      status?: string | null;
      created_at?: string | null;
    }> | null;
  } | null;
};

type ProfileRevisionRow = {
  id: string;
  issue_type: string;
  issue_detail?: string | null;
  hidden_fields?: string[] | string | null;
  status?: string | null;
  created_at?: string | null;
  confirmed_at?: string | null;
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
  profile_edit: "资料编辑限制",
  interact: "互动限制",
  account: "账号处罚",
};
const revisionIssueLabels: Record<string, string> = {
  avatar: "修改头像",
  nickname: "修改昵称",
  bio: "修改个人简介",
  external_link: "删除外部链接",
};
const revisionStatusLabels: Record<string, string> = {
  requested: "等待用户修改",
  submitted: "用户已提交",
  confirmed: "已确认",
  cancelled: "已取消",
};
const severityLabels: Record<string, string> = {
  minor: "轻微",
  standard: "普通",
  serious: "严重",
  critical: "紧急",
};
const actionCopy: Record<EnforcementAction, { label: string; title: string; desc: string; danger?: boolean }> = {
  warn: { label: "正式警告…", title: "向用户发送账号警告？", desc: "警告会写入违规记录并通知用户，账号状态变为“已警告”。可点选常见原因，或点“其他原因”自行输入。" },
  restrict_comment: { label: "限制发言…", title: "限制该用户发表评论？", desc: "选择结束时间。限制期间评论提交会被前台和数据库双重拦截。" },
  restrict_publish: { label: "限制发布", title: "限制该用户发布内容？", desc: "选择结束时间。限制期间不能新发布、提交审核或重新提交连载审核。" },
  restrict_report: { label: "限制举报", title: "限制该用户提交举报？", desc: "选择结束时间。限制期间作品与评论举报都会被拦截。" },
  suspend: { label: "暂停账号", title: "暂停该用户账号？", desc: "选择结束时间。暂停期间评论、发布和举报均被拦截；未勾选隐藏时已发布内容保持展示。" },
  ban: { label: "封禁账号…", title: "永久封禁该用户账号？", desc: "永久封禁不需要结束时间。账号无法评论、发布或举报；未勾选隐藏时已发布内容保持展示。", danger: true },
};
const governanceGroups: Array<{
  level: string;
  label: string;
  description: string;
  tone: "low" | "medium" | "high" | "critical";
  actions: EnforcementAction[];
}> = [
  { level: "低", label: "提醒", description: "记录警告并通知用户，不限制功能。", tone: "low", actions: ["warn"] },
  { level: "中", label: "单项功能限制", description: "只关闭所选功能，可设置结束时间。", tone: "medium", actions: ["restrict_comment", "restrict_publish", "restrict_report"] },
  { level: "高", label: "暂停账号", description: "临时关闭评论、发布和举报。", tone: "high", actions: ["suspend"] },
  { level: "极高", label: "永久封禁", description: "永久停用账号功能，不设置结束时间。", tone: "critical", actions: ["ban"] },
];
const warningQuickReasons = [...MODERATION_REASON_OPTIONS];
const enforcementReasonPresets: Record<EnforcementAction, string[]> = {
  warn: warningQuickReasons,
  restrict_comment: ["人身攻击、骚扰与仇恨歧视", "无关内容、刷屏与恶意灌水", "其他违规"],
  restrict_publish: ["色情、淫秽与低俗", "涉未成年人不良信息", "广告、导流与恶意营销", "抄袭、盗用与其他侵权", "其他违规"],
  restrict_report: ["恶意举报", "短时间大量重复举报", "举报理由与内容明显无关", "滥用举报功能"],
  suspend: ["多项功能持续违规", "绕过限制继续违规", "严重扰乱社区秩序", "累计违规达到暂停标准"],
  ban: ["严重违规", "多次违规且拒不整改", "绕过限制持续违规", "恶意破坏社区秩序"],
};
const liftReasonPresets: Record<LiftMode, string[]> = {
  lift: ["限制期满，自动解除", "申诉复核通过", "确认原限制不适用", "用户完成整改", "治理决定调整"],
  restore: ["处罚期满，自动恢复", "申诉复核通过", "确认原处罚不适用", "用户完成整改", "治理决定调整"],
};
const reminderQuickReasons = ["举报理由与内容明显无关", "短时间大量重复举报", "反复举报已判定无问题内容", "补充说明含辱骂或威胁", "请勿滥用举报功能"];
const targetShortLabels: Record<string, string> = { post: "作品", comment: "评论", user: "用户" };
const reportStatusLabels: Record<string, string> = { pending: "待处理", reviewing: "处理中", resolved: "已处理", cancelled: "已取消" };
const quickDurations = [
  { label: "7 天", hours: 24 * 7 },
  { label: "1 个月", hours: 24 * 30 },
  { label: "半年", hours: 24 * 180 },
];

const dateText = (value?: string | null) => value ? new Date(value).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" }) : "—";
const fullDate = (value?: string | null) => value ? new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }) : "—";
const fmtDateTime = (value?: string | null) => {
  if (!value) return "未设置";
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")} ${pick("hour")}:${pick("minute")}`;
};
const toLocalInput = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export default function UserDetailClient({ detail, profileRevisions, adminInitial = "A" }: { detail: UserDetailPayload; profileRevisions: ProfileRevisionRow[]; adminInitial?: string }) {
  const [enforceOpen, setEnforceOpen] = useState(false);
  const [liftOpen, setLiftOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<ProfileRevisionRow | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState("");

  const [action, setAction] = useState<EnforcementAction>("warn");
  const [reason, setReason] = useState("");
  const [customReason, setCustomReason] = useState(false);
  const [endsAt, setEndsAt] = useState("");
  const [quickHours, setQuickHours] = useState<number | null>(null);
  const [countViolation, setCountViolation] = useState(true);
  const [hideContent, setHideContent] = useState(false);
  const [note, setNote] = useState("");

  const [liftMode, setLiftMode] = useState<LiftMode>("lift");
  const [liftType, setLiftType] = useState("all");
  const [liftReason, setLiftReason] = useState("");
  const [restoreContent, setRestoreContent] = useState(false);
  const [liftNote, setLiftNote] = useState("");

  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderReason, setReminderReason] = useState("");
  const [reminderCustomReason, setReminderCustomReason] = useState(false);
  const [reminderBusy, setReminderBusy] = useState(false);
  const [reminderError, setReminderError] = useState("");

  const [limitOpen, setLimitOpen] = useState(false);
  const [limitInput, setLimitInput] = useState("20");
  const [limitBusy, setLimitBusy] = useState(false);
  const [limitError, setLimitError] = useState("");
  const [copiedId, setCopiedId] = useState(false);

  const user = detail.user;
  const stats = detail.stats;
  const needsEnds = ["restrict_comment", "restrict_publish", "restrict_report", "suspend"].includes(action);
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
  const openEnforcement = (nextAction: EnforcementAction) => {
    setAction(nextAction);
    setReason("");
    setCustomReason(false);
    setEndsAt("");
    setQuickHours(null);
    setError("");
    setSuccess("");
    setEnforceOpen(true);
  };
  const pendingProfileRevisions = profileRevisions.filter((item) => item.status === "submitted").length;
  const attentionText = [
    stats.pending_report_cases ? `${stats.pending_report_cases} 个待处理举报案件` : "",
    stats.active_restrictions ? `${stats.active_restrictions} 项功能限制生效中` : "",
    pendingProfileRevisions ? `${pendingProfileRevisions} 条资料整改待确认` : "",
  ].filter(Boolean).join("；") || "当前没有待处理治理事项。";
  const governanceTrail = detail.restrictions.slice(0, 4).map((item) => `${dateText(item.starts_at || item.created_at)} · ${restrictionLabels[item.restriction_type || ""] || item.restriction_type || "账号处置"} · ${item.status === "active" ? "生效中" : item.status === "lifted" ? "已解除" : "已结束"}`);
  if (!governanceTrail.length && user.moderated_at) governanceTrail.push(`${fullDate(user.moderated_at)} · ${user.moderation_note || "最近处置已记录"}`);

  const notificationPreview = () => {
    const reasonText = customReason ? reason : reason || "未填写";
    const dateLabel = endsAt ? fmtDateTime(endsAt) : "未设置";
    if (action === "warn") {
      return `账号警告\n原因：${reasonText}\n请认真阅读并遵守社区规范，避免再次违规。`;
    }
    if (action.startsWith("restrict_")) {
      const label = action === "restrict_comment" ? "评论" : action === "restrict_publish" ? "发布" : "举报";
      return `功能限制\n你的${label}功能已被限制（至 ${dateLabel}）。\n原因：${reasonText}\n限制结束后相关功能会恢复。`;
    }
    if (action === "suspend") {
      return `账号暂停\n你的账号已被暂停（至 ${dateLabel}）。\n原因：${reasonText}\n影响范围：暂停期间无法发布或提交审核、无法创建连载与合集、无法评论或举报、无法编辑资料，也无法关注、点赞、收藏、写段评等互动。\n恢复说明：到期后账号将自动恢复，相关功能会重新开放。\n下一步：如需提交复核或反馈，可通过设置页反馈或联系客服邮箱联系我们。`;
    }
    if (action === "ban") {
      return `账号封禁\n你的账号已被永久封禁。\n原因：${reasonText}\n影响范围：账号无法发布或提交审核、无法创建连载与合集、无法评论或举报、无法编辑资料，也无法关注、点赞、收藏、写段评等互动。\n恢复说明：该处罚不可撤销，账号将保持封禁状态。\n下一步：如需提交反馈，可通过设置页反馈或联系客服邮箱联系我们。`;
    }
    return "";
  };

  const submitEnforce = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reason.trim()) { setError("请填写处罚原因。"); return; }
    if (needsEnds && !endsAt) { setError("请选择结束时间。"); return; }
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await fetchWithTimeout("/api/admin/users/enforce", {
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
      setReason(""); setCustomReason(false); setEndsAt(""); setQuickHours(null); setCountViolation(true); setHideContent(false); setNote("");
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      setBusy(false);
      setError(error instanceof Error ? error.message : "处罚操作失败，请稍后重试。");
    }
  };

  const submitLift = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!liftReason.trim()) { setError("请填写解除原因。"); return; }
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await fetchWithTimeout("/api/admin/users/lift", {
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
    } catch (error) {
      setBusy(false);
      setError(error instanceof Error ? error.message : "解除操作失败，请稍后重试。");
    }
  };

  const openReminder = () => {
    setReminderReason(""); setReminderCustomReason(false); setReminderError(""); setSuccess("");
    setReminderOpen(true);
  };

  const submitReminder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reminderReason.trim()) { setReminderError("请填写提醒内容。"); return; }
    setReminderBusy(true); setReminderError(""); setSuccess("");
    try {
      const response = await fetchWithTimeout("/api/admin/users/report-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, reason: reminderReason.trim() }),
      });
      const payload = await response.json().catch(() => null) as { error?: string; message?: string } | null;
      setReminderBusy(false);
      if (!response.ok) { setReminderError(payload?.error || "提醒发送失败，请稍后重试。"); return; }
      setReminderOpen(false);
      setReminderReason(""); setReminderCustomReason(false);
      setSuccess(payload?.message || "举报规则提醒已发送。");
    } catch (error) {
      setReminderBusy(false);
      setReminderError(error instanceof Error ? error.message : "提醒发送失败，请稍后重试。");
    }
  };

  const openLimit = async () => {
    setLimitOpen(true); setLimitBusy(true); setLimitError(""); setSuccess("");
    try {
      const response = await fetchWithTimeout("/api/admin/report-config");
      const payload = await response.json().catch(() => null) as { success?: boolean; dailyReportLimit?: number; error?: string } | null;
      setLimitBusy(false);
      if (!response.ok) { setLimitError(payload?.error || "举报上限读取失败，请稍后重试。"); return; }
      const current = payload?.dailyReportLimit ?? 20;
      setLimitInput(String(current));
    } catch (error) {
      setLimitBusy(false);
      setLimitError(error instanceof Error ? error.message : "举报上限读取失败，请稍后重试。");
    }
  };

  const submitLimit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = Number(limitInput);
    if (!Number.isInteger(value) || value < 1 || value > 1000) { setLimitError("每日举报上限需为 1 到 1000 之间的整数。"); return; }
    setLimitBusy(true); setLimitError(""); setSuccess("");
    try {
      const response = await fetchWithTimeout("/api/admin/report-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dailyReportLimit: value }),
      });
      const payload = await response.json().catch(() => null) as { success?: boolean; dailyReportLimit?: number; message?: string; error?: string } | null;
      setLimitBusy(false);
      if (!response.ok) { setLimitError(payload?.error || "举报上限更新失败，请稍后重试。"); return; }
      setLimitOpen(false);
      setLimitInput(String(payload?.dailyReportLimit ?? value));
      setSuccess(payload?.message || "每日举报上限已更新。");
    } catch (error) {
      setLimitBusy(false);
      setLimitError(error instanceof Error ? error.message : "举报上限更新失败，请稍后重试。");
    }
  };

  const submitConfirmRevision = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!confirmTarget) return;
    setConfirmBusy(true); setConfirmError("");
    try {
      const response = await fetchWithTimeout("/api/admin/users/profile-revision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: confirmTarget.id }),
      });
      const payload = await response.json().catch(() => null) as { error?: string; message?: string } | null;
      setConfirmBusy(false);
      if (!response.ok) { setConfirmError(payload?.error || "确认失败，请稍后重试。"); return; }
      setConfirmOpen(false); setConfirmTarget(null);
      setSuccess(payload?.message || "资料整改已确认，账号资料恢复正常展示。");
      window.setTimeout(() => window.location.reload(), 900);
    } catch (submitError) {
      setConfirmBusy(false);
      setConfirmError(submitError instanceof Error ? submitError.message : "确认失败，请稍后重试。");
    }
  };

  const statusPill = (status?: string | null) => <span className={`admin-user-status ${status || ""}`}>{statusLabels[status || ""] || status || "未知"}</span>;

  return (
    <AdminDetailFrame activeView="users" breadcrumb="管理后台 / 用户管理 / 详情" adminInitial={adminInitial}>
      <div className="admin-user-detail-page admin-detail-shell">
        <header className="admin-detail-top">
          <Link href="/admin?view=users" className="admin-btn admin-btn-light">← 上一个账号</Link>
          <span className="admin-detail-queue-label">账号列表第 1 / 1 个</span>
          <button className="admin-btn admin-btn-light" type="button" disabled>下一个账号 →</button>
        </header>

        <div className="admin-review-heading">
          <div className="admin-detail-title-line">
            {statusPill(user.moderation_status)}
            <h1>{user.nickname || "未命名用户"}</h1>
          </div>
          <div className="admin-detail-meta-line">
            <p className="admin-detail-meta">用户账号 · 注册于 {fullDate(user.created_at)} · 当前属于{statusLabels[user.moderation_status || ""] || user.moderation_status || "未知"}账号 · 最近处置 {user.moderated_at ? fullDate(user.moderated_at) : "未记录"}</p>
            <div className="admin-entity-ids"><button type="button" className={`admin-copy-id${copiedId ? " is-copied" : ""}`} title="点击复制用户 ID" onClick={() => void copyUserId()}>{copiedId ? "已复制用户 ID" : `用户 ${user.id}`}</button></div>
          </div>
        </div>

        <div className="admin-review-layout">
        <aside className="admin-review-summary-column">
          <section className="admin-detail-panel">
            <h2>账号事实</h2>
            <div className="admin-user-profile">
              {user.avatar_url ? <img src={user.avatar_url} alt="用户头像" className="admin-user-avatar" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : <span className="admin-user-avatar admin-user-avatar-empty">{(user.nickname || "用").slice(0, 1)}</span>}
              <div><strong>{user.nickname || "未命名用户"}</strong><span>用户 ID</span><code className="admin-mono">{user.id}</code></div>
            </div>
            {user.bio ? <p className="admin-user-bio">{user.bio}</p> : <p>该用户没有填写个人简介。</p>}
            {user.moderation_note ? <div className="admin-moderation-note"><strong>最近处置说明</strong><span>{user.moderation_note}</span></div> : null}
            <dl className="admin-user-facts">
              <dt>当前状态</dt><dd>{statusLabels[user.moderation_status || ""] || user.moderation_status || "未知"}</dd>
              <dt>有效违规</dt><dd>{stats.active_violations} 次</dd>
              <dt>被举报</dt><dd>{stats.total_report_cases} 次</dd>
              <dt>发起举报</dt><dd>{detail.reporter_stats?.total_reports ?? 0} 次</dd>
              <dt>备注</dt><dd>{user.moderation_note || "暂无备注"}</dd>
            </dl>
          </section>

          <section className="admin-detail-panel">
            <h2>当前关注事项</h2>
            <p>{attentionText}</p>
            <p className="admin-detail-meta">关注事项不会自动将正常账号归入“受限账号”；是否受限只取决于当前账号状态。</p>
          </section>

          <section className="admin-detail-panel">
            <h2>治理轨迹</h2>
            {governanceTrail.length ? <ul className="admin-detail-timeline">{governanceTrail.map((item) => <li key={item}>{item}</li>)}</ul> : <p>暂无治理轨迹。</p>}
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
            <div className="admin-panel-title-row"><h2>资料整改</h2><span>{profileRevisions.length} 条</span></div>
            {profileRevisions.length ? <div className="admin-risk-list">{profileRevisions.map((item) => <div className="admin-risk-item" key={item.id}>
              <strong>{revisionIssueLabels[item.issue_type] || item.issue_type} · {revisionStatusLabels[item.status || ""] || item.status || "未知"}</strong>
              {item.issue_detail ? <small>问题说明：{item.issue_detail}</small> : null}
              <small>{fullDate(item.created_at)}{item.confirmed_at ? ` · 确认于 ${fullDate(item.confirmed_at)}` : ""}</small>
              {item.status === "submitted" ? <div className="admin-panel-actions"><button className="admin-detail-secondary" type="button" onClick={() => { setConfirmTarget(item); setConfirmError(""); setConfirmOpen(true); }}>确认整改完成</button></div> : null}
            </div>)}</div> : <p className="admin-detail-empty">该用户没有资料整改记录。</p>}
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
            <div className="admin-panel-actions">
              <button className="admin-detail-secondary" type="button" onClick={openReminder}>发送举报规则提醒</button>
              <button className="admin-detail-secondary" type="button" onClick={() => void openLimit()}>举报每日上限</button>
            </div>
            {detail.reporter_stats?.recent_reports?.length ? <div className="admin-recent-report-list">
              {detail.reporter_stats.recent_reports.map((report) => <div className="admin-recent-report-item" key={report.id}>
                <strong>{targetShortLabels[report.target_type || ""] || "内容"}举报 · {reportStatusLabels[report.status || ""] || report.status || "未知"}</strong>
                <span>{normalizeModerationReason(report.reason_category) || "未填写原因"}{report.details ? ` · ${report.details}` : ""}</span>
                <small>{fullDate(report.created_at)} · ID {report.target_id}</small>
              </div>)}
            </div> : null}
          </section>

          <section className="admin-detail-panel">
            <div className="admin-panel-title-row"><h2>违规记录</h2><span>{detail.violations.length} 条</span></div>
            {detail.violations.length ? <div className="admin-risk-list">{detail.violations.map((item) => <div className="admin-risk-item" key={item.id}>
              <strong>{item.content_type || "账号"} · {normalizeModerationReason(item.category) || "未分类"}</strong>
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
            <h2>治理操作</h2>
            <p>处罚会真实限制前台功能；是否计入确认违规由你勾选，不会自动累积。</p>
            <div className="admin-governance-groups">
              {governanceGroups.map((group) => <div className={`admin-governance-group is-${group.tone}`} key={group.tone}>
                <div className="admin-governance-group-head">
                  <div className="admin-governance-group-label"><span className="admin-governance-level">{group.level}</span><strong>{group.label}</strong></div>
                  <span className="admin-governance-group-description">{group.description}</span>
                </div>
                <div className="admin-report-actions-column">
                  {group.actions.map((key) => <button className={`admin-governance-action is-${group.tone}`} type="button" aria-label={`${group.label}：${actionCopy[key].label.replace("…", "")}`} key={key} onClick={() => openEnforcement(key)}>{actionCopy[key].label}</button>)}
                </div>
              </div>)}
            </div>
          </section>

          <section className="admin-detail-panel">
            <h2>解除限制 / 恢复正常</h2>
            <p>解除单项或全部功能限制；受限、暂停、封禁账号将恢复为正常状态。</p>
            <div className="admin-report-actions-column">
              <button className="admin-detail-secondary" onClick={() => { const restore = user.moderation_status && user.moderation_status !== "active"; setLiftMode(restore ? "restore" : "lift"); setLiftType("all"); setRestoreContent(false); setError(""); setSuccess(""); setLiftOpen(true); }}>解除限制 / 恢复正常</button>
            </div>
            <p className="admin-detail-meta">解除限制为纯确认操作；全部动作写入上方治理轨迹并注明操作人。</p>
          </section>
        </aside>
      </div>

      {enforceOpen ? <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setEnforceOpen(false); }}><form className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="enforce-user-title" onSubmit={submitEnforce}>
        <div className="admin-modal-header"><div><h2 id="enforce-user-title">{actionCopy[action].title}</h2><p className="admin-modal-desc">{actionCopy[action].desc}</p></div></div>
        <div className="admin-field admin-enforce-reason-field"><span className="admin-field-label">常见处罚依据</span><div className="admin-warn-reason-options">{enforcementReasonPresets[action].map((item) => <button className={reason === item && !customReason ? "admin-warn-reason-chip is-selected" : "admin-warn-reason-chip"} type="button" key={item} disabled={busy} onClick={() => { setReason(item); setCustomReason(false); }}>{item}</button>)}<button className={customReason ? "admin-warn-reason-chip is-other is-selected" : "admin-warn-reason-chip is-other"} type="button" disabled={busy} onClick={() => { setCustomReason(true); if (!reason.trim()) setReason(""); }}>其他原因</button></div></div>
        <label className="admin-field">处罚依据<input value={reason} onChange={(event) => { setReason(event.target.value); setCustomReason(true); }} maxLength={500} placeholder={customReason || action !== "warn" ? "请输入处罚依据，会展示给用户并写入通知" : "请选择上方常见原因，或点“其他原因”输入"} disabled={busy || action === "warn" && !customReason} /></label>
        {needsEnds ? <div className="admin-field"><span className="admin-field-label">快捷时长</span><div className="admin-duration-chips">{quickDurations.map((item) => <button className={quickHours === item.hours ? "admin-duration-chip is-selected" : "admin-duration-chip"} type="button" key={item.label} disabled={busy} onClick={() => { setQuickHours(item.hours); setEndsAt(toLocalInput(new Date(Date.now() + item.hours * 3600 * 1000))); }}>{item.label}</button>)}</div></div> : null}
        {needsEnds ? <label className="admin-field">结束时间<input type="datetime-local" value={endsAt} onChange={(event) => { setQuickHours(null); setEndsAt(event.target.value); }} disabled={busy} /></label> : null}
        <label className="admin-field admin-check-field"><input type="checkbox" checked={countViolation} onChange={(event) => setCountViolation(event.target.checked)} disabled={busy} /><span>计入确认违规（手动确认才累计，与收到举报次数无关）</span></label>
        {action === "suspend" || action === "ban" ? <label className="admin-field admin-check-field"><input type="checkbox" checked={hideContent} onChange={(event) => setHideContent(event.target.checked)} disabled={busy} /><span>隐藏该用户已发布的作品（不删除；未勾选时已发布内容保持展示，恢复时可选还原）</span></label> : null}
        <div className="admin-notification-preview"><span className="admin-field-label">将向用户发送的通知</span><pre>{notificationPreview()}</pre></div>
        <label className="admin-field">内部备注（可选）<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="记录给审核日志的内部备注，不会展示给用户" disabled={busy} /></label>
        {error ? <div className="admin-alert admin-alert-error" role="alert">{error}</div> : null}
        <div className="admin-modal-actions">
          <button className="admin-btn admin-btn-light" type="button" disabled={busy} onClick={() => setEnforceOpen(false)}>取消</button>
          <button className={actionCopy[action].danger ? "admin-btn admin-btn-danger-fill" : "admin-btn admin-btn-primary"} type="submit" disabled={busy}>{busy ? "提交中…" : "确认处罚"}</button>
        </div>
      </form></div> : null}

      {liftOpen ? <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setLiftOpen(false); }}><form className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="lift-user-title" onSubmit={submitLift}>
        <div className="admin-modal-header"><div><h2 id="lift-user-title">{liftMode === "restore" ? "恢复该用户账号？" : "解除功能限制？"}</h2><p className="admin-modal-desc">{liftMode === "restore" ? "恢复后账号回到正常或警告状态；勾选可同时还原此前被隐藏的已发布作品。" : "可解除单项限制，或选择“全部”一次解除所有功能限制。"}</p></div></div>
        {liftMode === "lift" ? <label className="admin-field">解除类型<select value={liftType} onChange={(event) => setLiftType(event.target.value)} disabled={busy}><option value="all">全部限制</option><option value="comment">评论限制</option><option value="publish">发布限制</option><option value="report">举报限制</option><option value="profile_edit">资料编辑限制</option><option value="interact">互动限制</option><option value="account">账号处罚</option></select></label> : null}
        <div className="admin-field admin-lift-reason-field"><span className="admin-field-label">常见解除原因</span><div className="admin-warn-reason-options">{liftReasonPresets[liftMode].map((item) => <button className={liftReason === item ? "admin-warn-reason-chip is-selected" : "admin-warn-reason-chip"} type="button" key={item} disabled={busy} onClick={() => setLiftReason(item)}>{item}</button>)}</div></div>
        <label className="admin-field">解除原因<input value={liftReason} onChange={(event) => setLiftReason(event.target.value)} maxLength={500} placeholder="请选择上方常见原因，或自行填写" disabled={busy} /></label>
        {liftMode === "restore" ? <label className="admin-field admin-check-field"><input type="checkbox" checked={restoreContent} onChange={(event) => setRestoreContent(event.target.checked)} disabled={busy} /><span>还原此前因暂停/封禁隐藏的已发布作品</span></label> : null}
        <label className="admin-field">内部备注（可选）<textarea value={liftNote} onChange={(event) => setLiftNote(event.target.value)} maxLength={500} placeholder="记录给审核日志的内部备注，不会展示给用户" disabled={busy} /></label>
        {error ? <div className="admin-alert admin-alert-error" role="alert">{error}</div> : null}
        <div className="admin-modal-actions">
          <button className="admin-btn admin-btn-light" type="button" disabled={busy} onClick={() => setLiftOpen(false)}>取消</button>
          <button className="admin-btn admin-btn-primary" type="submit" disabled={busy}>{busy ? "提交中…" : liftMode === "restore" ? "确认恢复" : "确认解除"}</button>
        </div>
      </form></div> : null}

      {reminderOpen ? <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !reminderBusy) setReminderOpen(false); }}><form className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="report-reminder-title" onSubmit={submitReminder}>
        <div className="admin-modal-header"><div><h2 id="report-reminder-title">发送举报规则提醒？</h2><p className="admin-modal-desc">提醒会发送到该用户的站内通知，不写入违规记录，也不会自动限制任何功能。可点选常见原因，或点“其他原因”自行输入。</p></div></div>
        <div className="admin-field admin-warn-reason-field"><span className="admin-field-label">常见提醒原因</span><div className="admin-warn-reason-options">{reminderQuickReasons.map((item) => <button className={reminderReason === item && !reminderCustomReason ? "admin-warn-reason-chip is-selected" : "admin-warn-reason-chip"} type="button" key={item} disabled={reminderBusy} onClick={() => { setReminderReason(item); setReminderCustomReason(false); }}>{item}</button>)}<button className={reminderCustomReason ? "admin-warn-reason-chip is-other is-selected" : "admin-warn-reason-chip is-other"} type="button" disabled={reminderBusy} onClick={() => { setReminderCustomReason(true); if (!reminderReason.trim()) setReminderReason(""); }}>其他原因</button></div></div>
        <label className="admin-field">提醒内容<input value={reminderCustomReason ? reminderReason : ""} onChange={(event) => setReminderReason(event.target.value)} maxLength={500} placeholder={reminderCustomReason ? "请输入提醒内容，会展示给用户" : "请选择上方常见原因，或点“其他原因”输入"} disabled={reminderBusy || !reminderCustomReason} /></label>
        {reminderError ? <div className="admin-alert admin-alert-error" role="alert">{reminderError}</div> : null}
        <div className="admin-modal-actions">
          <button className="admin-btn admin-btn-light" type="button" disabled={reminderBusy} onClick={() => setReminderOpen(false)}>取消</button>
          <button className="admin-btn admin-btn-primary" type="submit" disabled={reminderBusy}>{reminderBusy ? "发送中…" : "发送提醒"}</button>
        </div>
      </form></div> : null}

      {limitOpen ? <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !limitBusy) setLimitOpen(false); }}><form className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="report-limit-title" onSubmit={submitLimit}>
        <div className="admin-modal-header"><div><h2 id="report-limit-title">设置举报每日上限</h2><p className="admin-modal-desc">每个用户每天最多提交的举报数量。达到上限后，新的作品与评论举报都会被提示次日再试。</p></div></div>
        <label className="admin-field">每日上限（1 到 1000）<input type="number" min={1} max={1000} step={1} value={limitInput} onChange={(event) => setLimitInput(event.target.value)} disabled={limitBusy} /></label>
        {limitError ? <div className="admin-alert admin-alert-error" role="alert">{limitError}</div> : null}
        <div className="admin-modal-actions">
          <button className="admin-btn admin-btn-light" type="button" disabled={limitBusy} onClick={() => setLimitOpen(false)}>取消</button>
          <button className="admin-btn admin-btn-primary" type="submit" disabled={limitBusy}>{limitBusy ? "保存中…" : "保存上限"}</button>
        </div>
      </form></div> : null}

      {confirmOpen && confirmTarget ? <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !confirmBusy) setConfirmOpen(false); }}><form className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-revision-title" onSubmit={submitConfirmRevision}>
        <div className="admin-modal-header"><div><h2 id="confirm-revision-title">确认资料整改完成？</h2><p className="admin-modal-desc">确认后，该用户的资料将恢复正常展示，隐藏字段立即解除。请先核对用户已按要求修改。</p></div></div>
        <div className="admin-confirm-account"><span className="admin-field-label">整改要求</span><strong>{revisionIssueLabels[confirmTarget.issue_type] || confirmTarget.issue_type}</strong>{confirmTarget.issue_detail ? <span>{confirmTarget.issue_detail}</span> : null}</div>
        {confirmError ? <div className="admin-alert admin-alert-error" role="alert">{confirmError}</div> : null}
        <div className="admin-modal-actions">
          <button className="admin-btn admin-btn-light" type="button" disabled={confirmBusy} onClick={() => setConfirmOpen(false)}>取消</button>
          <button className="admin-btn admin-btn-primary" type="submit" disabled={confirmBusy}>{confirmBusy ? "确认中…" : "确认整改完成"}</button>
        </div>
      </form></div> : null}

      {success ? <div className="admin-toast" role="status">{success}</div> : null}
      </div>
    </AdminDetailFrame>
  );
}
