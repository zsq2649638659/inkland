"use client";
import SiteIcon from "@/components/SiteIcon";
import type { InklandIconName } from "@/components/inkland/iconRegistry";

import { useEffect, useState, useCallback, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import HomeSidebar from "@/components/HomeSidebar";
import { createClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/AuthProvider";
import { formatNotificationCount } from "@/lib/notifications";
import { SkeletonNotification } from "@/components/Skeleton";
import { getNotificationLink, type NotificationMetadata } from "@/lib/notificationLinks";
import { filterVisibleNotifications, readNotificationPreferences } from "@/lib/notificationPreferences";
import { includeTestDataForProfile, withTestDataVisibility } from "@/lib/test-data-visibility";

type NotificationType = "all" | "comment" | "like" | "follow" | "system" | "bookmark";

const readNotificationTab = (searchParams?: { get: (name: string) => string | null }): NotificationType => {
  const tab = searchParams?.get("tab") ?? (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("tab"));
  if (tab === "reply") return "comment";
  if (tab === "all" || tab === "comment" || tab === "like" || tab === "follow" || tab === "system" || tab === "bookmark") return tab;
  return "all";
};

interface NotificationItem {
  id: string;
  user_id: string;
  type: string;
  actor_id: string | null;
  post_id: string | null;
  content: string;
  read: boolean;
  created_at: string;
  template_key?: string | null;
  related_entity_type?: string | null;
  related_entity_id?: string | null;
  link_url?: string | null;
  series_name?: string | null;
  metadata?: NotificationMetadata | null;
  // joined fields
  actor_nickname?: string | null;
  actor_avatar_url?: string | null;
  post_title?: string | null;
}

export default function NotificationsPage() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, profile, loading: authLoading } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [filterType, setFilterType] = useState<NotificationType>(() => readNotificationTab(searchParams));
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadByType, setUnreadByType] = useState<Record<string, number>>({});
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      if (params.get("tab") === "reply") {
        params.set("tab", "comment");
        window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
      }
      setFilterType(readNotificationTab(new URLSearchParams(window.location.search)));
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") !== "reply") return;
    params.set("tab", "comment");
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, []);

  const handleFilterChange = (next: NotificationType) => {
    if (next === filterType) return;
    const params = new URLSearchParams(window.location.search);
    params.set("tab", next);
    const nextUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.pushState(null, "", nextUrl);
    setFilterType(next);
  };

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2000);
  }, []);

  useEffect(() => {
    if (!user) return;
    loadNotifications();
  }, [user, profile?.is_test_account, filterType]);

  useEffect(() => {
    if (!user) return;
    loadUnreadByType();
  }, [user, profile?.is_test_account]);

  useEffect(() => {
    if (!user) return;
    const refresh = () => {
      void loadUnreadByType();
      void loadNotifications();
    };
    const timer = window.setInterval(refresh, 30_000);
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, refresh)
      .subscribe();
    const handleVisibility = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
      void supabase.removeChannel(channel);
    };
  }, [user, profile?.is_test_account, filterType]);

  async function loadUnreadByType() {
    if (!user) return;
    let q = supabase
      .from("notifications")
      .select("type")
      .eq("user_id", user.id)
      .eq("read", false);
    q = withTestDataVisibility(q, includeTestDataForProfile(profile));
    const { data, error } = await q;
    if (error || !data) return;
    const counts: Record<string, number> = {};
    const visibleRows = filterVisibleNotifications(
      data as Array<{ type: string }>,
      readNotificationPreferences(user),
    );
    for (const item of visibleRows) {
      counts[item.type] = (counts[item.type] || 0) + 1;
    }
    const commentUnread = (counts.comment || 0) + (counts.reply || 0);
    if (commentUnread > 0) counts.comment = commentUnread;
    delete counts.reply;
    counts.all = visibleRows.length;
    setUnreadByType(counts);
    setUnreadCount(visibleRows.length);
  };

  async function loadNotifications() {
    if (!user) return;
    setLoading(true);
    setLoadError(false);

    // actor 资料与作品标题通过 PostgREST 嵌套一次取回，
    // 替代原先「列表 → profiles → posts」3 轮串行跨区往返。
    let q = supabase
      .from("notifications")
      .select("*, actor:profiles!notifications_actor_id_fkey(nickname, avatar_url), post:posts(title)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    q = withTestDataVisibility(q, includeTestDataForProfile(profile));
    if (filterType !== "all") {
      q = filterType === "comment"
        ? q.in("type", ["comment", "reply"])
        : q.eq("type", filterType);
    }

    const { data, error } = await q;

    if (error) {
      console.error("Failed to load notifications:", error);
      setNotifications([]);
      setLoadError(true);
      setLoading(false);
      return;
    }

    const raw = data as unknown as Array<NotificationItem & {
      actor?: { nickname: string | null; avatar_url: string | null } | null;
      post?: { title: string | null } | null;
    }>;
    const visibleRaw = filterVisibleNotifications(raw, readNotificationPreferences(user));

    if (visibleRaw.length === 0) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    const seriesIds = Array.from(new Set(
      visibleRaw
        .filter((notification) => notification.template_key === "series_review_rejected" && notification.related_entity_type === "series")
        .map((notification) => notification.related_entity_id)
        .filter((id): id is string => Boolean(id)),
    ));
    const seriesNameById = new Map<string, string>();
    if (seriesIds.length > 0) {
      const { data: seriesRows } = await supabase
        .from("series")
        .select("id, name")
        .in("id", seriesIds);
      for (const series of (seriesRows || []) as Array<{ id: string; name: string | null }>) {
        if (series.name) seriesNameById.set(series.id, series.name);
      }
    }

    const enriched = visibleRaw.map((n) => {
      return {
        ...n,
        actor_nickname: n.actor?.nickname || null,
        actor_avatar_url: n.actor?.avatar_url || null,
        post_title: n.post ? (n.post.title || "未知作品") : null,
        series_name: n.related_entity_id ? seriesNameById.get(n.related_entity_id) || null : null,
      };
    });

    setNotifications(enriched);
    setLoading(false);
  };

  const markAsRead = async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
    const notification = notifications.find((item) => item.id === id);
    if (notification) {
      const tabKey = notification.type === "reply" ? "comment" : notification.type;
      setUnreadByType((prev) => ({
        ...prev,
        all: Math.max(0, (prev.all || 0) - 1),
        [tabKey]: Math.max(0, (prev[tabKey] || 0) - 1),
      }));
    }
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    showToast("已标为已读");
  };

  const markAllAsRead = async () => {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    setUnreadByType({});
    await supabase.from("notifications").update({ read: true }).in("id", unreadIds);
    showToast("全部消息已标为已读");
  };

  const handleNotificationClick = async (n: NotificationItem) => {
    if (!n.read) {
      // 等待数据库完成已读更新，再跳转，避免返回“全部”时状态仍是未读
      await markAsRead(n.id);
    }
    const href = getNotificationLink(n);
    if (href) router.push(href);
  };

  if (authLoading) {
    return <div className="min-h-screen bg-paper pb-20 lg:pb-0"><div className="main-container"><HomeSidebar /><div className="content-area"><SkeletonNotification /></div></div></div>;
  }

  // 未登录状态
  if (!user) {
    return (
      <div className="min-h-screen bg-paper pb-20 lg:pb-0">
        <div className="main-container">
          <HomeSidebar />
          <div className="content-area">
            <div className="feed-empty-state">
              <div className="feed-empty-illustration">
                <div className="feed-empty-tag-ring">
                  <div className="feed-empty-ring-outer"></div>
                  <div className="feed-empty-ring-inner">
                    <SiteIcon name="fa-bell" variant="solid" />
                  </div>
                </div>
              </div>
              <h2 className="feed-empty-title">登录后查看你的消息</h2>
              <p className="feed-empty-desc">登录后即可查看评论、点赞和系统通知</p>
              <Link href="/login" className="feed-empty-action">登录</Link>
              <Link href="/register" className="feed-empty-register">还没有账号？立即注册 →</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const tabs: { key: NotificationType; label: string; icon: string }[] = [
    { key: "like", label: "点赞", icon: "fa-heart" },
    { key: "comment", label: "评论", icon: "fa-comment" },
    { key: "bookmark", label: "收藏", icon: "fa-bookmark" },
    { key: "follow", label: "关注", icon: "fa-user-plus" },
    { key: "system", label: "系统", icon: "fa-circle-info" },
  ];

  const getIconSvg = (type: string): InklandIconName => {
    switch (type) {
      case "like": return "fa-heart";
      case "comment": return "fa-comment";
      case "bookmark": return "fa-bookmark";
      case "reply": return "fa-comment";
      case "system": return "fa-circle-info";
      case "follow": return "fa-user-plus";
      default: return "fa-bell";
    }
  };

  const formatTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "刚刚";
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;
    return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
  };

  const getNotificationTitle = (notification: NotificationItem): string => {
    const content = notification.content || "";
    if (notification.type === "system") {
      const systemTitles: Record<string, string> = {
        activity_reminder: "活动提醒",
        report_received: "举报受理中",
        report_handled: "举报已处理",
        comment_civility_reminder: "评论文明提醒",
        content_civility_reminder: "内容文明提醒",
        report_rule_reminder: "举报规范提醒",
        comment_deleted: "评论违规",
        post_deleted: "作品违规",
        post_review_rejected: "作品需要修改",
        post_review_approved: "作品审核通过",
        account_warning: "账号警告",
        restriction_comment: "评论功能限制",
        restriction_publish: "发布功能限制",
        restriction_report: "举报功能限制",
        account_suspended: "账号暂停",
        account_banned: "账号封禁",
        account_restored: "账号恢复",
        restriction_lifted: "限制解除",
        series_review_rejected: "连载需要修改",
        feedback_resolved: "反馈已处理",
        profile_revision_request: "个人资料需要修改",
      };
      const mappedTitle = notification.template_key ? systemTitles[notification.template_key] : null;
      if (mappedTitle) {
        if (notification.template_key === "activity_reminder") {
          const activity = content.match(/「([^」]+)」/);
          if (activity) return `活动提醒：${activity[0]}投稿即将截止`;
        }
        return mappedTitle;
      }
      if (content.includes("未通过本次审核")) return "作品需要修改";
      const headline = content.split(/\r?\n/, 1)[0]?.trim();
      if (headline && headline.length <= 30) return headline;
    }
    switch (notification.type) {
      case "like": return "你的作品被点赞了";
      case "comment": return "你的作品收到了新评论";
      case "bookmark": return "你的作品被收藏了";
      case "reply": return "有人回复了你的评论";
      case "follow": return "有新粉丝关注了你";
      case "system": return "系统通知";
      default: return "你有一条新消息";
    }
  };

  // 列表行本身是主链接，实体使用组件库的 strong + 品牌色契约，避免嵌套链接破坏整行入口。
  const renderActor = (notification: NotificationItem) => (
    <strong>{notification.actor_nickname || "用户"}</strong>
  );

  const renderWork = (notification: NotificationItem) => (
    <strong>{notification.post_title ? `《${notification.post_title}》` : "这部作品"}</strong>
  );

  const renderSystemDescription = (notification: NotificationItem) => {
    const rawContent = notification.content || "";
    const [firstLine = "", ...remainingLines] = rawContent.split(/\r?\n/);
    const firstLineText = firstLine.trim();
    const template = notification.template_key || "";
    const title = getNotificationTitle(notification);
    const hasDuplicateHeading = firstLineText === title
      || (template.startsWith("restriction_") && firstLineText === "功能限制")
      || (template === "report_rule_reminder" && firstLineText === "举报规范提醒");
    const content = hasDuplicateHeading
      ? remainingLines.join("\n").replace(/^\s+/, "")
      : rawContent;
    const activity = content.match(/「([^」]+)」/);
    const work = content.match(/《([^》]+)》/);
    const match = activity || work;
    if (!match) return content;
    const start = match.index || 0;
    const label = match[0];
    return <>{content.slice(0, start)}<strong>{label}</strong>{content.slice(start + label.length)}</>;
  };

  const getNotificationDescription = (notification: NotificationItem): ReactNode => {
    // 关注类型
    if (notification.type === "follow") return <>{renderActor(notification)} 关注了你</>;
    // 系统通知类型
    if (notification.type === "system") {
      const description = renderSystemDescription(notification);
      return description;
    }

    // 互动类型：点赞/评论/收藏/回复
    const actionLabels: Record<string, string> = {
      like: "赞了",
      comment: "评论了",
      bookmark: "收藏了",
      reply: "回复了你在",
    };
    const action = actionLabels[notification.type] || "互动了";

    const base = (
      <>
        {renderActor(notification)} {action}{" "}
        {notification.type === "reply" ? (
          <>{renderWork(notification)} 之下的评论</>
        ) : (
          <>你的作品 {renderWork(notification)}</>
        )}
      </>
    );

    // 桌面端显示评论/回复正文；移动端由列表样式隐藏这段，保留消息类型和作品信息。
    if (notification.content && (notification.type === "comment" || notification.type === "reply")) {
      return <>{base}<span className="notification-message-quote">：「{notification.content}」</span></>;
    }

    return base;
  };

  const renderNotificationRow = (notification: NotificationItem) => {
    const href = getNotificationLink(notification);
    const description = getNotificationDescription(notification);
    const rowClassName = `notification-list-item ${!notification.read ? "unread" : ""}`;
    const rowContent = (
      <>
        <span className="notification-list-icon" aria-hidden="true">
          <SiteIcon name={getIconSvg(notification.type)} variant="solid" size="var(--ink-notification-icon-glyph-size)" />
        </span>
        <span className="notification-list-content">
          <span className="notification-list-heading">
            <strong className="notification-list-title">{getNotificationTitle(notification)}</strong>
            <time className="notification-list-time" dateTime={notification.created_at}>{formatTime(notification.created_at)}</time>
          </span>
          {description ? <span className="notification-list-description">{description}</span> : null}
          {!notification.read && <span className="sr-only">未读</span>}
        </span>
      </>
    );

    if (!href) {
      return (
        <li key={notification.id} className="notification-list-entry">
          <div
            className={`${rowClassName} notification-list-item--static`}
            data-notification-type={notification.type}
            data-notification-template={notification.template_key || undefined}
            data-notification-state={notification.read ? "read" : "unread"}
            role="button"
            tabIndex={0}
            onClick={() => void handleNotificationClick(notification)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                void handleNotificationClick(notification);
              }
            }}
          >
            {rowContent}
          </div>
        </li>
      );
    }

    return (
      <li key={notification.id} className="notification-list-entry">
        <Link
          href={href}
          className={rowClassName}
          data-notification-type={notification.type}
          data-notification-template={notification.template_key || undefined}
          data-notification-state={notification.read ? "read" : "unread"}
          onClick={async (event) => {
            if (notification.read) return;
            event.preventDefault();
            await markAsRead(notification.id);
            router.push(href);
          }}
        >
          {rowContent}
        </Link>
      </li>
    );
  };

  const renderNotificationGroup = (items: NotificationItem[], ariaLabel: string, label?: string) => {
    if (items.length === 0) return null;
    const headingId = label ? "notification-group-system" : undefined;
    return (
      <section className="notification-list-group" aria-labelledby={headingId}>
        {label && <h2 id={headingId} className="notification-list-label">{label}</h2>}
        <ul className="notification-list" aria-label={ariaLabel} data-composition-contract="notification.list@0.1">
          {items.map(renderNotificationRow)}
        </ul>
      </section>
    );
  };

  return (
    <div id="page-notifications" className="min-h-screen bg-paper pb-20 lg:pb-0">
      <div className="main-container">
        <HomeSidebar />
        <div className="content-area">
          {/* 页面头部 */}
          <div className="page-header">
            <div className="page-title">
              我的消息
              {unreadCount > 0 && <span className="sr-only">{formatNotificationCount(unreadCount)} 条未读消息</span>}
            </div>
            <button className="mark-all-read" onClick={markAllAsRead}>
              全部标记为已读
            </button>
          </div>

          {/* 标签切换 */}
          <div className="notification-tabs-sticky-shell">
            <div className="segmented-tabs segmented-tabs--notifications">
              <div className="segmented-tabs-left">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    className={`segmented-tab ${filterType === tab.key ? "active" : ""}`}
                    onClick={() => handleFilterChange(tab.key)}
                    data-filter={tab.key}
                    aria-label={
                      (unreadByType[tab.key] || 0) > 0
                        ? `${tab.label}，${formatNotificationCount(unreadByType[tab.key])} 条未读消息`
                        : tab.label
                    }
                  >
                    {tab.label}
                    {(unreadByType[tab.key] || 0) > 0 && (
                      <span
                        className="notification-tab-count"
                        aria-hidden="true"
                      >
                        {formatNotificationCount(unreadByType[tab.key])}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 通知列表 */}
          <div className="notification-panel">
            {loading ? (
              <SkeletonNotification />
            ) : loadError ? (
              <div className="empty-state notification-error-state" role="alert">
                <div className="empty-illustration">
                  <div className="empty-tag-ring">
                    <div className="tag-ring-outer"></div>
                    <div className="tag-ring-inner">
                      <SiteIcon name="fa-circle-info" variant="solid" />
                    </div>
                  </div>
                </div>
                <div className="empty-title">消息加载失败</div>
                <div className="empty-desc">暂时无法加载消息，请检查网络后重试</div>
                <button className="empty-action" type="button" onClick={() => void loadNotifications()}>重试</button>
              </div>
            ) : notifications.length === 0 ? (
              <div className="empty-state" style={{ display: "flex" }}>
                <div className="empty-illustration">
                  <div className="empty-tag-ring">
                    <div className="tag-ring-outer"></div>
                    <div className="tag-ring-inner">
                      <SiteIcon name="fa-bell" variant="solid" />
                    </div>
                  </div>
                </div>
                <div className="empty-title">暂无此类消息</div>
                <div className="empty-desc">当你有新的通知时，会在这里显示</div>
              </div>
            ) : (
              <div className="notification-list-stack" data-composition-contract="notification.list@0.1" data-composition-dependencies="List Icon Link Typography">
                {filterType === "system"
                  ? renderNotificationGroup(notifications, "通知中心系统消息")
                  : renderNotificationGroup(notifications, "通知中心消息")}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="toast show">{toast}</div>
      )}
    </div>
  );
}
