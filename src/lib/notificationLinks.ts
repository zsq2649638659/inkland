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

export function getNotificationLink(notification: NotificationLinkInput): string | null {
  const direct = localPath(notification.link_url) || localPath(notification.metadata?.action_url);
  const template = notification.template_key || "";
  const relatedType = notification.related_entity_type || null;

  // 系统通知只有“需要用户采取行动”或“明确提供活动链接”的类型才允许跳转。
  // 进度、结果、提醒、限制和举报状态都保持静态，避免把用户带到无关页面。
  if (notification.type === "system") {
    if (template === "activity_reminder") return direct;

    if (template === "series_review_rejected") {
      const seriesName = notification.series_name || notification.metadata?.series_name;
      if (seriesName) return `/studio/series/${encodeURIComponent(seriesName)}?edit=1`;
      // 旧通知没有保存连载名称时，至少回到创作中心，避免打开无效的 /create?series=...
      return "/studio";
    }

    if (template === "post_review_rejected") {
      if (notification.post_id) return `/create?editPost=${encodeURIComponent(notification.post_id)}`;
      return direct;
    }

    if (template === "content_civility_reminder") {
      const targetType = relatedType || notification.metadata?.target_type;
      const targetId = relatedType
        ? notification.related_entity_id
        : notification.metadata?.target_id;
      if ((targetType === "post" || targetType === "work") && targetId) {
        return `/create?editPost=${encodeURIComponent(targetId)}`;
      }
    }

    if (template === "profile_revision_request") return "/profile-settings?tab=profile";

    return null;
  }

  if (direct) return direct;

  if (notification.post_id && ["comment", "like", "bookmark", "reply"].includes(notification.type)) {
    const anchor = notification.type === "comment" || notification.type === "reply" ? "#comments" : "";
    return `/read/${notification.post_id}${anchor}`;
  }

  if (notification.type === "follow" && notification.actor_id) {
    return `/user/${notification.actor_id}`;
  }

  return null;
}
