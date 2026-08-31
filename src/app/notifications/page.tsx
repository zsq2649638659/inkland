"use client";

import { useEffect, useState, useCallback, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import HomeSidebar from "@/components/HomeSidebar";
import { createClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/AuthProvider";
import { formatNotificationCount } from "@/lib/notifications";
import { SkeletonNotification } from "@/components/Skeleton";

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
  // joined fields
  actor_nickname?: string | null;
  actor_avatar_url?: string | null;
  post_title?: string | null;
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
    const timer = window.setInterval(loadUnreadByType, 30_000);
    return () => window.clearInterval(timer);
  }, [user]);

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

    // actor 资料和作品标题通过 PostgREST 关联一次取回，避免通知列表再串行请求用户和作品。
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

    const enriched = raw.map((n) => {
      return {
        ...n,
        actor_nickname: n.actor?.nickname || null,
        actor_avatar_url: n.actor?.avatar_url || null,
        post_title: n.post ? (n.post.title || "未知作品") : null,
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
    // Navigate based on type
    if (n.post_id && (n.type === "comment" || n.type === "like" || n.type === "bookmark" || n.type === "reply")) {
      const commentAnchor = n.type === "comment" || n.type === "reply" ? "#comments" : "";
      router.push(`/read/${n.post_id}${commentAnchor}`);
    } else if (n.type === "follow" && n.actor_id) {
      router.push(`/user/${n.actor_id}`);
    }
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

  const renderSystemDescription = (content: string) => {
    const activity = content.match(/「([^」]+)」/);
    const guideline = content.match(/《([^》]+)》/);
    const match = activity || guideline;
    if (!match) return content;
    const href = activity ? `/search?q=${encodeURIComponent(match[1])}` : "/settings";
    const start = match.index || 0;
    const label = match[0];
    return <>{content.slice(0, start)}<a href={href} onClick={(event) => event.stopPropagation()}>{label}</a>{content.slice(start + label.length)}</>;
  };

  const getNotificationDescription = (notification: NotificationItem): ReactNode => {
    // 关注类型
    if (notification.type === "follow") return <>{renderActor(notification)} 关注了你</>;
    // 系统通知类型
    if (notification.type === "system") return renderSystemDescription(notification.content);

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
