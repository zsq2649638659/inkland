"use client";

import { useEffect, useState, useCallback, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import HomeSidebar from "@/components/HomeSidebar";
import { createClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/AuthProvider";
import { formatNotificationCount } from "@/lib/notifications";
import { SkeletonNotification } from "@/components/Skeleton";
import { getNotificationLink, type NotificationMetadata } from "@/lib/notificationLinks";

type NotificationType = "all" | "comment" | "like" | "follow" | "system" | "bookmark" | "reply";

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
  report_post_id?: string | null;
  metadata?: NotificationMetadata & { issues?: ReviewIssueMeta[] } | null;
  // joined fields
  actor_nickname?: string | null;
  actor_avatar_url?: string | null;
  post_title?: string | null;
}

interface ReviewIssueMeta {
  id?: string;
  category?: string | null;
  field_name?: string | null;
  location_type?: string | null;
  paragraph_index?: number | null;
  image_index?: number | null;
  quoted_text?: string | null;
  details?: string | null;
}

export default function NotificationsPage() {
  const supabase = createClient();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<NotificationType>("all");
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadByType, setUnreadByType] = useState<Record<string, number>>({});
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2000);
  }, []);

  useEffect(() => {
    if (!user) return;
    loadNotifications();
  }, [user, filterType]);

  useEffect(() => {
    if (!user) return;
    loadUnreadByType();
  }, [user]);

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
  }, [user, filterType]);

  async function loadUnreadByType() {
    if (!user) return;
    const { data, error } = await supabase
      .from("notifications")
      .select("type")
      .eq("user_id", user.id)
      .eq("read", false);
    if (error || !data) return;
    const counts: Record<string, number> = {};
    for (const item of data as Array<{ type: string }>) {
      counts[item.type] = (counts[item.type] || 0) + 1;
    }
    counts.all = data.length;
    setUnreadByType(counts);
    setUnreadCount(data.length);
  };

  async function loadNotifications() {
    if (!user) return;
    setLoading(true);

    // actor 资料与作品标题通过 PostgREST 嵌套一次取回，
    // 替代原先「列表 → profiles → posts」3 轮串行跨区往返。
    let q = supabase
      .from("notifications")
      .select("*, actor:profiles!notifications_actor_id_fkey(nickname, avatar_url), post:posts(title)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (filterType !== "all") {
      q = q.eq("type", filterType);
    }

    const { data, error } = await q;

    if (error) {
      console.error("Failed to load notifications:", error);
      setLoading(false);
      return;
    }

    if (!data || data.length === 0) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    const raw = data as unknown as Array<NotificationItem & {
      actor?: { nickname: string | null; avatar_url: string | null } | null;
      post?: { title: string | null } | null;
    }>;

    const reportCommentIds = Array.from(new Set(
      raw
        .filter((notification) =>
          notification.type === "system" &&
          (notification.template_key?.startsWith("report_") || (notification.content || "").includes("举报")) &&
          (notification.related_entity_type === "comment" || notification.metadata?.target_type === "comment")
        )
        .map((notification) =>
          notification.related_entity_type === "comment"
            ? notification.related_entity_id
            : notification.metadata?.target_id
        )
        .filter((id): id is string => Boolean(id))
    ));
    const reportPostByComment = new Map<string, string>();
    if (reportCommentIds.length > 0) {
      const { data: comments } = await supabase
        .from("comments")
        .select("id, post_id")
        .in("id", reportCommentIds);
      for (const comment of (comments || []) as Array<{ id: string; post_id: string | null }>) {
        if (comment.post_id) reportPostByComment.set(comment.id, comment.post_id);
      }
    }

    const enriched = raw.map((n) => {
      const reportCommentId = n.related_entity_type === "comment"
        ? n.related_entity_id
        : n.metadata?.target_type === "comment"
          ? n.metadata.target_id
          : null;
      return {
        ...n,
        actor_nickname: n.actor?.nickname || null,
        actor_avatar_url: n.actor?.avatar_url || null,
        post_title: n.post ? (n.post.title || "未知作品") : null,
        report_post_id: reportCommentId ? reportPostByComment.get(reportCommentId) || null : null,
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
      setUnreadByType((prev) => ({
        ...prev,
        all: Math.max(0, (prev.all || 0) - 1),
        [notification.type]: Math.max(0, (prev[notification.type] || 0) - 1),
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

  const reviewIssueLabel = (issue: ReviewIssueMeta): string => {
    const field = issue.field_name || (issue.location_type === "image" || issue.location_type === "image_ocr" ? "image_ocr" : "content");
    const fieldName = field === "title" ? "标题" : field === "content" ? "正文" : field === "author_note" ? "作者的话" : field === "image_ocr" ? "图片文字" : "图片";
    const location = issue.image_index != null ? `第${issue.image_index + 1}张图` : issue.paragraph_index != null ? `第${issue.paragraph_index}段` : "";
    const quote = issue.quoted_text ? `「${issue.quoted_text}」` : "";
    return [fieldName, location, quote].filter(Boolean).join(" · ");
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
                    <i className="fa-solid fa-bell"></i>
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
    { key: "all", label: "全部", icon: "fa-bell" },
    { key: "like", label: "点赞", icon: "fa-heart" },
    { key: "comment", label: "评论", icon: "fa-comment" },
    { key: "bookmark", label: "收藏", icon: "fa-bookmark" },
    { key: "reply", label: "回复", icon: "fa-reply" },
    { key: "follow", label: "关注", icon: "fa-user-plus" },
    { key: "system", label: "系统", icon: "fa-circle-info" },
  ];

  const getIconClass = (type: string): string => {
    switch (type) {
      case "like": return "icon-like";
      case "comment": return "icon-comment";
      case "bookmark": return "icon-bookmark";
      case "reply": return "icon-reply";
      case "system": return "icon-system";
      case "follow": return "icon-follow";
      default: return "icon-system";
    }
  };

  const getIconSvg = (type: string): string => {
    switch (type) {
      case "like": return "fa-heart";
      case "comment": return "fa-comment";
      case "bookmark": return "fa-bookmark";
      case "reply": return "fa-reply";
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

  const getNotificationTitle = (notification: NotificationItem): ReactNode => {
    if (notification.type === "system") {
      if (notification.template_key === "post_review_rejected" || notification.content.includes("未通过本次审核")) return "作品未通过审核";
      const activity = notification.content.match(/「([^」]+)」/);
      if (notification.content.includes("活动") && activity) {
        return <>活动提醒：<span className="highlight"><a href={`/search?q=${encodeURIComponent(activity[1])}`} onClick={(event) => event.stopPropagation()}>「{activity[1]}」</a></span> 投稿即将截止</>;
      }
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

  const renderActor = (notification: NotificationItem) => {
    const actor = notification.actor_nickname || "用户";
    return notification.actor_id ? (
      <a href={`/user/${notification.actor_id}`} onClick={(event) => event.stopPropagation()}>{actor}</a>
    ) : <span className="highlight">{actor}</span>;
  };

  const renderWork = (notification: NotificationItem) => {
    const work = notification.post_title ? `《${notification.post_title}》` : "你的作品";
    return notification.post_id ? (
      <a
        href={`/read/${notification.post_id}${notification.type === "comment" || notification.type === "reply" ? "#comments" : ""}`}
        onClick={(event) => event.stopPropagation()}
      >
        {work}
      </a>
    ) : <span className="highlight">{work}</span>;
  };

  const renderSystemDescription = (notification: NotificationItem) => {
    const { content } = notification;
    const activity = content.match(/「([^」]+)」/);
    const guideline = content.match(/《([^》]+)》/);
    const match = activity || guideline;
    if (!match) return content;
    const href = getNotificationLink(notification) || (activity ? `/search?q=${encodeURIComponent(match[1])}` : null);
    if (!href) return content;
    const start = match.index || 0;
    const label = match[0];
    return <>{content.slice(0, start)}<Link href={href} onClick={async (event) => {
      event.stopPropagation();
      if (!notification.read) {
        event.preventDefault();
        await markAsRead(notification.id);
        window.location.assign(href);
      }
    }}>{label}</Link>{content.slice(start + label.length)}</>;
  };

  const getNotificationDescription = (notification: NotificationItem): ReactNode => {
    // 关注类型
    if (notification.type === "follow") return <>{renderActor(notification)} 关注了你</>;
    // 系统通知类型
    if (notification.type === "system") {
      const description = renderSystemDescription(notification);
      const issues = notification.metadata?.issues;
      if (notification.template_key === "post_review_rejected" && issues && issues.length > 0) {
        return (
          <div className="notification-review-issues">
            <div className="notification-desc">{description}</div>
            <div className="notification-issues-row">
              {issues.slice(0, 3).map((issue, index) => (
                <span key={issue.id || index} className="notification-issue-chip">
                  {reviewIssueLabel(issue)}
                </span>
              ))}
              {issues.length > 3 && <span className="notification-issues-more">等 {issues.length} 项</span>}
            </div>
          </div>
        );
      }
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

    // 评论和回复类型：显示具体内容
    if (notification.content && (notification.type === "comment" || notification.type === "reply")) {
      return <>{base}：「{notification.content}」</>;
    }

    return base;
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
              {unreadCount > 0 && (
                <span className="unread-badge">{formatNotificationCount(unreadCount)}</span>
              )}
            </div>
            <button className="mark-all-read" onClick={markAllAsRead}>
              全部标记为已读
            </button>
          </div>

          {/* 标签切换 */}
          <div className="segmented-tabs">
            <div className="segmented-tabs-left">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  className={`segmented-tab ${filterType === tab.key ? "active" : ""}`}
                  onClick={() => setFilterType(tab.key)}
                  data-filter={tab.key}
                >
                  {tab.label}
                  {(unreadByType[tab.key] || 0) > 0 && (
                    <span className="notification-tab-count">{formatNotificationCount(unreadByType[tab.key])}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* 通知列表 */}
          <div className="notification-panel">
            {loading ? (
              <SkeletonNotification />
            ) : notifications.length === 0 ? (
              <div className="empty-state" style={{ display: "flex" }}>
                <div className="empty-illustration">
                  <div className="empty-tag-ring">
                    <div className="tag-ring-outer"></div>
                    <div className="tag-ring-inner">
                      <i className="fa-solid fa-bell"></i>
                    </div>
                  </div>
                </div>
                <div className="empty-title">暂无此类消息</div>
                <div className="empty-desc">当你有新的通知时，会在这里显示</div>
              </div>
            ) : (
              <div className="notification-list">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`notification-item ${!n.read ? "unread" : ""}`}
                    data-type={n.type}
                    onClick={() => handleNotificationClick(n)}
                  >
                    {/* 图标 */}
                    <div className={`icon-wrapper ${getIconClass(n.type)}`}>
                      <i className={`fa-solid ${getIconSvg(n.type)}`}></i>
                    </div>

                    {/* 内容 */}
                    <div className="notification-content">
                      <div className="notification-title-row">
                        <span className="notification-title">{getNotificationTitle(n)}</span>
                        <span className="notification-timestamp">{formatTime(n.created_at)}</span>
                      </div>
                      <div className="notification-desc">{getNotificationDescription(n)}</div>
                    </div>
                  </div>
                ))}
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
