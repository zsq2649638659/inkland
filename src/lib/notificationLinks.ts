export interface NotificationMetadata extends Record<string, unknown> {
  action_url?: string;
  action_label?: string;
  case_id?: string;
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
    return `/create?editPost=${notification.post_id}`;
  }

  return null;
}
