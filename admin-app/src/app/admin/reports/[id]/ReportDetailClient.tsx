"use client";
/* eslint-disable @next/next/no-img-element -- 举报证据需要按快照中的原始地址展示。 */

import Link from "next/link";
import { FormEvent, useState } from "react";
import { fetchWithTimeout } from "@/lib/adminFetch";
import { MODERATION_REASON_OPTIONS, normalizeModerationReason } from "@/lib/moderationReasons";
import { displayPublicId } from "@/lib/publicIds";
import AdminDetailFrame from "../../AdminDetailFrame";

type CaseRow = {
  id: string;
  public_id?: string | null;
  target_type: "post" | "comment" | "user";
  target_id: string;
  target_public_id?: string | null;
  target_user_id?: string | null;
  target_user_public_id?: string | null;
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
  hidden_for_review?: boolean | null;
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
  public_id?: string | null;
  kind: "content" | "comment";
  reporter_id?: string | null;
  reporter?: { nickname?: string | null; public_id?: string | null } | null;
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
  public_id?: string | null;
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
    public_id?: string | null;
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
    published_posts_count?: number | null;
    following_count?: number | null;
    followers_count?: number | null;
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
  public_id?: string | null;
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

export type ReportOperationRecord = {
  case_id: string;
  case?: Record<string, unknown> | null;
  snapshot?: Record<string, unknown> | null;
  reports?: Array<Record<string, unknown>>;
  reporter_stats?: Array<Record<string, unknown>>;
  violations?: Array<Record<string, unknown>>;
  restrictions?: Array<Record<string, unknown>>;
  profile_revisions?: Array<Record<string, unknown>>;
  notifications?: Array<Record<string, unknown>>;
  audit_logs?: Array<Record<string, unknown>>;
};

type Props = {
  reportCase: CaseRow;
  snapshot: SnapshotRow | null;
  reports: ReportRow[];
  violations: ViolationRow[];
  reporterStats: ReporterStatRow[];
  userContent: Array<{ id: string; public_id?: string | null; type: "post" | "comment"; title: string; snippet: string; created_at: string }>;
  userDetail: UserDetailPayload | null;
  profileRevisions: ProfileRevisionRow[];
  targetReporterDetail: ReporterDetailPayload | null;
  operationRecord?: ReportOperationRecord | null;
  adminInitial?: string;
};

type ReportAction = "keep" | "remind" | "delete" | "dismiss" | "no_violation" | "convert_content" | "profile_revision" | "warn" | "restrict" | "suspend" | "ban" | "mark_suspicious" | "temporary_hide" | "restore";
type ReportGovernanceTone = "neutral" | "low" | "medium" | "high" | "critical" | "aux";

const targetLabels: Record<string, string> = { post: "作品", comment: "评论", user: "用户" };
const statusLabels: Record<string, string> = { pending: "待处理", reviewing: "处理中", resolved: "已处理", cancelled: "已取消" };
const accountStatusLabels: Record<string, string> = { active: "正常", normal: "正常", warned: "已警告", restricted: "功能受限", suspended: "已暂停", banned: "已永久封禁", deleted: "已注销", inactive: "未激活" };
const autoRiskLabels: Record<string, string> = { normal: "正常", low: "低", minor: "轻微", medium: "中", standard: "普通", high: "高", serious: "严重", major: "严重", critical: "紧急" };
const priorityLabels: Record<string, string> = { normal: "普通", high: "优先", urgent: "紧急" };
const outcomeLabels: Record<string, string> = { kept: "保留", reminded: "已提醒", deleted: "已删除", no_violation: "举报不成立", content_case: "已转为内容案件", profile_changes: "已要求修改资料", warned: "已警告", restricted: "已限制功能", suspended: "已暂停", banned: "已永久封禁" };
const severityLabels: Record<string, string> = { minor: "轻微", standard: "普通", serious: "严重", critical: "紧急" };
const reminderQuickReasons = ["举报理由与内容明显无关", "短时间大量重复举报", "反复举报已判定无问题内容", "补充说明含辱骂或威胁", "请勿滥用举报功能"];
const restrictionLabels: Record<string, string> = { profile_edit: "修改个人资料", report: "提交举报", interact: "与其他用户互动", comment: "发表评论", publish: "发布作品", account: "使用账号" };
const restrictionStatusLabels: Record<string, string> = { active: "生效中", ended: "已结束", lifted: "已解除" };
const revisionStatusLabels: Record<string, string> = { requested: "待修改", submitted: "已提交", confirmed: "已确认", cancelled: "已取消" };
const issueLabels: Record<string, string> = { avatar: "修改头像", nickname: "修改昵称", bio: "修改个人简介", external_link: "删除外部链接" };
const contentActionLabels: Record<string, string> = { keep: "保留内容", remind: "保留并提醒", delete: "删除内容" };
const auditActionLabels: Record<string, string> = {
  resolve_report_keep: "保留内容（举报不成立）",
  resolve_report_remind: "保留并提醒内容",
  resolve_report_delete: "删除内容",
  dismiss_report_case: "驳回举报",
  resolve_report_no_violation: "举报不成立",
  resolve_user_report_no_violation: "未发现账号违规",
  resolve_user_report_convert_content: "转为内容案件",
  resolve_user_report_profile_revision: "要求修改资料",
  resolve_user_report_warn: "发送账号警告",
  resolve_user_report_restrict: "限制账号功能",
  resolve_user_report_suspend: "暂停账号",
  resolve_user_report_ban: "永久封禁账号",
  mark_suspicious_report: "标记恶意举报",
  temporary_hide_report_target: "暂时隐藏内容",
  restore_report_target: "恢复内容展示",
  confirm_profile_revision: "确认资料整改",
  send_report_rule_reminder: "发送举报规则提醒",
  enforce_user_warn: "发送账号警告",
  enforce_user_restrict_comment: "限制评论功能",
  enforce_user_restrict_publish: "限制发布功能",
  enforce_user_restrict_report: "限制举报功能",
  enforce_user_suspend: "暂停账号",
  enforce_user_ban: "永久封禁账号",
  lift_user_restriction: "解除功能限制",
  restore_user_account: "恢复账号",
};
const restrictionTypeLabels: Record<string, string> = { comment: "评论功能", publish: "发布功能", report: "举报功能", account: "账号", profile_edit: "修改资料", interact: "互动功能" };
const restrictionStatusLabelsFull: Record<string, string> = { active: "生效中", expired: "已到期", lifted: "已解除" };
const userReportGovernanceGroups: Array<{
  level: string;
  label: string;
  description: string;
  tone: ReportGovernanceTone;
  actions: ReportAction[];
}> = [
  { level: "结论", label: "审核结论", description: "", tone: "neutral", actions: ["no_violation", "convert_content"] },
  { level: "低", label: "提醒与整改", description: "提醒或整改", tone: "low", actions: ["warn", "profile_revision"] },
  { level: "中", label: "限制功能", description: "功能和期限", tone: "medium", actions: ["restrict"] },
  { level: "高", label: "暂停账号", description: "临时停用，到期恢复", tone: "high", actions: ["suspend"] },
  { level: "极高", label: "永久封禁", description: "永久停用，需二次确认", tone: "critical", actions: ["ban"] },
  { level: "附加", label: "举报人治理", description: "仅处理举报人", tone: "aux", actions: ["mark_suspicious"] },
];
const userReportActionDescriptions: Partial<Record<ReportAction, string>> = {
  no_violation: "结束案件，不产生账号处罚",
  convert_content: "转到作品或评论层面处理",
  warn: "记录警告并通知用户",
  profile_revision: "要求修改不合规资料",
  restrict: "按功能和期限限制账号",
  suspend: "临时停用账号，到期恢复",
  ban: "永久停用账号，需要二次确认",
  mark_suspicious: "标记举报人进入复核",
};
const contentReportGovernanceGroups: Array<{
  level: string;
  label: string;
  description: string;
  tone: ReportGovernanceTone;
  actions: ReportAction[];
}> = [
  { level: "结论", label: "审核结论", description: "", tone: "neutral", actions: ["dismiss"] },
  { level: "低", label: "保留与提醒", description: "保留内容并提醒", tone: "low", actions: ["remind"] },
  { level: "中", label: "暂时隐藏", description: "可逆，待复核", tone: "medium", actions: ["temporary_hide"] },
  { level: "高", label: "删除内容", description: "删除后不可恢复", tone: "critical", actions: ["delete"] },
];
const contentReportActionDescriptions: Partial<Record<ReportAction, string>> = {
  dismiss: "举报不成立，恢复该内容",
  remind: "保留内容并通知发布者",
  temporary_hide: "暂时移出公开页面",
  restore: "恢复公开展示内容",
  delete: "删除内容并记录违规",
};
const reportReasonPresets: Partial<Record<ReportAction, string[]>> = {
  dismiss: ["内容未违反社区规范", "举报理由与内容不符", "举报证据不足", "重复举报或误报"],
  remind: [...MODERATION_REASON_OPTIONS],
  delete: [...MODERATION_REASON_OPTIONS],
  profile_revision: [...MODERATION_REASON_OPTIONS],
  warn: [...MODERATION_REASON_OPTIONS],
  restrict: ["持续发布违规内容", "多次违规且未整改", "绕过内容审核", "滥用互动或举报功能"],
  suspend: ["多项功能持续违规", "绕过限制继续违规", "严重扰乱社区秩序", "累计违规达到暂停标准"],
  ban: ["严重违规", "多次违规且拒不整改", "绕过限制持续违规", "恶意破坏社区秩序"],
  mark_suspicious: ["短时间大量重复举报", "举报理由与内容明显无关", "反复举报已判定无问题内容", "证据明显不成立"],
  temporary_hide: ["命中高风险关键词", "等待人工复核", "内容可能涉及违规", "举报证据不足，先行隐藏"],
};
const reportReasonPresetLabels: Partial<Record<ReportAction, string>> = {
  dismiss: "常见驳回原因",
  remind: "常见提醒原因",
  delete: "常见删除依据",
  profile_revision: "常见修改原因",
  warn: "常见处罚依据",
  restrict: "常见处罚依据",
  suspend: "常见处罚依据",
  ban: "常见处罚依据",
  mark_suspicious: "常见标记依据",
  temporary_hide: "常见隐藏原因",
};

function text(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function moderationReasonLabel(value: unknown) {
  return normalizeModerationReason(text(value)) || "未填写原因";
}

function accountStatusLabel(value: unknown) {
  const status = text(value).trim();
  return accountStatusLabels[status.toLowerCase()] || status || "未记录";
}

function autoRiskLabel(value: unknown) {
  const risk = text(value).trim();
  return autoRiskLabels[risk.toLowerCase()] || risk || "未触发";
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "未记录";
  return new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
}

function fmtNotifyDateTime(value: string | null | undefined) {
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
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "未记录";
  return new Date(value).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" });
}

function imageUrls(content: string) {
  return [...content.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]);
}

function plainText(content: string) {
  return content.replace(/!\[[^\]]*\]\(([^)]+)\)/g, "").trim();
}

export default function ReportDetailClient({ reportCase, snapshot, reports, violations, reporterStats, userContent, userDetail, profileRevisions, targetReporterDetail, operationRecord, adminInitial = "A" }: Props) {
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
  const [reasonCustom, setReasonCustom] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [riskOpen, setRiskOpen] = useState(false);
  const [modalError, setModalError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reminderTarget, setReminderTarget] = useState<{ userId: string; nickname: string } | null>(null);
  const [reminderReason, setReminderReason] = useState("");
  const [reminderCustomReason, setReminderCustomReason] = useState(false);
  const [reminderBusy, setReminderBusy] = useState(false);
  const [reminderError, setReminderError] = useState("");
  const [success, setSuccess] = useState("");

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

  const object = (snapshot?.object_snapshot || {}) as Record<string, unknown>;
  const context = (snapshot?.context_snapshot || {}) as Record<string, unknown>;
  const reporterPublicIdMap = new Map(reports
    .filter((report) => Boolean(report.reporter_id))
    .map((report) => [report.reporter_id as string, report.reporter?.public_id || null] as const));
  const isPost = reportCase.target_type === "post";
  const isComment = reportCase.target_type === "comment";
  const isUser = reportCase.target_type === "user";
  const isReadOnly = !["pending", "reviewing"].includes(reportCase.status);
  const reportListHref = isComment
    ? "/admin?view=reportcomment"
    : isUser
      ? "/admin?view=reportuser"
      : "/admin?view=reportwork";

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
        { key: "remind", label: "保留并提醒" },
        { key: "delete", label: "删除评论", danger: true },
        ...(reportCase.hidden_for_review ? [{ key: "restore" as const, label: "恢复展示" }] : [{ key: "temporary_hide" as const, label: "暂时隐藏评论" }]),
        { key: "dismiss", label: "驳回举报" },
      ]
    : isPost
      ? [
          { key: "delete", label: "删除作品", danger: true },
          ...(reportCase.hidden_for_review ? [{ key: "restore" as const, label: "恢复展示" }] : [{ key: "temporary_hide" as const, label: "暂时隐藏作品" }]),
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
  const actionLabel = (action: (typeof actions)[number]) => {
    if (isPost && action.key === "dismiss") return "驳回举报并放行内容";
    if (isComment && action.key === "dismiss") return "驳回举报并恢复评论";
    return action.label;
  };

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
    temporary_hide: {
      title: `暂时隐藏该${targetLabels[reportCase.target_type]}？`,
      desc: "内容会立即从公开页面移除，仅作者本人可见；需要填写隐藏原因，作者不会收到通知。",
      confirm: "确认隐藏",
    },
    restore: {
      title: `恢复公开展示该${targetLabels[reportCase.target_type]}？`,
      desc: "撤销暂时隐藏，内容将重新出现在公开页面。",
      confirm: "确认恢复",
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
    if (isReadOnly) return;
    setNote(""); setModalError(""); setReason("");
    setIssueType("avatar"); setHideProfile(true);
    setContentTargetType("post"); setContentTargetId(""); setContentAction("remind");
    setRestrictionTypes([]); setImmediate(true); setStartsAt(""); setEndsAt("");
    setHideContent(false); setCountViolation(true); setBanArmed(false); setReasonCustom(false);
    if (action === "convert_content") {
      const first = userContent[0];
      if (first) { setContentTargetType(first.type); setContentTargetId(first.id); }
    }
    setPendingAction(action);
  };

  const reasonPresets = pendingAction ? reportReasonPresets[pendingAction] || [] : [];
  const reasonPresetLabel = pendingAction ? reportReasonPresetLabels[pendingAction] || "常见原因" : "常见原因";
  const reasonFieldLabel = pendingAction === "profile_revision"
    ? "问题类型 / 修改原因"
    : pendingAction === "mark_suspicious"
      ? "标记原因"
      : pendingAction === "temporary_hide"
        ? "隐藏原因"
        : pendingAction === "dismiss"
          ? "驳回原因"
          : pendingAction === "remind"
            ? "提醒原因"
            : pendingAction === "delete"
              ? "删除依据"
        : "处罚依据";
  const reasonPresetField = reasonPresets.length ? <div className="admin-field admin-report-reason-field">
    <span className="admin-field-label">{reasonPresetLabel}</span>
    <div className="admin-warn-reason-options">
      {reasonPresets.map((item) => <button className={reason === item && !reasonCustom ? "admin-warn-reason-chip is-selected" : "admin-warn-reason-chip"} type="button" key={item} disabled={busy} onClick={() => { setReason(item); setReasonCustom(false); setBanArmed(false); }}>{item}</button>)}
      <button className={reasonCustom ? "admin-warn-reason-chip is-other is-selected" : "admin-warn-reason-chip is-other"} type="button" disabled={busy} onClick={() => { setReason(""); setReasonCustom(true); setBanArmed(false); }}>其他原因</button>
    </div>
  </div> : null;

  const advanceToNextCase = async () => {
    try {
      const response = await fetchWithTimeout(`/api/admin/report-center?tab=cases&targetType=${encodeURIComponent(reportCase.target_type)}&status=pending&limit=200`);
      if (!response.ok) throw new Error("读取下一条待审核案件失败。");
      const result = await response.json().catch(() => null) as { cases?: CaseRow[] } | null;
      const next = result?.cases?.[0];
      if (next?.id && next.id !== reportCase.id) {
        window.location.assign(`/admin/reports/${next.id}`);
        return;
      }
    } catch {
      // 读取失败时回到举报中心列表，不阻断处理流程。
    }
    window.location.assign(reportListHref);
  };

  const runAction = async (action: ReportAction, options: Record<string, unknown>) => {
    if (isReadOnly) {
      setModalError("该举报案件已经处理，不能再次处置。");
      return;
    }
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
      if (action === "temporary_hide" || action === "restore") {
        const result = await response.json().catch(() => null) as { message?: string } | null;
        setBusy(false);
        setPendingAction(null);
        setSuccess(result?.message || (action === "temporary_hide" ? "该内容已暂时隐藏。" : "该内容已恢复公开展示。"));
        window.setTimeout(() => window.location.reload(), 800);
        return;
      }
      const result = await response.json().catch(() => null) as { message?: string } | null;
      setBusy(false);
      setPendingAction(null);
      setSuccess(result?.message || "举报案件已处理完成。");
      window.setTimeout(() => void advanceToNextCase(), 600);
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
      return `账号警告\n原因：${reasonText}\n请认真阅读并遵守社区规范，避免再次违规。`;
    }
    if (pendingAction === "restrict") {
      const labels = restrictionTypes.length ? restrictionTypes.map((item) => `- ${restrictionLabels[item] || item}`).join("\n") : "- 未选择功能";
      return `功能限制\n你的以下功能已被限制（至 ${endsAt ? fmtNotifyDateTime(endsAt) : "未设置"}）：\n${labels}\n原因：${reasonText}\n限制结束后相关功能会恢复。`;
    }
    if (pendingAction === "suspend") {
      return `账号暂停\n你的账号已被暂停（至 ${endsAt ? fmtNotifyDateTime(endsAt) : "未设置"}）。\n原因：${reasonText}\n影响范围：暂停期间无法发布或提交审核、无法创建连载与合集、无法评论或举报、无法编辑资料，也无法关注、点赞、收藏、写段评等互动。\n恢复说明：到期后账号将自动恢复，相关功能会重新开放。\n下一步：如需提交复核或反馈，可通过设置页反馈或联系客服邮箱联系我们。`;
    }
    if (pendingAction === "ban") {
      return `账号封禁\n你的账号已被永久封禁。\n原因：${reasonText}\n影响范围：账号无法发布或提交审核、无法创建连载与合集、无法评论或举报、无法编辑资料，也无法关注、点赞、收藏、写段评等互动。\n恢复说明：该处罚不可撤销，账号将保持封禁状态。\n下一步：如需提交反馈，可通过设置页反馈或联系客服邮箱联系我们。`;
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
    } else if (pendingAction === "temporary_hide") {
      if (!reason.trim()) { setModalError("请填写隐藏原因，该原因会写入案件记录。"); return; }
    } else if (pendingAction === "dismiss" || pendingAction === "remind" || pendingAction === "delete") {
      if (!reason.trim()) { setModalError(`请填写${pendingAction === "dismiss" ? "驳回原因" : pendingAction === "remind" ? "提醒原因" : "删除依据"}，该内容会写入案件处理记录。`); return; }
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
    const category = moderationReasonLabel(item.category);
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});
  const recentPosts = userContent.filter((item) => item.type === "post");
  const recentComments = userContent.filter((item) => item.type === "comment");
  const bypassHint = text(reportCase.metadata?.bypass_punishment_hint) || (violations.length >= 3 ? "存在多次违规记录，建议结合处罚时间线人工判断是否存在绕过处罚。" : "未发现明显绕过处罚行为。");
  const recordCase = (operationRecord?.case || {}) as Record<string, unknown>;
  const recordReports = operationRecord?.reports || [];
  const recordViolations = operationRecord?.violations || [];
  const recordRestrictions = operationRecord?.restrictions || [];
  const recordProfileRevisions = operationRecord?.profile_revisions || [];
  const recordNotifications = operationRecord?.notifications || [];
  const recordAuditLogs = operationRecord?.audit_logs || [];
  const restrictionLiftInfo = (record: Record<string, unknown>) => {
    const liftedAt = text(record.lifted_at);
    const liftedBy = text(record.lifted_by_nickname) || text(record.lifted_by);
    if (liftedAt && liftedAt !== "未记录") {
      return liftedBy ? `${fmtDateTime(liftedAt)} · 解除人 ${liftedBy}` : fmtDateTime(liftedAt);
    }
    return "未解除";
  };
  const reporterCount = new Set(reports.map((report) => report.reporter_id).filter(Boolean)).size || reports.length || reportCase.report_count;
  const reportScale = reporterCount > 1 ? `${reporterCount} 人 / ${reportCase.report_count} 次` : `${reportCase.report_count} 次`;
  const reportSummary = reports.find((report) => report.details)?.details || "举报明细已保存，请结合下方冻结快照进行人工判断。";
  const reportPrimaryReason = normalizeModerationReason(reportCase.primary_reason_category) || "未填写";
  const reportSupplement = reportSummary !== reportPrimaryReason && reportSummary !== "举报明细已保存，请结合下方冻结快照进行人工判断。" ? reportSummary : "";
  const reportVisibility = reportCase.hidden_for_review ? "处置期间对读者不可见" : "待处置，当前对读者可见";
  const violationOwnerLabel = isComment ? "评论作者" : isPost ? "作品作者" : "被举报用户";
  const activeView = reportCase.target_type === "comment" ? "reportcomment" : reportCase.target_type === "user" ? "reportuser" : "reportwork";
  const detailLabel = `${targetLabels[reportCase.target_type] || "举报"}举报`;
  const overviewSubjectLabel = isPost ? "被举报作品" : isComment ? "被举报评论" : "被举报用户";
  const caseDisplayId = displayPublicId(reportCase.public_id, reportCase.id);
  const targetDisplayId = displayPublicId(reportCase.target_public_id, reportCase.target_id);
  const overviewSubjectName = isPost || isComment ? targetTitle : targetAuthor;
  const overviewOwnerLabel = isPost ? "作者" : "评论作者";
  const overviewSubjectUserId = reportCase.target_user_public_id || reportCase.target_user_id || snapshot?.author_id || "";
  const overviewContentText = contentText
    ? `${contentText.slice(0, 180)}${contentText.length > 180 ? "…" : ""}`
    : isUser ? "未填写个人简介" : "快照中没有可读取的文字内容";

  return (
    <AdminDetailFrame activeView={activeView} breadcrumb={`管理后台 / ${detailLabel} / 详情`} adminInitial={adminInitial}>
      <div className={`admin-report-detail-page admin-detail-shell admin-report-type-${reportCase.target_type}`}>
        <header className="admin-detail-top">
          <Link href={reportListHref} className="admin-btn admin-btn-light">← 返回{detailLabel}</Link>
          <span className="admin-detail-queue-label">{isReadOnly ? "只读举报记录" : "当前举报案件详情"}</span>
          <button className="admin-btn admin-btn-light" type="button" disabled>下一个案件 →</button>
        </header>

        <div className="admin-review-heading">
          <div className="admin-detail-title-line">
            <span className={`admin-risk-pill${reportCase.priority === "urgent" || reportCase.priority === "high" ? " is-high" : ""}`}>{priorityLabels[reportCase.priority] || "一般"}</span>
            <span className="admin-report-status-pill">{statusLabels[reportCase.status] || reportCase.status}</span>
            <h1>{targetTitle}</h1>
          </div>
          <div className="admin-detail-meta-line">
            <p className="admin-detail-meta">{detailLabel} · 已保存快照 · 最近举报：{fmtDateTime(reportCase.last_reported_at)} · 累计 {reportScale}</p>
            <div className="admin-entity-ids">
              <button type="button" className={`admin-copy-id${copiedId === "case" ? " is-copied" : ""}`} title="点击复制案件 ID" onClick={() => void copyId("case", caseDisplayId)}>{copiedId === "case" ? "已复制案件 ID" : `案件 ${caseDisplayId}`}</button>
            </div>
          </div>
        </div>

        <div className="admin-review-layout">
        <aside className="admin-review-summary-column">
          <section className="admin-detail-panel">
            <h2>举报概况</h2>
            {isComment ? <div className="admin-comment-report-overview">
              <div className="admin-comment-overview-head">
                <div className="admin-comment-overview-subject">
                  <span className="admin-comment-overview-badge">评论</span>
                  <div>
                    <span className="admin-comment-overview-kicker">被举报评论</span>
                    <strong>{targetAuthor === "未知用户" ? "匿名用户的评论" : `${targetAuthor} 的评论`}</strong>
                  </div>
                </div>
                <div className="admin-comment-overview-ids" aria-label="评论与用户 ID">
                  <button type="button" className={`admin-copy-id${copiedId === "overview-target" ? " is-copied" : ""}`} title="点击复制对象 ID" onClick={() => void copyId("overview-target", targetDisplayId)}>{copiedId === "overview-target" ? "已复制对象 ID" : `对象 ${targetDisplayId}`}</button>
                  {overviewSubjectUserId ? <button type="button" className={`admin-copy-id${copiedId === "overview-user" ? " is-copied" : ""}`} title="点击复制用户 ID" onClick={() => void copyId("overview-user", overviewSubjectUserId)}>{copiedId === "overview-user" ? "已复制用户 ID" : `用户 ${overviewSubjectUserId}`}</button> : null}
                </div>
              </div>
              <div className="admin-comment-overview-quote">
                <div className="admin-comment-overview-quote-head"><span>原始评论</span></div>
                <blockquote>{overviewContentText}</blockquote>
                <div className="admin-comment-overview-context"><span>评论于</span><strong>{text(context.post_title) || "未知作品"}</strong></div>
              </div>
              <div className="admin-comment-overview-facts">
                <div><span>举报原因</span><strong>{reportPrimaryReason}</strong></div>
                <div><span>举报规模</span><strong>{reportScale}</strong></div>
                <div><span>评论当下状况</span><strong>{reportVisibility}</strong></div>
                {reportCase.outcome ? <div><span>处理结果</span><strong>{outcomeLabels[reportCase.outcome] || reportCase.outcome}</strong></div> : null}
                {reportCase.resolved_at ? <div><span>处理时间</span><strong>{fmtDateTime(reportCase.resolved_at)}</strong></div> : null}
              </div>
              {reportSupplement ? <div className="admin-comment-overview-summary"><span>补充说明</span><p>{reportSupplement}</p></div> : null}
            </div> : <>
              <div className="admin-comment-report-overview">
                <div className="admin-comment-overview-head">
                  <div className="admin-comment-overview-subject">
                    {!isPost ? <span className={`admin-comment-overview-badge is-${reportCase.target_type}`}>用户</span> : null}
                    {isPost ? <div className="admin-post-overview-meta">
                      <span><em>标题</em><strong>{overviewSubjectName}</strong></span>
                      <span><em>作者</em><strong>{targetAuthor}</strong></span>
                      <span><em>发布时间</em><strong>{text(object.published_at) ? fmtDateTime(text(object.published_at)) : "未记录"}</strong></span>
                    </div> : <div>
                      <span className="admin-comment-overview-kicker">{overviewSubjectLabel}</span>
                      <strong>{overviewSubjectName}</strong>
                      {!isUser ? <span>{overviewOwnerLabel}：{targetAuthor}</span> : null}
                    </div>}
                  </div>
                  <div className="admin-comment-overview-ids" aria-label="对象与用户 ID">
                    <button type="button" className={`admin-copy-id${copiedId === "overview-target" ? " is-copied" : ""}`} title={`点击复制${isUser ? "用户" : "对象"} ID`} onClick={() => void copyId("overview-target", targetDisplayId)}>{copiedId === "overview-target" ? `已复制${isUser ? "用户" : "对象"} ID` : `${isUser ? "用户" : "对象"} ${targetDisplayId}`}</button>
                    {!isUser && overviewSubjectUserId ? <button type="button" className={`admin-copy-id${copiedId === "overview-user" ? " is-copied" : ""}`} title="点击复制用户 ID" onClick={() => void copyId("overview-user", overviewSubjectUserId)}>{copiedId === "overview-user" ? "已复制用户 ID" : `用户 ${overviewSubjectUserId}`}</button> : null}
                  </div>
                </div>
                <div className="admin-comment-overview-quote">
                  <div className="admin-comment-overview-quote-head"><span>{isUser ? "个人资料" : isPost ? "完整作品证据" : "评论内容"}</span>{isPost ? <small>举报时保存</small> : null}</div>
                  {isUser ? <div className="admin-report-overview-user-facts">
                    <span>注册时间<strong>{text(object.created_at) ? fmtDate(text(object.created_at)) : "未记录"}</strong></span>
                    <span>个人简介<strong>{overviewContentText}</strong></span>
                    <span>发布作品<strong>{userDetail?.stats.published_posts_count ?? "未记录"}</strong></span>
                    <span>关注数<strong>{userDetail?.stats.following_count ?? "未记录"}</strong></span>
                    <span>粉丝数<strong>{userDetail?.stats.followers_count ?? "未记录"}</strong></span>
                  </div> : isPost ? <div className="admin-post-inline-evidence">
                    {contentText ? <div className="admin-long-content">{contentText}</div> : <p className="admin-detail-empty">快照中没有可读取的文字内容。</p>}
                    {text(object.author_note) ? <section className="admin-author-note"><h3>作者的话</h3><p>{text(object.author_note)}</p></section> : null}
                    {images.length ? <div className="admin-detail-images">{images.map((url, index) => {
                      const unavailable = url.startsWith("private://");
                      return <figure key={`${url}-${index}`}>
                        {unavailable ? <div className="admin-image-unavailable"><strong>图片 {index + 1} 暂时无法显示</strong><span>原图已迁移或需要私有访问配置。</span></div> : <a href={url} target="_blank" rel="noreferrer" title="打开原图"><img src={url} alt={`被举报作品图片 ${index + 1}`} /></a>}
                        <figcaption>图片 {index + 1}</figcaption>
                      </figure>;
                    })}</div> : null}
                  </div> : <blockquote>{overviewContentText}</blockquote>}
                </div>
                <div className="admin-comment-overview-facts">
                  <div><span>举报原因</span><strong>{reportPrimaryReason}</strong></div>
                  <div><span>举报规模</span><strong>{reportScale}</strong></div>
                  <div><span>{isUser ? "账号当前状况" : "作品当前状况"}</span><strong>{isUser ? accountStatusLabel(object.moderation_status) : reportVisibility}</strong></div>
                  {reportCase.outcome ? <div><span>处理结果</span><strong>{outcomeLabels[reportCase.outcome] || reportCase.outcome}</strong></div> : null}
                  {reportCase.resolved_at ? <div><span>处理时间</span><strong>{fmtDateTime(reportCase.resolved_at)}</strong></div> : null}
                </div>
                {reportSupplement ? <div className="admin-comment-overview-summary"><span>补充说明</span><p>{reportSupplement}</p></div> : null}
              </div>
            </>}
          </section>

          <section className="admin-detail-panel admin-report-reporter-panel">
            <div className="admin-panel-title-row"><h2>举报人清单</h2><span>{reports.length} 条</span></div>
            {reports.length ? <div className="admin-risk-list">{reports.map((report) => {
              const stat = reporterStats.find((item) => item.user_id === report.reporter_id);
              const reporterId = report.reporter_id;
              const reporterDisplayId = displayPublicId(report.reporter?.public_id, reporterId);
              return <div className="admin-risk-item" key={report.id}>
                <div className="admin-report-reporter-meta"><strong>{report.reporter?.nickname || "匿名用户"}</strong><code className="admin-mono">{reporterId ? reporterDisplayId : "未记录举报人 ID"}</code></div>
                <div className="admin-risk-tags"><span>{moderationReasonLabel(report.reason_category || report.reason)}</span><span>{reportStatusLabel(report.status)}</span></div>
                {report.details && report.details !== report.reason ? <small>补充说明：{report.details}</small> : null}
                <small>提交于 {fmtDateTime(report.created_at)}</small>
                {stat ? <small>该举报人累计 {stat.total_reports} 次 · 成立 {stat.valid_reports} · 不成立 {stat.invalid_reports} · 24 小时 {stat.reports_last_24h} 次{stat.report_restricted_until ? ` · 举报受限至 ${fmtDate(stat.report_restricted_until)}` : ""}</small> : null}
                {reporterId ? <div className="admin-report-stat-actions">
                  <Link href={`/admin/users/${reporterId}`} className="admin-inline-link">查看用户并处罚</Link>
                  <button className="admin-inline-btn" type="button" onClick={() => openReminder(reporterId, report.reporter?.nickname || "该用户")}>发送举报规则提醒</button>
                </div> : null}
              </div>;
            })}</div> : <p className="admin-detail-empty">没有找到该案件的举报明细。</p>}
          </section>

          <section className="admin-detail-panel">
            <div className="admin-panel-title-row"><h2>{violationOwnerLabel}违规记录</h2><span>{violations.length} 条</span></div>
            {isComment || isPost ? <p className="admin-report-role-note">这里指{isComment ? "发布该评论" : "发布该作品"}的账号，不是举报人。</p> : null}
            {violations.length ? <div className="admin-risk-list">{violations.map((item) => <div className="admin-risk-item" key={item.id}>
              <strong>{item.content_type ? targetLabels[item.content_type] || item.content_type : "账号"} · {moderationReasonLabel(item.category)}</strong>
              <div className="admin-risk-tags"><span>{severityLabels[item.severity] || item.severity}</span><span>{item.status === "active" ? "有效" : "已撤销"}</span></div>
              {item.summary ? <small>{item.summary}</small> : null}
              <small>确认于 {fmtDateTime(item.confirmed_at)}</small>
            </div>)}</div> : <p className="admin-detail-empty">该{violationOwnerLabel}没有确认违规记录。</p>}
          </section>
        </aside>

        <article className="admin-detail-content admin-review-main">
          {operationRecord ? <section className="admin-detail-panel admin-operation-record-panel">
            <div className="admin-panel-title-row"><h2>案件处理记录</h2><span>只读，供复核</span></div>
            <p className="admin-operation-record-intro">这里汇总举报接收、自动审核和管理员处置的历史记录，仅用于回溯与复核，不会直接执行操作。</p>
            <div className="admin-operation-record-grid">
              <div className="admin-operation-cell">
                <h3>案件留痕</h3>
                <dl>
                  <dt>结案方式</dt><dd>{recordCase.outcome ? (outcomeLabels[text(recordCase.outcome)] || text(recordCase.outcome)) : "尚未结案"}</dd>
                  <dt>处理管理员</dt><dd>{text(recordCase.resolved_by_nickname) || text(recordCase.resolved_by) || "未处理"}</dd>
                  <dt>处理时间</dt><dd>{fmtDateTime(text(recordCase.resolved_at))}</dd>
                  <dt>处理备注</dt><dd>{text((recordCase.metadata as Record<string, unknown> | undefined)?.note) || "未填写"}</dd>
                  <dt>暂隐 / 可疑标记</dt><dd>{recordCase.hidden_for_review ? `已暂隐 · ${text((recordCase.metadata as Record<string, unknown> | undefined)?.hide_reason) || "原因未记录"}` : `暂隐否 · 可疑举报 ${recordCase.suspicious_report ? "是" : "否"} · 低质量队列 ${recordCase.low_quality_queue ? "是" : "否"}`}</dd>
                </dl>
              </div>
              <div className="admin-operation-cell">
                <h3>举报人记录</h3>
                {recordReports.length ? <div className="admin-operation-list">{recordReports.map((record, index) => <div className="admin-operation-item" key={String(record.id || index)}>
                  <strong>{index + 1}. {record.kind === "comment" ? "评论举报" : record.target_type === "post" ? "作品举报" : "用户举报"} · 举报人 {displayPublicId(reporterPublicIdMap.get(text(record.reporter_id)) || text(record.reporter_public_id) || null, text(record.reporter_id))}</strong>
                  <span>理由：{moderationReasonLabel(record.reason_category || record.reason)}{text(record.details) && text(record.details) !== text(record.reason) ? ` · ${text(record.details)}` : ""}</span>
                  <span>提交 {fmtDateTime(text(record.created_at))}{record.resolved_at ? ` · 处理 ${fmtDateTime(text(record.resolved_at))}` : ""}</span>
                </div>)}</div> : <p className="admin-detail-empty">没有举报人记录。</p>}
              </div>
              <div className="admin-operation-cell">
                <h3>自动审核依据</h3>
                <dl>
                  <dt>自动风险</dt><dd>{autoRiskLabel(recordCase.auto_review_risk)}</dd>
                  <dt>风险分</dt><dd>{recordCase.risk_score == null ? "未记录" : String(recordCase.risk_score)}</dd>
                  <dt>规则版本</dt><dd>{text((recordCase.review_basis as Record<string, unknown> | undefined)?.rules_version) || "未记录"}</dd>
                  <dt>扫描时间</dt><dd>{fmtDateTime(text((recordCase.review_basis as Record<string, unknown> | undefined)?.scanned_at))}</dd>
                  <dt>扫描长度</dt><dd>{text((recordCase.review_basis as Record<string, unknown> | undefined)?.scanned_length) || "未记录"}</dd>
                  <dt>命中关键词</dt><dd>{Array.isArray((recordCase.review_basis as Record<string, unknown> | undefined)?.matched_keywords) && ((recordCase.review_basis as Record<string, unknown>)?.matched_keywords as unknown[]).length ? ((recordCase.review_basis as Record<string, unknown>)?.matched_keywords as Array<Record<string, unknown>>).map((item) => `${text(item.pattern)}（${text(item.severity)}）`).join("、") : "无"}</dd>
                </dl>
              </div>
              <div className="admin-operation-cell">
                <h3>确认违规与处罚</h3>
                {recordViolations.length || recordRestrictions.length ? <><div className="admin-operation-list">{recordViolations.map((record, index) => <div className="admin-operation-item" key={String(record.id || index)}>
                  <strong>{record.content_type ? targetLabels[text(record.content_type)] || text(record.content_type) : "账号"} · {moderationReasonLabel(record.category)} · {record.status === "active" ? "有效" : "已撤销"}</strong>
                  <span>{text(record.summary) || "未填写摘要"}{record.confirmed_by_nickname ? ` · 确认人 ${text(record.confirmed_by_nickname)}` : ""}</span>
                  <span>{fmtDateTime(text(record.confirmed_at))}{text(record.revoked_at) !== "未记录" ? ` · 撤销于 ${fmtDateTime(text(record.revoked_at))}` : ""}</span>
                </div>)}</div><div className="admin-operation-list">{recordRestrictions.map((record, index) => <div className="admin-operation-item" key={String(record.id || index)}>
                  <strong>{restrictionTypeLabels[text(record.restriction_type)] || text(record.restriction_type) || "账号限制"} · {restrictionStatusLabelsFull[text(record.status)] || text(record.status)}</strong>
                  <span>{text(record.reason) || "未填写原因"}{record.starts_at && text(record.starts_at) !== "未记录" ? ` · 开始 ${fmtDateTime(text(record.starts_at))}` : ""}{record.ends_at && text(record.ends_at) !== "未记录" ? ` · 结束 ${fmtDateTime(text(record.ends_at))}` : ""}</span>
                  <span>解除状态：{restrictionLiftInfo(record)}</span>
                </div>)}</div></> : <p className="admin-detail-empty">没有确认违规或处罚记录。</p>}
              </div>
              <div className="admin-operation-cell admin-operation-cell-wide">
                <h3>资料整改 / 通知 / 审计</h3>
                {recordProfileRevisions.length ? <div className="admin-operation-list">{recordProfileRevisions.map((record, index) => <div className="admin-operation-item" key={String(record.id || index)}>
                  <strong>{issueLabels[text(record.issue_type)] || text(record.issue_type)} · {revisionStatusLabels[text(record.status)] || text(record.status)}</strong>
                  <span>{text(record.issue_detail)}{record.confirmed_at ? ` · 确认 ${fmtDateTime(text(record.confirmed_at))}` : ""}</span>
                </div>)}</div> : null}
                {recordNotifications.length ? <div className="admin-operation-list">{recordNotifications.slice(0, 12).map((record, index) => <div className="admin-operation-item" key={String(record.id || index)}>
                  <strong>{text(record.template_key) || "系统通知"} → {text(record.recipient_nickname) || text(record.user_id).slice(0, 8)}</strong>
                  <span>{text(record.content).split("\n")[0] || "通知内容未记录"}{record.sent_at ? ` · ${fmtDateTime(text(record.sent_at))}` : ""}</span>
                </div>)}</div> : null}
                {recordAuditLogs.length ? <div className="admin-operation-list">{recordAuditLogs.map((record, index) => <div className="admin-operation-item" key={String(record.id || index)}>
                  <strong>{auditActionLabels[text(record.action)] || text(record.action)}{record.admin_nickname ? ` · ${text(record.admin_nickname)}` : ""}</strong>
                  <span>{text(record.note) || "无备注"} · {fmtDateTime(text(record.created_at))}</span>
                </div>)}</div> : null}
                {!recordProfileRevisions.length && !recordNotifications.length && !recordAuditLogs.length ? <p className="admin-detail-empty">没有资料整改、通知或审计记录。</p> : null}
              </div>
            </div>
          </section> : <section className="admin-detail-panel">
            <div className="admin-panel-title-row"><h2>案件处理记录</h2><span>暂不可用</span></div>
            <p className="admin-operation-record-intro">这里用于回溯举报接收、自动审核和管理员处置记录；当前暂未生成，不影响其他证据查看。</p>
            <p className="admin-detail-empty">该案件暂时没有处理记录，不影响其他证据查看。</p>
          </section>}

          {isUser ? <>
            <section className="admin-detail-panel admin-user-detail-panel">
              <div className="admin-panel-title-row"><h2>账号资料</h2><span>实时 + 举报快照</span></div>
              <div className="admin-profile-compare">
                <div className="admin-profile-compare-corner" aria-hidden="true" />
                <div className="admin-profile-compare-column-head">
                  <h3>当前资料</h3>
                  <div className="admin-profile-compare-head">
                    {userDetail?.user.avatar_url ? <img src={userDetail.user.avatar_url} alt="当前头像" className="admin-user-avatar" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : <span className="admin-user-avatar admin-user-avatar-empty">{(userDetail?.user.nickname || targetAuthor).slice(0, 1)}</span>}
                    <strong>{userDetail?.user.nickname || targetAuthor}</strong>
                  </div>
                </div>
                <div className="admin-profile-compare-column-head is-snapshot">
                  <h3>举报时快照</h3>
                  <div className="admin-profile-compare-head">
                    {text(object.avatar_url) ? <img src={text(object.avatar_url)} alt="举报时头像" className="admin-user-avatar" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : <span className="admin-user-avatar admin-user-avatar-empty">{targetAuthor.slice(0, 1)}</span>}
                    <strong>{targetAuthor}</strong>
                  </div>
                </div>
                <span className="admin-profile-compare-row-label">时间</span>
                <div className="admin-profile-compare-value"><small>注册时间</small><strong>{userDetail?.user.created_at ? fmtDateTime(userDetail.user.created_at) : "未记录"}</strong></div>
                <div className="admin-profile-compare-value is-snapshot"><small>快照时间</small><strong>{snapshot?.captured_at ? fmtDateTime(snapshot.captured_at) : "未记录"}</strong></div>
                <span className="admin-profile-compare-row-label">账号状态</span>
                <div className="admin-profile-compare-value"><strong>{accountStatusLabel(userDetail?.user.moderation_status)}{userDetail?.user.moderated_at ? ` · ${fmtDateTime(userDetail.user.moderated_at)}` : ""}</strong></div>
                <div className="admin-profile-compare-value is-snapshot"><strong>{accountStatusLabel(object.moderation_status)}</strong></div>
                <span className="admin-profile-compare-row-label">个人简介</span>
                <div className="admin-profile-compare-value"><strong>{userDetail?.user.bio || "未填写"}</strong></div>
                <div className="admin-profile-compare-value is-snapshot"><strong>{text(object.bio) || "未填写"}</strong></div>
                <span className="admin-profile-compare-row-label">功能限制</span>
                <div className="admin-profile-compare-value"><strong>{userDetail?.stats.active_restrictions ? `${userDetail.stats.active_restrictions} 项生效中` : "无"}</strong></div>
                <div className="admin-profile-compare-value is-snapshot"><strong>快照未记录</strong></div>
              </div>

              <div className="admin-detail-subsection">
                <h3>资料修改记录</h3>
                <p className="admin-profile-revision-intro">有记录时会显示修改项、具体内容、处理状态和申请／确认时间。</p>
                {profileRevisions.length ? <div className="admin-history-list">{profileRevisions.map((item) => <div className="admin-history-item" key={item.id}>
                  <strong>{issueLabels[item.issue_type] || item.issue_type}{item.issue_detail ? ` · ${item.issue_detail}` : ""}</strong>
                  <span>状态：{revisionStatusLabels[item.status || ""] || item.status || "未知"} · 申请于 {item.created_at ? fmtDateTime(item.created_at) : "未知"}{item.confirmed_at ? ` · 确认于 ${fmtDateTime(item.confirmed_at)}` : ""}</span>
                </div>)}</div> : <p className="admin-detail-empty">没有资料修改记录。</p>}
              </div>

              <div className="admin-system-marks">
                <h3>系统自动标记</h3>
                <p className="admin-system-marks-intro">系统根据举报来源、历史行为和自动审核生成的风险信号，用于排序和复核，不等于最终处罚结论。</p>
                <div className="admin-mark-chips">
                  <span className="admin-mark-chip is-warning">自动风险：{autoRiskLabel(reportCase.auto_review_risk)}</span>
                  <span className={reportCase.risk_score && reportCase.risk_score >= 10 ? "admin-mark-chip is-danger" : "admin-mark-chip"}>风险分：{reportCase.risk_score ?? "未记录"}</span>
                  <span className={reportCase.suspicious_report ? "admin-mark-chip is-danger" : "admin-mark-chip is-ok"}>可疑举报：{reportCase.suspicious_report ? "是" : "否"}</span>
                  <span className={reportCase.low_quality_queue ? "admin-mark-chip is-warning" : "admin-mark-chip is-ok"}>低质量队列：{reportCase.low_quality_queue ? "是" : "否"}</span>
                </div>
              </div>

              <div className="admin-detail-subsection">
                <h3>管理员确认的问题</h3>
                {violations.length ? <div className="admin-risk-list">{violations.slice(0, 12).map((item) => <div className="admin-risk-item" key={item.id}>
                  <strong>{item.content_type ? targetLabels[item.content_type] || item.content_type : "账号"} · {moderationReasonLabel(item.category)}</strong>
                  <div className="admin-risk-tags"><span>{severityLabels[item.severity] || item.severity}</span><span>{item.status === "active" ? "有效" : "已撤销"}</span></div>
                  {item.summary ? <small>{item.summary}</small> : null}
                  <small>确认于 {fmtDateTime(item.confirmed_at)}</small>
                </div>)}</div> : <p className="admin-detail-empty">没有管理员确认的问题。</p>}
              </div>
            </section>

            <section className="admin-detail-panel">
              <div className="admin-panel-title-row"><h2>举报证据</h2><span>{reports.length} 条</span></div>
              <div className="admin-evidence-list">
                {reports.length ? reports.map((report) => <div className="admin-evidence-item" key={report.id}>
                  <strong>{report.kind === "comment" ? "评论举报" : report.target_type === "post" ? "作品举报" : "用户举报"} · {report.reporter?.nickname || "匿名用户"}</strong>
                  <span>提交人：{report.reporter?.nickname || "匿名用户"} · 提交时间：{fmtDateTime(report.created_at)}</span>
                  <p>原因：{moderationReasonLabel(report.reason_category || report.reason)}{report.details && report.details !== report.reason ? ` · ${report.details}` : ""}</p>
                </div>) : <p className="admin-detail-empty">没有找到该案件的举报证据。</p>}
              </div>
              <div className="admin-related-content">
                <div>
                  <h3>被举报用户的相关作品</h3>
                  <div className="admin-content-list">{recentPosts.length ? recentPosts.slice(0, 6).map((item) => <div className="admin-content-row" key={`post-${item.id}`}>
                    <strong>{item.title}</strong><span>{fmtDateTime(item.created_at)}</span>
                  </div>) : <p className="admin-detail-empty">没有相关作品。</p>}</div>
                </div>
                <div>
                  <h3>被举报用户的相关评论</h3>
                  <div className="admin-content-list">{recentComments.length ? recentComments.slice(0, 6).map((item) => <div className="admin-content-row" key={`comment-${item.id}`}>
                    <strong>{item.title}</strong><span>{fmtDateTime(item.created_at)}</span>
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
                    <strong>{item.title}</strong><span>{fmtDateTime(item.created_at)}</span>
                  </div>) : <p className="admin-detail-empty">没有近期作品。</p>}</div>
                </div>
                <div className="admin-behavior-cell">
                  <h3>最近评论</h3>
                  <div className="admin-content-list">{recentComments.length ? recentComments.slice(0, 6).map((item) => <div className="admin-content-row" key={`comment-${item.id}`}>
                    <strong>{item.title}</strong><span>{fmtDateTime(item.created_at)}</span>
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
                <span>{item.reason ? `原因：${item.reason}` : "未填写原因"}{item.starts_at ? ` · 开始 ${fmtDateTime(item.starts_at)}` : ""}{item.ends_at ? ` · 结束 ${fmtDateTime(item.ends_at)}` : ""}{item.lifted_at ? ` · 解除于 ${fmtDateTime(item.lifted_at)}` : ""}</span>
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
          <section className={`admin-detail-panel ${isReadOnly ? "admin-readonly-decision" : ""}`}>
            {isReadOnly ? <>
              <div className="admin-panel-title-row"><h2>案件结果</h2><span>只读记录</span></div>
              <div className="admin-report-readonly-result">{outcomeLabels[reportCase.outcome || ""] || statusLabels[reportCase.status] || "已处理"}</div>
              <p>该举报案件已经处理完成，不提供再次处置。</p>
            </> : <>
            <h2>处置决定</h2>
            <p>请先阅读左侧完整证据，再选择具体处置动作；需要填写原因的动作会在确认弹窗中展示通知预览。</p>
            {isUser ? <div className="admin-governance-groups admin-report-governance-groups">
              {userReportGovernanceGroups.map((group) => {
                const groupActions = group.actions.map((key) => actions.find((action) => action.key === key)).filter((action): action is (typeof actions)[number] => Boolean(action));
                if (!groupActions.length) return null;
                return <div className={`admin-governance-group is-${group.tone}`} key={group.tone}>
                  <div className="admin-governance-group-head">
                    <div className="admin-governance-group-label"><span className="admin-governance-level">{group.level}</span><strong>{group.label}</strong></div>
                    {group.description ? <span className="admin-governance-group-description">{group.description}</span> : null}
                  </div>
                  <div className="admin-report-actions-column">
                    {groupActions.map((action) => <button className={`admin-governance-action is-${group.tone}`} type="button" key={action.key} disabled={busy} onClick={() => openAction(action.key)}>
                      <span>{actionLabel(action)}</span>
                      <small>{userReportActionDescriptions[action.key]}</small>
                    </button>)}
                  </div>
                </div>;
              })}
            </div> : <div className="admin-governance-groups admin-report-governance-groups admin-content-report-governance-groups">
              {contentReportGovernanceGroups.map((group) => {
                const groupActions = group.actions.map((key) => actions.find((action) => action.key === key)).filter((action): action is (typeof actions)[number] => Boolean(action));
                if (!groupActions.length) return null;
                return <div className={`admin-governance-group is-${group.tone}`} key={group.tone}>
                  <div className="admin-governance-group-head">
                    <div className="admin-governance-group-label"><span className="admin-governance-level">{group.level}</span><strong>{group.label}</strong></div>
                    {group.description ? <span className="admin-governance-group-description">{group.description}</span> : null}
                  </div>
                  <div className="admin-report-actions-column">
                    {groupActions.map((action) => <button className={`admin-governance-action is-${group.tone}`} type="button" key={action.key} disabled={busy} onClick={() => openAction(action.key)}>
                      <span>{actionLabel(action)}</span>
                      <small>{contentReportActionDescriptions[action.key]}</small>
                    </button>)}
                  </div>
                </div>;
              })}
            </div>}
            <small>{isUser ? "用户举报已按“结论 → 提醒与整改 → 功能限制 → 暂停 → 永久封禁”分级；附加动作只标记举报人。处理完成后，举报人收到统一受理通知。" : "内容举报已按“结论 → 提醒 → 暂时隐藏 → 删除”分级；删除不可恢复，处理完成后举报人收到统一受理通知。"}</small>
            </>}
          </section>
        </aside>
      </div>

      {pendingAction ? <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setPendingAction(null); }}><div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="resolve-report-title">
        <div className="admin-modal-header"><div><h2 id="resolve-report-title">{modalCopy[pendingAction].title}</h2><p className="admin-modal-desc">{modalCopy[pendingAction].desc}</p></div></div>
        {pendingAction === "convert_content" ? <>
          <div className="admin-field">
            <span className="admin-field-label">具体违规内容</span>
            {userContent.length ? <div className="admin-warn-reason-options">{userContent.map((item) => <button type="button" className={`admin-warn-reason-chip ${contentTargetId === item.id ? "is-selected" : ""}`} key={item.id} onClick={() => { setContentTargetId(item.id); setContentTargetType(item.type); setBanArmed(false); }}>{item.type === "post" ? "作品" : "评论"} · {item.title} · {displayPublicId(item.public_id, item.id)}</button>)}</div> : <span className="admin-field-hint">没有找到该用户的近期作品或评论，请先在举报明细中补充证据。</span>}
            {contentTargetId ? <small className="admin-content-snippet">{(userContent.find((item) => item.id === contentTargetId)?.snippet || "").slice(0, 120) || "该内容没有文字摘要。"}</small> : null}
          </div>
          <div className="admin-field"><span className="admin-field-label">处理方式</span><div className="admin-warn-reason-options">{(["keep", "remind", "delete"] as const).map((item) => <button type="button" className={`admin-warn-reason-chip ${contentAction === item ? "is-selected" : ""}`} key={item} onClick={() => { setContentAction(item); setBanArmed(false); }}>{contentActionLabels[item]}</button>)}</div></div>
        </> : null}

        {(pendingAction === "dismiss" || pendingAction === "remind" || pendingAction === "delete") ? <>
          {reasonPresetField}
          <label className="admin-field">{reasonFieldLabel}<input value={reason} onChange={(event) => { setReason(event.target.value); setReasonCustom(true); }} maxLength={500} placeholder="请选择上方常见原因，或自行填写" disabled={busy} /></label>
        </> : null}

        {pendingAction === "profile_revision" ? <>
          <div className="admin-field"><span className="admin-field-label">需要修改的位置</span><div className="admin-warn-reason-options">{(Object.keys(issueLabels) as Array<"avatar" | "nickname" | "bio" | "external_link">).map((item) => <button type="button" className={`admin-warn-reason-chip ${issueType === item ? "is-selected" : ""}`} key={item} onClick={() => setIssueType(item)}>{issueLabels[item]}</button>)}</div></div>
          {reasonPresetField}
          <label className="admin-field">{reasonFieldLabel}<input value={reason} onChange={(event) => { setReason(event.target.value); setReasonCustom(true); }} maxLength={500} placeholder="请选择上方常见原因，或自行填写" disabled={busy} /></label>
          <label className="admin-field admin-toggle-row"><input type="checkbox" checked={hideProfile} onChange={(event) => setHideProfile(event.target.checked)} /><span>完成修改前暂时隐藏该资料</span></label>
        </> : null}

        {(pendingAction === "warn" || pendingAction === "restrict" || pendingAction === "suspend" || pendingAction === "ban") ? <>
              <div className="admin-confirm-account"><span className="admin-field-label">将处罚账号</span><strong>{targetAuthor}</strong><span className="admin-mono">{displayPublicId(reportCase.target_user_public_id, reportCase.target_user_id || reportCase.target_id)}</span></div>
          {reasonPresetField}
          <label className="admin-field">{reasonFieldLabel}<input value={reason} onChange={(event) => { setReason(event.target.value); setReasonCustom(true); setBanArmed(false); }} maxLength={500} placeholder="请选择上方常见依据，或自行填写" disabled={busy} /></label>
        </> : null}

        {pendingAction === "mark_suspicious" ? <>
          {reasonPresetField}
          <label className="admin-field">{reasonFieldLabel}<input value={reason} onChange={(event) => { setReason(event.target.value); setReasonCustom(true); }} maxLength={500} placeholder="请选择上方常见依据，或自行填写" disabled={busy} /></label>
        </> : null}

        {pendingAction === "temporary_hide" ? <>
          {reasonPresetField}
          <label className="admin-field">{reasonFieldLabel}<input value={reason} onChange={(event) => { setReason(event.target.value); setReasonCustom(true); }} maxLength={500} placeholder="请选择上方常见原因，或自行填写" disabled={busy} /></label>
        </> : null}

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
      </div>
    </AdminDetailFrame>
  );
}
