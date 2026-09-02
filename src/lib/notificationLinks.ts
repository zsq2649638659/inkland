export interface NotificationMetadata extends Record<string, unknown> {
  action_url?: string;
  action_label?: string;
  case_id?: string;
  series_name?: string;
  target_type?: string;
  target_id?: string;
  post_id?: string;
  issue_type?: string;
  affected_image_indexes?: number[];
  reason?: string;
  submission_number?: number;
}

export interface NotificationLinkInput {
  type: string;
  template_key?: string | null;
  actor_id?: string | null;
  post_id?: string | null;
  content?: string | null;
  related_entity_type?: string | null;
  related_entity_id?: string | null;
  link_url?: string | null;
  report_post_id?: string | null;
  series_name?: string | null;
  metadata?: NotificationMetadata | null;
}

function localPath(value: unknown): string | null {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : null;
}

function isReportNotification(notification: NotificationLinkInput): boolean {
  if (notification.type !== "system") return false;
  const template = notification.template_key || "";
  if (template.startsWith("report_")) return true;
  if (notification.related_entity_type === "report_case") return true;
  const content = notification.content || "";
  return content.includes("举报") && /(受理|处理|举报对象|举报内容)/.test(content);
}

function reviewIssueQuery(notification: NotificationLinkInput): string {
  const issues = notification.metadata?.issues;
  if (!Array.isArray(issues)) return "";
  const firstIssue = issues.find((issue) => issue && typeof issue === "object") as { id?: unknown } | undefined;
  return typeof firstIssue?.id === "string" && firstIssue.id
    ? `&reviewIssue=${encodeURIComponent(firstIssue.id)}`
    : "";
}

export function getNotificationLink(notification: NotificationLinkInput): string | null {
  const direct = localPath(notification.link_url) || localPath(notification.metadata?.action_url);
  const template = notification.template_key || "";
  const relatedType = notification.related_entity_type || null;
  const isReport = isReportNotification(notification);

  if (isReport) {
    const targetType = relatedType && relatedType !== "report_case"
      ? relatedType
      : notification.metadata?.target_type;
    const targetId = relatedType && relatedType !== "report_case"
      ? notification.related_entity_id || notification.metadata?.target_id
      : notification.metadata?.target_id;
    const caseId = relatedType === "report_case"
      ? notification.related_entity_id || notification.metadata?.case_id
      : notification.metadata?.case_id;

    if (template === "report_received" && targetType === "post" && targetId) {
      return `/read/${targetId}`;
    }
    if (template === "report_received" && targetType === "comment" && targetId && notification.report_post_id) {
      return `/read/${notification.report_post_id}#comments`;
    }
    if (caseId) return `/report-status/${caseId}`;

    // 历史举报通知可能没有案件编号；不能再把它错误地带到通用设置页。
    return direct && direct !== "/settings" ? direct : null;
  }

  if (template === "series_review_rejected") {
    const seriesName = notification.series_name || notification.metadata?.series_name;
    if (seriesName) return `/studio/series/${encodeURIComponent(seriesName)}?edit=1`;
    // 旧通知没有保存连载名称时，至少回到创作中心，避免打开无效的 /create?series=...
    return "/studio";
  }

  if (template === "post_review_rejected" || (notification.content || "").includes("未通过本次审核")) {
    if (notification.post_id) return `/create?editPost=${encodeURIComponent(notification.post_id)}${reviewIssueQuery(notification)}`;
    if (direct) return direct;
  }

  if (direct) return direct;

  if (notification.post_id && ["comment", "like", "bookmark", "reply"].includes(notification.type)) {
    const anchor = notification.type === "comment" || notification.type === "reply" ? "#comments" : "";
    return `/read/${notification.post_id}${anchor}`;
  }

  if (notification.type === "follow" && notification.actor_id) {
    return `/user/${notification.actor_id}`;
  }

  if (
    notification.type === "system" &&
    notification.post_id &&
    (template === "post_review_rejected" || (notification.content || "").includes("未通过本次审核"))
  ) {
    return `/create?editPost=${encodeURIComponent(notification.post_id)}${reviewIssueQuery(notification)}`;
  }

  if (notification.type === "system") {
    if (template === "profile_revision_request") return "/settings?tab=profile";
    if (template === "feedback_resolved") return "/settings?tab=contact";
    if (template === "comment_deleted" || template === "post_deleted") {
      return "/settings?tab=contact";
    }
    if (template === "comment_civility_reminder" || template === "content_civility_reminder" || template === "report_rule_reminder") {
      return "/guidelines";
    }
    if (["account_warning", "account_restored", "restriction_comment", "restriction_publish", "restriction_report", "restriction_lifted", "account_suspended", "account_banned"].includes(template)) {
      return "/settings?tab=account";
    }
  }

  return null;
}
