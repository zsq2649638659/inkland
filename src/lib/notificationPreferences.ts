import type { SupabaseClient, User } from "@supabase/supabase-js";
import { withTestDataVisibility } from "@/lib/test-data-visibility";

export const NOTIFICATION_PREFERENCES_KEY = "inkland_notification_preferences";

export const notificationPreferenceTypes = [
  "comment",
  "reply",
  "like",
  "bookmark",
  "follow",
  "system",
] as const;

export type NotificationPreferenceType = typeof notificationPreferenceTypes[number];

export interface NotificationPreferences {
  comment: boolean;
  reply: boolean;
  like: boolean;
  bookmark: boolean;
  follow: boolean;
  system: boolean;
  updated_at: string | null;
}

export const defaultNotificationPreferences: NotificationPreferences = {
  comment: true,
  reply: true,
  like: true,
  bookmark: true,
  follow: true,
  system: true,
  updated_at: null,
};

export const notificationPreferenceLabels: Record<NotificationPreferenceType, { label: string; description: string }> = {
  comment: { label: "评论通知", description: "有人评论你的作品时通知" },
  reply: { label: "回复通知", description: "有人回复你的评论时通知" },
  like: { label: "点赞通知", description: "有人点赞你的作品时通知" },
  bookmark: { label: "收藏通知", description: "有人收藏你的作品时通知" },
  follow: { label: "关注通知", description: "有人关注你时通知" },
  system: { label: "系统通知", description: "审核、举报处理和平台消息" },
};

export function readNotificationPreferences(user: User | null): NotificationPreferences {
  const raw = user?.user_metadata?.[NOTIFICATION_PREFERENCES_KEY];
  if (!raw || typeof raw !== "object") return defaultNotificationPreferences;

  const value = raw as Record<string, unknown>;
  return {
    comment: typeof value.comment === "boolean" ? value.comment : defaultNotificationPreferences.comment,
    reply: typeof value.reply === "boolean" ? value.reply : defaultNotificationPreferences.reply,
    like: typeof value.like === "boolean" ? value.like : defaultNotificationPreferences.like,
    bookmark: typeof value.bookmark === "boolean" ? value.bookmark : defaultNotificationPreferences.bookmark,
    follow: typeof value.follow === "boolean" ? value.follow : defaultNotificationPreferences.follow,
    system: typeof value.system === "boolean" ? value.system : defaultNotificationPreferences.system,
    updated_at: typeof value.updated_at === "string" ? value.updated_at : null,
  };
}

export async function saveNotificationPreferences(
  supabase: SupabaseClient,
  preferences: Omit<NotificationPreferences, "updated_at">,
) {
  const nextPreferences: NotificationPreferences = {
    ...preferences,
    updated_at: new Date().toISOString(),
  };

  return supabase.auth.updateUser({
    data: { [NOTIFICATION_PREFERENCES_KEY]: nextPreferences },
  });
}

export function isNotificationTypeEnabled(type: string, preferences: NotificationPreferences): boolean {
  if (!notificationPreferenceTypes.includes(type as NotificationPreferenceType)) return true;
  return preferences[type as NotificationPreferenceType];
}

export function filterVisibleNotifications<T extends { type: string }>(
  rows: T[],
  preferences: NotificationPreferences,
): T[] {
  return rows.filter((row) => isNotificationTypeEnabled(row.type, preferences));
}

export function notificationPreferencesCacheKey(preferences: NotificationPreferences): string {
  return notificationPreferenceTypes.map((type) => (preferences[type] ? "1" : "0")).join("");
}

export async function fetchVisibleUnreadNotificationCount(
  supabase: SupabaseClient,
  userId: string,
  includeTestData: boolean,
  preferences: NotificationPreferences,
): Promise<number> {
  const query = withTestDataVisibility(
    supabase
      .from("notifications")
      .select("type")
      .eq("user_id", userId)
      .eq("read", false),
    includeTestData,
  );
  const { data } = await query;
  return filterVisibleNotifications((data || []) as Array<{ type: string }>, preferences).length;
}
