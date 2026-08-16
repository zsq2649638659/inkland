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
  auto_review_risk?: string | null;
  risk_score?: number | null;
  suspicious_report?: boolean | null;
  low_quality_queue?: boolean | null;
  review_basis?: Record<string, unknown> | string | null;
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
  reports_last_30d?: number | null;
  malicious_report_count?: number | null;
  report_restriction_count?: number | null;
  last_report_at?: string | null;
  report_restricted_until?: string | null;
  metadata?: Record<string, unknown> | null;
};

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
  restrictions: Array<{
    id: string;
    restriction_type?: string | null;
    status?: string | null;
    reason?: string | null;
    starts_at?: string | null;
    ends_at?: string | null;
    lifted_at?: string | null;
    created_at?: string | null;
  }>;
};

type ReporterDetailPayload = {
  ok: boolean;
  target_distribution: Array<{
    target_type?: string | null;
    target_id?: string | null;
    target_title?: string | null;
    target_user_id?: string | null;
    target_nickname?: string | null;
    count?: number;
    last_at?: string | null;
  }>;
  focused_target: { target_user_id: string; nickname?: string | null; count: number } | null;
};

type ProfileRevisionRow = {
  id: string;
  case_id?: string | null;
  issue_type: string;
  issue_detail?: string | null;
  original_profile?: Record<string, unknown> | null;
  hidden_fields?: unknown;
  status?: string | null;
  confirmed_by?: string | null;
  confirmed_at?: string | null;
  created_at?: string | null;
};

type Props = {
  reportCase: CaseRow;
  snapshot: SnapshotRow | null;
  reports: ReportRow[];
  violations: ViolationRow[];
  reporterStats: ReporterStatRow[];
  userContent: Array<{ id: string; type: "post" | "comment"; title: string; snippet: string; created_at: string }>;
  userDetail: UserDetailPayload | null;
  profileRevisions: ProfileRevisionRow[];
  targetReporterDetail: ReporterDetailPayload | null;
};

type ReportAction = "keep" | "remind" | "delete" | "dismiss" | "no_violation" | "convert_content" | "profile_revision" | "warn" | "restrict" | "suspend" | "ban" | "mark_suspicious";

const targetLabels: Record<string, string> = { post: "作品", comment: "评论", user: "用户" };
const statusLabels: Record<string, string> = { pending: "待处理", reviewing: "处理中", resolved: "已处理", cancelled: "已取消" };
const priorityLabels: Record<string, string> = { normal: "普通", high: "优先", urgent: "紧急" };
const outcomeLabels: Record<string, string> = { kept: "保留", reminded: "已提醒", deleted: "已删除", no_violation: "举报不成立", content_case: "已转为内容案件", profile_changes: "已要求修改资料", warned: "已警告", restricted: "已限制功能", suspended: "已暂停", banned: "已永久封禁" };
const severityLabels: Record<string, string> = { minor: "轻微", standard: "普通", serious: "严重", critical: "紧急" };
const reminderQuickReasons = ["举报理由与内容明显无关", "短时间大量重复举报", "反复举报已判定无问题内容", "补充说明含辱骂或威胁", "请勿滥用举报功能"];
const restrictionLabels: Record<string, string> = { profile_edit: "修改个人资料", report: "提交举报", interact: "与其他用户互动", comment: "发表评论", publish: "发布作品", account: "使用账号" };
const restrictionStatusLabels: Record<string, string> = { active: "生效中", ended: "已结束", lifted: "已解除" };
const revisionStatusLabels: Record<string, string> = { requested: "待修改", submitted: "已提交", confirmed: "已确认", cancelled: "已取消" };
const issueLabels: Record<string, string> = { avatar: "修改头像", nickname: "修改昵称", bio: "修改个人简介", external_link: "删除外部链接" };
const contentActionLabels: Record<string, string> = { keep: "保留内容", remind: "保留并提醒", delete: "删除内容" };

function text(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function reviewBasisLabel(value: unknown) {
  if (value == null || value === "") return "未记录";
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (!entries.length) return "未记录";
    return entries.map(([key, item]) => `${key}: ${typeof item === "string" ? item : JSON.stringify(item)}`).join("；");
  }
  return String(value);
}

function imageUrls(content: string) {
  return [...content.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]);
}

function plainText(content: string) {
  return content.replace(/!\[[^\]]*\]\(([^)]+)\)/g, "").trim();
}

export default function ReportDetailClient({ reportCase, snapshot, reports, violations, reporterStats, userContent, userDetail, profileRevisions, targetReporterDetail }: Props) {
  const [pendingAction, setPendingAction] = useState<ReportAction | null>(null);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [issueType, setIssueType] = useState<"avatar" | "nickname" | "bio" | "external_link">("avatar");
  const [hideProfile, setHideProfile] = useState(true);
  const [contentTargetType, setContentTargetType] = useState<"post" | "comment">("post");
  const [contentTargetId, setContentTargetId] = useState("");
  const [contentAction, setContentAction] = useState<"keep" | "remind" | "delete">("remind");
  const [restrictionTypes, setRestrictionTypes] = useState<string[]>([]);
  const [immediate, setImmediate] = useState(true);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [hideContent, setHideContent] = useState(false);
  const [countViolation, setCountViolation] = useState(true);
  const [banArmed, setBanArmed] = useState(false);
  const [riskOpen, setRiskOpen] = useState(false);
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
          { key: "convert_content", label: "转为内容案件" },
          { key: "profile_revision", label: "要求修改资料" },
          { key: "warn", label: "发送账号警告" },
          { key: "restrict", label: "限制账号功能" },
          { key: "suspend", label: "暂停账号", danger: true },
          { key: "ban", label: "永久封禁", danger: true },
          { key: "mark_suspicious", label: "标记恶意举报" },
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
    convert_content: {
      title: "转为内容案件处理？",
      desc: "仅处理具体作品或评论，不直接处罚账号；可保留、提醒或删除具体内容。",
      confirm: "确认处理",
    },
    profile_revision: {
      title: "要求修改个人资料？",
      desc: "选择需要修改的资料位置，系统会向用户发送修改通知；管理员确认后恢复展示。",
      confirm: "发送修改通知",
    },
    warn: {
      title: "发送账号警告？",
      desc: "向用户发送系统警告并保存警告记录，默认不限制账号功能。",
      confirm: "发送警告",
    },
    restrict: {
      title: "限制账号功能？",
      desc: "选择要限制的功能、生效时间和结束时间，限制结束后自动恢复。",
      confirm: "确认限制",
    },
    suspend: {
      title: "暂停账号？",
      desc: "用户在暂停期间无法使用账号，到期后系统自动恢复。",
      confirm: "确认暂停",
    },
    ban: {
      title: "永久封禁账号？",
      desc: "账号将永久停用并阻止登录，需要二次确认后执行。",
      confirm: "确认封禁",
    },
    mark_suspicious: {
      title: "标记为恶意举报？",
      desc: "该案件会标记为可疑举报并进入恶意举报审核流程，不会直接处罚举报人。",
      confirm: "确认标记",
    },
  };

  const openAction = (action: ReportAction) => {
    setNote(""); setModalError(""); setReason("");
    setIssueType("avatar"); setHideProfile(true);
    setContentTargetType("post"); setContentTargetId(""); setContentAction("remind");
    setRestrictionTypes([]); setImmediate(true); setStartsAt(""); setEndsAt("");
    setHideContent(false); setCountViolation(true); setBanArmed(false);
    if (action === "profile_revision") setReason("包含不适宜内容");
    if (action === "convert_content") {
      const first = userContent[0];
      if (first) { setContentTargetType(first.type); setContentTargetId(first.id); }
    }
    setPendingAction(action);
  };

  const runAction = async (action: ReportAction, options: Record<string, unknown>) => {
    setBusy(true);
    setModalError("");
    try {
      const response = await fetchWithTimeout("/api/admin/reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: reportCase.id, action, note: note.trim() || undefined, reason: reason.trim() || undefined, options }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { error?: string } | null;
        setBusy(false);
        setModalError(result?.error || "举报案件处理失败，请稍后重试。");
        return;
      }
      if (action === "mark_suspicious") {
        const result = await response.json().catch(() => null) as { message?: string } | null;
        setBusy(false);
        setPendingAction(null);
        setSuccess(result?.message || "该案件已标记为恶意举报。");
        window.setTimeout(() => window.location.reload(), 800);
        return;
      }
      window.location.assign("/admin?view=reports");
    } catch (error) {
      setBusy(false);
      setModalError(error instanceof Error ? error.message : "举报案件处理失败，请稍后重试。");
    }
  };

  const toggleRestrictionType = (type: string) => {
    setRestrictionTypes((prev) => prev.includes(type) ? prev.filter((item) => item !== type) : [...prev, type]);
    setBanArmed(false);
  };

  const notificationPreview = () => {
    if (!pendingAction) return "";
    const reasonText = reason.trim() || "未填写";
    if (pendingAction === "warn") {
      return `账号警告\n你的账号收到一次正式警告。\n原因：${reasonText}\n请及时停止相关行为，避免账号功能受限。`;
    }
    if (pendingAction === "restrict") {
      const labels = restrictionTypes.length ? restrictionTypes.map((item) => `- ${restrictionLabels[item] || item}`).join("\n") : "- 未选择功能";
      return `功能限制\n你的以下功能已被限制（至 ${endsAt ? new Date(endsAt).toLocaleString("zh-CN") : "未设置"}）：\n${labels}\n原因：${reasonText}\n限制结束后相关功能会恢复。`;
    }
    if (pendingAction === "suspend") {
      return `账号暂停\n你的账号已被暂停至 ${endsAt ? new Date(endsAt).toLocaleString("zh-CN") : "未设置"}。\n原因：${reasonText}\n暂停期间无法使用账号，到期后自动恢复。`;
    }
    if (pendingAction === "ban") {
      return `账号封禁\n你的账号已被永久封禁。\n原因：${reasonText}\n相关内容将根据平台规则隐藏或删除。`;
    }
    return "";
  };

  const submitAction = () => {
    if (!pendingAction) return;
    let options: Record<string, unknown> = {};
    if (pendingAction === "convert_content") {
      if (!contentTargetId) { setModalError("请选择要处理的具体作品或评论。"); return; }
      options = { target_type: contentTargetType, target_id: contentTargetId, content_action: contentAction };
    } else if (pendingAction === "profile_revision") {
      options = { issue_type: issueType, hide_profile: hideProfile };
    } else if (pendingAction === "warn") {
      if (!reason.trim()) { setModalError("请填写警告原因，该原因会写入违规记录并展示给用户。"); return; }
      options = { count_violation: countViolation };
    } else if (pendingAction === "restrict") {
      if (!restrictionTypes.length) { setModalError("请至少选择一项要限制的功能。"); return; }
      if (!endsAt) { setModalError("请选择限制结束时间。"); return; }
      if (!reason.trim()) { setModalError("请填写限制原因，该原因会展示给用户。"); return; }
      options = { restriction_types: restrictionTypes, immediate, count_violation: countViolation };
      if (!immediate && startsAt) options.starts_at = new Date(startsAt).toISOString();
      options.ends_at = new Date(endsAt).toISOString();
    } else if (pendingAction === "suspend") {
      if (!endsAt) { setModalError("请选择暂停结束时间。"); return; }
      if (!reason.trim()) { setModalError("请填写暂停原因，该原因会展示给用户。"); return; }
      options = { ends_at: new Date(endsAt).toISOString(), hide_content: hideContent, count_violation: countViolation };
    } else if (pendingAction === "ban") {
      if (!banArmed) { setModalError(""); setBanArmed(true); return; }
      if (!reason.trim()) { setModalError("请填写封禁原因，该原因会展示给用户。"); return; }
      options = { hide_content: hideContent, count_violation: countViolation };
    } else if (pendingAction === "mark_suspicious") {
      if (!reason.trim()) { setModalError("请填写标记原因，该原因会写入案件记录。"); return; }
    }
    void runAction(pendingAction, options);
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
  const reporterTotal = reporterStats.reduce((sum, stat) => sum + (stat.total_reports || 0), 0);
  const reporterValid = reporterStats.reduce((sum, stat) => sum + (stat.valid_reports || 0), 0);
  const reporterInvalid = reporterStats.reduce((sum, stat) => sum + (stat.invalid_reports || 0), 0);
  const maliciousReporterCount = reporterStats.filter((stat) => {
    const meta = stat.metadata || {};
    return (stat.malicious_report_count || 0) > 0 || meta.low_quality === true || meta.malicious === true;
  }).length;
  const needsMaliciousReview = Boolean(reportCase.suspicious_report) || maliciousReporterCount > 0 || Boolean(targetReporterDetail?.focused_target && targetReporterDetail.focused_target.count >= 3);
  const violationCounts = violations.reduce<Record<string, number>>((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {});
  const recentPosts = userContent.filter((item) => item.type === "post");
  const recentComments = userContent.filter((item) => item.type === "comment");
  const bypassHint = text(reportCase.metadata?.bypass_punishment_hint) || (violations.length >= 3 ? "存在多次违规记录，建议结合处罚时间线人工判断是否存在绕过处罚。" : "未发现明显绕过处罚行为。");

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
          {isUser && userDetail ? ` · 注册于 ${new Date(userDetail.user.created_at || "").toLocaleDateString("zh-CN")} · 当前功能限制 ${userDetail.stats.active_restrictions || 0} 项` : null}
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

          {isUser ? <>
            <section className="admin-detail-panel admin-user-detail-panel">
              <div className="admin-panel-title-row"><h2>账号资料</h2><span>实时 + 举报快照</span></div>
              <div className="admin-profile-compare">
                <div className="admin-profile-compare-card">
                  <h3>当前资料</h3>
                  <div className="admin-profile-compare-head">
                    {userDetail?.user.avatar_url ? <img src={userDetail.user.avatar_url} alt="当前头像" className="admin-user-avatar" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : <span className="admin-user-avatar admin-user-avatar-empty">{(userDetail?.user.nickname || targetAuthor).slice(0, 1)}</span>}
                    <strong>{userDetail?.user.nickname || targetAuthor}</strong>
                  </div>
                  <dl>
                    <dt>注册时间</dt><dd>{userDetail?.user.created_at ? new Date(userDetail.user.created_at).toLocaleString("zh-CN") : "未记录"}</dd>
                    <dt>账号状态</dt><dd>{userDetail?.user.moderation_status || "正常"}{userDetail?.user.moderated_at ? ` · ${new Date(userDetail.user.moderated_at).toLocaleString("zh-CN")}` : ""}</dd>
                    <dt>个人简介</dt><dd>{userDetail?.user.bio || "未填写"}</dd>
                    <dt>当前功能限制</dt><dd>{userDetail?.stats.active_restrictions ? `${userDetail.stats.active_restrictions} 项生效中` : "无"}</dd>
                  </dl>
                </div>
                <div className="admin-profile-compare-card is-snapshot">
                  <h3>举报时快照</h3>
                  <div className="admin-profile-compare-head">
                    {text(object.avatar_url) ? <img src={text(object.avatar_url)} alt="举报时头像" className="admin-user-avatar" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : <span className="admin-user-avatar admin-user-avatar-empty">{targetAuthor.slice(0, 1)}</span>}
                    <strong>{targetAuthor}</strong>
                  </div>
                  <dl>
                    <dt>快照时间</dt><dd>{snapshot?.captured_at ? new Date(snapshot.captured_at).toLocaleString("zh-CN") : "未记录"}</dd>
                    <dt>资料修改状态</dt><dd>{profileRevisions.some((item) => item.status === "submitted") ? "已提交修改，待确认" : profileRevisions.length ? "有历史整改记录" : "无"}</dd>
                    <dt>简介快照</dt><dd>{text(object.bio) || "未填写"}</dd>
                  </dl>
                </div>
              </div>

              <div className="admin-detail-subsection">
                <h3>资料修改记录</h3>
                {profileRevisions.length ? <div className="admin-history-list">{profileRevisions.map((item) => <div className="admin-history-item" key={item.id}>
                  <strong>{issueLabels[item.issue_type] || item.issue_type}{item.issue_detail ? ` · ${item.issue_detail}` : ""}</strong>
                  <span>状态：{revisionStatusLabels[item.status || ""] || item.status || "未知"} · 申请于 {item.created_at ? new Date(item.created_at).toLocaleString("zh-CN") : "未知"}{item.confirmed_at ? ` · 确认于 ${new Date(item.confirmed_at).toLocaleString("zh-CN")}` : ""}</span>
                </div>)}</div> : <p className="admin-detail-empty">没有资料修改记录。</p>}
              </div>

              <div className="admin-system-marks">
                <h3>系统自动标记</h3>
                <div className="admin-mark-chips">
                  <span className="admin-mark-chip is-warning">自动风险：{reportCase.auto_review_risk || "未触发"}</span>
                  <span className={reportCase.risk_score && reportCase.risk_score >= 10 ? "admin-mark-chip is-danger" : "admin-mark-chip"}>风险分：{reportCase.risk_score ?? "未记录"}</span>
                  <span className={reportCase.suspicious_report ? "admin-mark-chip is-danger" : "admin-mark-chip is-ok"}>可疑举报：{reportCase.suspicious_report ? "是" : "否"}</span>
                  <span className={reportCase.low_quality_queue ? "admin-mark-chip is-warning" : "admin-mark-chip is-ok"}>低质量队列：{reportCase.low_quality_queue ? "是" : "否"}</span>
                  <span className="admin-mark-chip">审核依据：{reviewBasisLabel(reportCase.review_basis)}</span>
                </div>
              </div>

              <div className="admin-detail-subsection">
                <h3>管理员确认的问题</h3>
                {violations.length ? <div className="admin-risk-list">{violations.slice(0, 12).map((item) => <div className="admin-risk-item" key={item.id}>
                  <strong>{item.content_type ? targetLabels[item.content_type] || item.content_type : "账号"} · {item.category}</strong>
                  <div className="admin-risk-tags"><span>{severityLabels[item.severity] || item.severity}</span><span>{item.status === "active" ? "有效" : "已撤销"}</span></div>
                  {item.summary ? <small>{item.summary}</small> : null}
                  <small>确认于 {new Date(item.confirmed_at).toLocaleString("zh-CN")}</small>
                </div>)}</div> : <p className="admin-detail-empty">没有管理员确认的问题。</p>}
              </div>
            </section>

            <section className="admin-detail-panel">
              <div className="admin-panel-title-row"><h2>举报证据</h2><span>{reports.length} 条</span></div>
              <div className="admin-evidence-list">
                {reports.length ? reports.map((report) => <div className="admin-evidence-item" key={report.id}>
                  <strong>{report.kind === "comment" ? "评论举报" : report.target_type === "post" ? "作品举报" : "用户举报"} · {report.reporter?.nickname || "匿名用户"}</strong>
                  <span>提交人：{report.reporter?.nickname || "匿名用户"} · 提交时间：{new Date(report.created_at).toLocaleString("zh-CN")}</span>
                  <p>原因：{report.reason_category || report.reason || "未填写"}{report.details && report.details !== report.reason ? ` · ${report.details}` : ""}</p>
                </div>) : <p className="admin-detail-empty">没有找到该案件的举报证据。</p>}
              </div>
              <div className="admin-related-content">
                <div>
                  <h3>相关作品</h3>
                  <div className="admin-content-list">{recentPosts.length ? recentPosts.slice(0, 6).map((item) => <div className="admin-content-row" key={`post-${item.id}`}>
                    <strong>{item.title}</strong><span>{new Date(item.created_at).toLocaleString("zh-CN")}</span>
                  </div>) : <p className="admin-detail-empty">没有相关作品。</p>}</div>
                </div>
                <div>
                  <h3>相关评论</h3>
                  <div className="admin-content-list">{recentComments.length ? recentComments.slice(0, 6).map((item) => <div className="admin-content-row" key={`comment-${item.id}`}>
                    <strong>{item.title}</strong><span>{new Date(item.created_at).toLocaleString("zh-CN")}</span>
                  </div>) : <p className="admin-detail-empty">没有相关评论。</p>}</div>
                </div>
              </div>
            </section>

            <section className="admin-detail-panel">
              <div className="admin-panel-title-row"><h2>账号行为</h2><span>最近 20 条</span></div>
              <div className="admin-behavior-grid">
                <div className="admin-behavior-cell">
                  <h3>最近作品</h3>
                  <div className="admin-content-list">{recentPosts.length ? recentPosts.slice(0, 6).map((item) => <div className="admin-content-row" key={`post-${item.id}`}>
                    <strong>{item.title}</strong><span>{new Date(item.created_at).toLocaleString("zh-CN")}</span>
                  </div>) : <p className="admin-detail-empty">没有近期作品。</p>}</div>
                </div>
                <div className="admin-behavior-cell">
                  <h3>最近评论</h3>
                  <div className="admin-content-list">{recentComments.length ? recentComments.slice(0, 6).map((item) => <div className="admin-content-row" key={`comment-${item.id}`}>
                    <strong>{item.title}</strong><span>{new Date(item.created_at).toLocaleString("zh-CN")}</span>
                  </div>) : <p className="admin-detail-empty">没有近期评论。</p>}</div>
                </div>
                <div className="admin-behavior-cell">
                  <h3>被删除内容</h3>
                  <p>{userDetail?.stats.deleted_items ? `已删除 ${userDetail.stats.deleted_items} 条内容` : "没有删除记录"} · 违规记录 {userDetail?.stats.total_violations || 0} 条（生效 {userDetail?.stats.active_violations || 0} 条）</p>
                </div>
                <div className="admin-behavior-cell">
                  <h3>重复行为</h3>
                  <p>{violations.length ? Object.entries(violationCounts).map(([key, count]) => `${key} ${count} 次`).join("；") : "没有重复违规记录。"}</p>
                </div>
                <div className="admin-behavior-cell">
                  <h3>被举报对象分布</h3>
                  {targetReporterDetail?.target_distribution?.length ? <div className="admin-target-list">{targetReporterDetail.target_distribution.slice(0, 8).map((item, index) => <div className="admin-target-row" key={`${item.target_id || item.target_user_id || index}`}>
                    <span>{item.target_type === "post" ? "作品" : item.target_type === "comment" ? "评论" : "用户"} · {item.target_title || item.target_nickname || "未知对象"}</span><b>{item.count} 次</b>
                  </div>)}</div> : <p className="admin-detail-empty">没有该举报人的对象分布数据。</p>}
                </div>
                <div className="admin-behavior-cell">
                  <h3>长期针对某用户</h3>
                  <p>{targetReporterDetail?.focused_target ? `疑似集中举报：${targetReporterDetail.focused_target.nickname || "未知用户"}（${targetReporterDetail.focused_target.count} 次）` : "未发现集中举报某位用户。"}</p>
                </div>
                <div className="admin-behavior-cell is-full">
                  <h3>疑似绕过处罚</h3>
                  <p>{bypassHint}</p>
                </div>
              </div>
            </section>

            <section className="admin-detail-panel">
              <div className="admin-panel-title-row"><h2>历史记录</h2><span>{userDetail?.restrictions.length || 0} 条功能限制</span></div>
              {userDetail?.restrictions.length ? <div className="admin-history-list">{userDetail.restrictions.map((item) => <div className="admin-history-item" key={item.id}>
                <strong>{restrictionLabels[item.restriction_type || ""] || item.restriction_type || "账号功能"} · {restrictionStatusLabels[item.status || ""] || item.status || "未知"}</strong>
                <span>{item.reason ? `原因：${item.reason}` : "未填写原因"}{item.starts_at ? ` · 开始 ${new Date(item.starts_at).toLocaleString("zh-CN")}` : ""}{item.ends_at ? ` · 结束 ${new Date(item.ends_at).toLocaleString("zh-CN")}` : ""}{item.lifted_at ? ` · 解除于 ${new Date(item.lifted_at).toLocaleString("zh-CN")}` : ""}</span>
              </div>)}</div> : <p className="admin-detail-empty">该账号没有历史功能限制记录。</p>}
            </section>

            <section className="admin-detail-panel admin-risk-collapse-panel">
              <button className="admin-collapse-trigger" type="button" onClick={() => setRiskOpen((open) => !open)}>
                <span><strong>举报人风险</strong><small>{reporterStats.length} 名举报人 · 恶意举报 {maliciousReporterCount} 人 · 点击{riskOpen ? "收起" : "展开"}完整评估</small></span>
                <em>{riskOpen ? "收起" : "展开"}</em>
              </button>
              {riskOpen ? <div className="admin-risk-collapse-content">
                <div className="admin-risk-metrics">
                  <div className="admin-risk-metric"><strong>{reporterStats.length}</strong><span>举报人数量</span></div>
                  <div className="admin-risk-metric"><strong>{maliciousReporterCount}</strong><span>疑似恶意举报者</span></div>
                  <div className="admin-risk-metric"><strong>{reporterValid}/{reporterTotal}</strong><span>历史成立/累计</span></div>
                  <div className="admin-risk-metric"><strong>{reporterInvalid}</strong><span>历史不成立</span></div>
                </div>
                {reporterStats.length ? <div className="admin-history-list">{reporterStats.map((stat) => <div className="admin-history-item" key={stat.user_id}>
                  <strong>{stat.malicious_report_count ? `该举报人有 ${stat.malicious_report_count} 次恶意举报记录` : "未标记恶意举报"}{stat.report_restriction_count ? ` · 举报功能受限 ${stat.report_restriction_count} 次` : ""}</strong>
                  <span>累计举报 {stat.total_reports} 次 · 成立 {stat.valid_reports} · 不成立 {stat.invalid_reports} · 30 天 {stat.reports_last_30d ?? 0} 次 · 24 小时 {stat.reports_last_24h} 次</span>
                </div>)}</div> : null}
                <div className="admin-risk-decision">{needsMaliciousReview ? "存在恶意举报信号，建议转入恶意举报审核并复核该举报人的历史案件。" : "当前未发现明显恶意举报信号，可维持普通处理流程。"}</div>
              </div> : null}
            </section>
          </> : null}
        </article>

        <aside className="admin-review-action-column">
          <section className="admin-detail-panel">
            <h2>处理举报</h2>
            <p>请先阅读左侧完整证据，再选择处理动作。</p>
            <div className="admin-report-actions-column">
              {actions.map((action) => <button className={action.danger ? "admin-detail-danger" : "admin-detail-secondary"} key={action.key} disabled={busy} onClick={() => openAction(action.key)}>{action.label}</button>)}
            </div>
            <small>用户举报支持 7 种处理结果；限制、暂停、封禁会先展示处罚确认信息。处理完成后，举报人收到统一受理通知。</small>
          </section>
        </aside>
      </div>

      {pendingAction ? <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setPendingAction(null); }}><div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="resolve-report-title">
        <div className="admin-modal-header"><div><h2 id="resolve-report-title">{modalCopy[pendingAction].title}</h2><p className="admin-modal-desc">{modalCopy[pendingAction].desc}</p></div></div>
        {pendingAction === "convert_content" ? <>
          <div className="admin-field">
            <span className="admin-field-label">具体违规内容</span>
            {userContent.length ? <div className="admin-warn-reason-options">{userContent.map((item) => <button type="button" className={`admin-warn-reason-chip ${contentTargetId === item.id ? "is-selected" : ""}`} key={item.id} onClick={() => { setContentTargetId(item.id); setContentTargetType(item.type); setBanArmed(false); }}>{item.type === "post" ? "作品" : "评论"} · {item.title}</button>)}</div> : <span className="admin-field-hint">没有找到该用户的近期作品或评论，请先在举报明细中补充证据。</span>}
            {contentTargetId ? <small className="admin-content-snippet">{(userContent.find((item) => item.id === contentTargetId)?.snippet || "").slice(0, 120) || "该内容没有文字摘要。"}</small> : null}
          </div>
          <div className="admin-field"><span className="admin-field-label">处理方式</span><div className="admin-warn-reason-options">{(["keep", "remind", "delete"] as const).map((item) => <button type="button" className={`admin-warn-reason-chip ${contentAction === item ? "is-selected" : ""}`} key={item} onClick={() => { setContentAction(item); setBanArmed(false); }}>{contentActionLabels[item]}</button>)}</div></div>
        </> : null}

        {pendingAction === "profile_revision" ? <>
          <div className="admin-field"><span className="admin-field-label">需要修改的位置</span><div className="admin-warn-reason-options">{(Object.keys(issueLabels) as Array<"avatar" | "nickname" | "bio" | "external_link">).map((item) => <button type="button" className={`admin-warn-reason-chip ${issueType === item ? "is-selected" : ""}`} key={item} onClick={() => setIssueType(item)}>{issueLabels[item]}</button>)}</div></div>
          <label className="admin-field">问题类型 / 修改原因<input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder="例如：包含不适宜内容" /></label>
          <label className="admin-field admin-toggle-row"><input type="checkbox" checked={hideProfile} onChange={(event) => setHideProfile(event.target.checked)} /><span>完成修改前暂时隐藏该资料</span></label>
        </> : null}

        {(pendingAction === "warn" || pendingAction === "restrict" || pendingAction === "suspend" || pendingAction === "ban") ? <>
          <div className="admin-confirm-account"><span className="admin-field-label">将处罚账号</span><strong>{targetAuthor}</strong><span className="admin-mono">{reportCase.target_user_id || reportCase.target_id}</span></div>
          <label className="admin-field">处罚依据<input value={reason} onChange={(event) => { setReason(event.target.value); setBanArmed(false); }} maxLength={500} placeholder="该内容会写入通知并展示给用户" /></label>
        </> : null}

        {pendingAction === "mark_suspicious" ? <label className="admin-field">标记原因<input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder="例如：多次举报同一用户、证据明显不成立" /></label> : null}

        {pendingAction === "restrict" ? <>
          <div className="admin-field"><span className="admin-field-label">限制功能</span><div className="admin-warn-reason-options">{(["profile_edit", "report", "interact"] as const).map((item) => <button type="button" className={`admin-warn-reason-chip ${restrictionTypes.includes(item) ? "is-selected" : ""}`} key={item} onClick={() => toggleRestrictionType(item)}>{restrictionLabels[item]}</button>)}</div></div>
          <label className="admin-field admin-toggle-row"><input type="checkbox" checked={immediate} onChange={(event) => setImmediate(event.target.checked)} /><span>立即生效</span></label>
          {!immediate ? <label className="admin-field">开始时间<input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label> : null}
          <label className="admin-field">结束时间<input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></label>
        </> : null}

        {pendingAction === "suspend" ? <label className="admin-field">暂停结束时间<input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></label> : null}

        {(pendingAction === "suspend" || pendingAction === "ban") ? <label className="admin-field admin-toggle-row"><input type="checkbox" checked={hideContent} onChange={(event) => setHideContent(event.target.checked)} /><span>同时隐藏已发布内容（作品与评论不再公开展示）</span></label> : null}
        {pendingAction === "restrict" ? <div className="admin-confirm-account"><span className="admin-field-label">已发布内容</span><span>保持展示，不处理。</span></div> : null}

        {(pendingAction === "warn" || pendingAction === "restrict" || pendingAction === "suspend" || pendingAction === "ban") ? <>
          <label className="admin-field admin-toggle-row"><input type="checkbox" checked={countViolation} onChange={(event) => setCountViolation(event.target.checked)} /><span>计入正式违规记录</span></label>
          <div className="admin-notification-preview"><span className="admin-field-label">将向用户发送的通知</span><pre>{notificationPreview()}</pre></div>
        </> : null}

        {pendingAction === "ban" && banArmed ? <div className="admin-alert admin-alert-error" role="alert">再次确认：永久封禁无法撤销，封禁后该用户将无法登录。</div> : null}
        <label className="admin-field">处理备注（可选）<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="记录给审核日志的内部备注，不会展示给用户" /></label>
        {modalError ? <div className="admin-alert admin-alert-error" role="alert">{modalError}</div> : null}
        <div className="admin-modal-actions">
          <button className="admin-btn admin-btn-light" type="button" disabled={busy} onClick={() => setPendingAction(null)}>取消</button>
          <button className={modalCopy[pendingAction].danger ? "admin-btn admin-btn-danger-fill" : "admin-btn admin-btn-primary"} type="button" disabled={busy} onClick={submitAction}>{busy ? "处理中…" : pendingAction === "ban" && !banArmed ? "确认封禁" : pendingAction === "ban" && banArmed ? "再次确认永久封禁" : modalCopy[pendingAction].confirm}</button>
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
