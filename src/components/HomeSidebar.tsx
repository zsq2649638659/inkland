"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/AuthProvider";
import { formatNotificationCount } from "@/lib/notifications";
import { getOrCreateClientCache, invalidateClientCache, readClientCache } from "@/lib/client-cache";

type SidebarStats = {
  following: number | null;
  followers: number | null;
  works: number | null;
};

const emptyStats: SidebarStats = { following: null, followers: null, works: null };
const statsCache = new Map<string, SidebarStats>();

function getCachedStats(userId: string): SidebarStats {
  const memoryStats = statsCache.get(userId);
  if (memoryStats) return memoryStats;
  try {
    const stored = sessionStorage.getItem(`inkland-sidebar-stats:${userId}`);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<SidebarStats>;
      if (typeof parsed.following === "number" && typeof parsed.followers === "number" && typeof parsed.works === "number") {
        const cached = parsed as SidebarStats;
        statsCache.set(userId, cached);
        return cached;
      }
    }
  } catch { /* ignore unavailable session storage */ }
  return emptyStats;
}

function saveCachedStats(userId: string, stats: SidebarStats) {
  statsCache.set(userId, stats);
  try {
    sessionStorage.setItem(`inkland-sidebar-stats:${userId}`, JSON.stringify(stats));
  } catch { /* ignore unavailable session storage */ }
}

export default function HomeSidebar() {
  const supabase = useMemo(() => createClient(), []);
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [userStats, setUserStats] = useState<SidebarStats>(() => user ? getCachedStats(user.id) : emptyStats);
  const [notificationCount, setNotificationCount] = useState(0);
  const [newWorksCount, setNewWorksCount] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [showLogout, setShowLogout] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [mounted, setMounted] = useState(false);

  const displayName = profile?.nickname || user?.email?.split("@")[0] || "用户";
  const avatarChar = displayName[0] || "?";
  const bio = profile?.bio || "这个人很懒，什么都没写";

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }
    const cachedStats = getCachedStats(user.id);
    setUserStats(cachedStats);
    const loadStats = async () => {
      const nextStats = await getOrCreateClientCache(`sidebar-stats:${user.id}`, async () => {
        const [{ count: followingCount }, { count: followersCount }, { data: publishedPosts }, { data: series }] = await Promise.all([
          supabase.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", user.id),
          supabase.from("follows").select("id", { count: "exact", head: true }).eq("following_id", user.id),
          supabase.from("posts").select("id, review_status").eq("user_id", user.id).eq("status", "published").neq("post_type", "serial").neq("review_status", "rejected"),
          supabase.from("series").select("name").eq("user_id", user.id),
        ]);

        const seriesCount = new Set(((series || []) as Array<{ name?: string | null }>).map((item) => item.name).filter(Boolean)).size;
        return {
          following: followingCount || 0,
          followers: followersCount || 0,
          works: (publishedPosts || []).length + seriesCount,
        };
      }, { ttlMs: 30_000, persist: true });
      setUserStats(nextStats);
      saveCachedStats(user.id, nextStats);
    };
    loadStats();
    const handleStatsChanged = () => {
      invalidateClientCache(`sidebar-stats:${user.id}`);
      loadStats();
    };
    window.addEventListener("inkland:stats-changed", handleStatsChanged);
    return () => window.removeEventListener("inkland:stats-changed", handleStatsChanged);
  }, [user, supabase]);

  useEffect(() => {
    if (!user) return;
    const lastSeenKey = `inkland-home-last-seen:${user.id}`;
    const now = new Date().toISOString();
    let lastSeen = "";
    try {
      lastSeen = localStorage.getItem(lastSeenKey) || "";
      if (pathname === "/") {
        localStorage.setItem(lastSeenKey, now);
        setNewWorksCount(0);
      }
    } catch { /* ignore unavailable local storage */ }

    if (!lastSeen || pathname === "/") return;
    void getOrCreateClientCache(`new-works:${user.id}:${lastSeen}`, async () => {
      const { count } = await supabase
        .from("posts")
        .select("id", { count: "exact", head: true })
        .eq("status", "published")
        .gt("created_at", lastSeen);
      return count || 0;
    }, { ttlMs: 30_000, persist: true }).then((count) => setNewWorksCount(count));
  }, [user, pathname, supabase]);

  useEffect(() => {
    if (!user) return;
    const cached = readClientCache<number>(`notification-count:${user.id}`, 30_000, true);
    if (cached !== undefined) setNotificationCount(cached);
    const fetchNotificationCount = () => {
      void getOrCreateClientCache(`notification-count:${user.id}`, async () => {
        const { count } = await supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("read", false);
        return count || 0;
      }, { ttlMs: 30_000, persist: true }).then((count) => setNotificationCount(count));
    };
    if (cached === undefined) fetchNotificationCount();
    const timer = window.setInterval(fetchNotificationCount, 30_000);
    return () => window.clearInterval(timer);
  }, [user, supabase]);

  const isActive = (page: string) => {
    if (page === "home") return pathname === "/";
    return pathname.startsWith(`/${page}`);
  };

  const toggleTheme = () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  };

  const menuItems = [
    { page: "home", icon: "fa-house", label: "首页", href: "/", badge: newWorksCount },
    { page: "search", icon: "fa-magnifying-glass", label: "搜索", href: "/search" },
    { page: "profile", icon: "fa-circle-user", label: "个人中心", href: "/profile" },
    { page: "studio", icon: "fa-pen-to-square", label: "创作中心", href: "/studio" },
    { page: "notifications", icon: "fa-bell", label: "我的消息", href: "/notifications", badge: notificationCount },
  ];

  // 只有首次鉴权还没完成时才替换成骨架。
  // 页面之间切换时，侧栏会重新挂载，但用户信息应立即保留，统计数据在后台更新即可。
  if (authLoading) {
    const loadingMenuItems = [
      { icon: "fa-house", label: "首页", href: "/" },
      { icon: "fa-magnifying-glass", label: "搜索", href: "/search" },
      { icon: "fa-circle-user", label: "个人中心", href: "/profile" },
      { icon: "fa-pen-to-square", label: "创作中心", href: "/studio" },
      { icon: "fa-bell", label: "我的消息", href: "/notifications" },
    ];
    return (
      <aside className="sidebar hidden lg:block" aria-label="侧边导航加载中" aria-busy="true">
        <div className="sidebar-card">
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">
              <i className="fa-solid fa-user text-white/60" />
            </div>
            <div className="sidebar-user-info">
              <div className="sidebar-skeleton-line sidebar-skeleton-name" aria-hidden="true" />
              <div className="sidebar-skeleton-line sidebar-skeleton-bio" aria-hidden="true" />
              <div className="sidebar-user-stats">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="sidebar-stat">
                    <div className="sidebar-skeleton-line sidebar-skeleton-stat" aria-hidden="true" />
                    <div className="sidebar-skeleton-line sidebar-skeleton-stat-label" aria-hidden="true" />
                  </div>
                ))}
              </div>
            </div>
          </div>
          {loadingMenuItems.map((item) => (
            <Link key={item.label} href={item.href} className={`sidebar-menu-item ${isActive(item.label === "首页" ? "home" : item.href.slice(1)) ? "active" : ""}`}>
              <span className="sidebar-menu-icon"><i className={`fa-solid ${item.icon}`} aria-hidden="true" /></span>
              <span className="sidebar-menu-label">{item.label}</span>
            </Link>
          ))}
          <button className="sidebar-menu-item text-left" onClick={toggleTheme}>
            <span className="sidebar-menu-icon"><i className="fa-solid fa-moon" /></span>
            <span className="sidebar-menu-label">日夜模式</span>
          </button>
          <Link href="/settings" className={`sidebar-menu-item ${isActive("settings") ? "active" : ""}`}>
            <span className="sidebar-menu-icon"><i className="fa-solid fa-gear" /></span>
            <span className="sidebar-menu-label">设置</span>
          </Link>
          <button className="sidebar-menu-item text-left" onClick={() => setMoreOpen(!moreOpen)}>
            <span className="sidebar-menu-icon"><i className="fa-solid fa-ellipsis" /></span>
            <span className="sidebar-menu-label">更多</span>
          </button>
        </div>
      </aside>
    );
  }

  // 未登录状态 UI - 完全按照设计稿 home-unlogged.html
  if (!user) {
    return (
      <aside className="sidebar hidden lg:block">
        <div className="sidebar-card">
          <div className="sidebar-user sidebar-user-unauth">
            <div className="sidebar-user-avatar">
              <i className="fa-solid fa-user" />
            </div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">欢迎来到 inkland</div>
              <div className="sidebar-user-bio">登录后即可发布作品、收藏喜欢的内容，加入创作社区</div>
              <div className="sidebar-user-stats">
                <Link href="/login" className="sidebar-login-btn">登录</Link>
                <Link href="/login" className="sidebar-register-btn">还没有账号？立即注册 →</Link>
              </div>
            </div>
          </div>
          {menuItems.map((item) => (
            <Link
              key={item.page}
              href={item.href}
              className={`sidebar-menu-item ${isActive(item.page) ? "active" : ""}`}
            >
              <span className="sidebar-menu-icon">
                <i className={`fa-solid ${item.icon}`} />
              </span>
              <span className="sidebar-menu-label">{item.label}</span>
            </Link>
          ))}
          <button className="sidebar-menu-item text-left" onClick={toggleTheme}>
            <span className="sidebar-menu-icon"><i className="fa-solid fa-moon" /></span>
            <span className="sidebar-menu-label">日夜模式</span>
          </button>
        </div>
      </aside>
    );
  }

  return (
    <>
      <aside className="sidebar hidden lg:block">
      <div className="sidebar-card">
        {/* User info */}
        <div className="sidebar-user">
        <Link href="/profile" className="no-underline">
          <div className="sidebar-user-avatar">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" />
            ) : (
              avatarChar
            )}
          </div>
        </Link>
        <div className="sidebar-user-info">
          <Link href="/profile" className="no-underline">
            <div className="sidebar-user-name">{displayName}</div>
          </Link>
          <div className="sidebar-user-bio">{bio}</div>
          <div className="sidebar-user-stats">
            <div className="sidebar-stat">
              <div className="sidebar-stat-value">{userStats.following ?? "—"}</div>
              <div className="sidebar-stat-label">关注</div>
            </div>
            <div className="sidebar-stat">
              <div className="sidebar-stat-value">{userStats.followers ?? "—"}</div>
              <div className="sidebar-stat-label">粉丝</div>
            </div>
            <div className="sidebar-stat">
              <div className="sidebar-stat-value">{userStats.works ?? "—"}</div>
              <div className="sidebar-stat-label">作品</div>
            </div>
          </div>
        </div>
      </div>

      {/* Menu items */}
      {menuItems.map((item) => (
        <Link
          key={item.page}
          href={item.href}
          className={`sidebar-menu-item ${isActive(item.page) ? "active" : ""}`}
        >
          <span className="sidebar-menu-icon">
            <i className={`fa-solid ${item.icon}`} />
          </span>
          <span className="sidebar-menu-label">{item.label}</span>
          {item.badge !== undefined && item.badge > 0 && (
            <span className="sidebar-menu-badge">
              {item.page === "notifications" ? formatNotificationCount(item.badge) : item.badge}
            </span>
          )}
        </Link>
      ))}

      {/* Theme toggle */}
      <button
        className="sidebar-menu-item text-left"
        onClick={toggleTheme}
      >
        <span className="sidebar-menu-icon">
          <i className="fa-solid fa-moon" />
        </span>
        <span className="sidebar-menu-label">日夜模式</span>
      </button>

      {/* Settings link */}
      <Link
        href="/settings"
        className={`sidebar-menu-item ${isActive("settings") ? "active" : ""}`}
      >
        <span className="sidebar-menu-icon">
          <i className="fa-solid fa-gear" />
        </span>
        <span className="sidebar-menu-label">设置</span>
      </Link>

      {/* More actions */}
      <button
        className="sidebar-menu-item text-left"
        onClick={() => setMoreOpen(!moreOpen)}
      >
        <span className="sidebar-menu-icon">
          <span className="sidebar-more-icon">
            <svg viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="9" cy="9" r="7.5" stroke="currentColor" strokeWidth="2" fill="none" />
              <circle cx="5.5" cy="9" r="1.2" fill="currentColor" />
              <circle cx="9" cy="9" r="1.2" fill="currentColor" />
              <circle cx="12.5" cy="9" r="1.2" fill="currentColor" />
            </svg>
          </span>
        </span>
        <span className="sidebar-menu-label">更多</span>
      </button>

      {/* More dropdown */}
      {moreOpen && (
        <div className="sidebar-more-dropdown">
          <button
            className="sidebar-more-item"
            onClick={() => { setMoreOpen(false); setShowLogout(true); }}
          >
            <span className="sidebar-more-item-icon"><i className="fa-solid fa-right-from-bracket"></i></span>
            退出账户
          </button>
          <button
            className="sidebar-more-item sidebar-more-item-danger"
            onClick={() => { setMoreOpen(false); setShowDeleteAccount(true); }}
          >
            <span className="sidebar-more-item-icon"><i className="fa-solid fa-trash-can"></i></span>
            注销账户
          </button>
        </div>
      )}
      </div>
    </aside>

      {/* ---- Popup: 退出账户 (portal to body) ---- */}
      {mounted && createPortal(
        showLogout && (
          <div className="sidebar-overlay" onClick={() => setShowLogout(false)}>
            <div className="sidebar-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="sidebar-dialog-icon" style={{ background: "var(--color-primary-bg)", color: "var(--color-primary)" }}>
                <i className="fa-solid fa-right-from-bracket"></i>
              </div>
              <div className="sidebar-dialog-title">退出账户</div>
              <div className="sidebar-dialog-text">确定要退出当前账户吗？退出后需要重新登录。</div>
              <div className="sidebar-dialog-actions">
                <button className="settings-btn-secondary" onClick={() => setShowLogout(false)}>取消</button>
                <button
                  className="settings-btn-save"
                  onClick={async () => {
                    await supabase.auth.signOut();
                    setShowLogout(false);
                    router.push("/login");
                  }}
                >确认退出</button>
              </div>
            </div>
          </div>
        ),
        document.body
      )}

      {/* ---- Popup: 注销账户 (portal to body) ---- */}
      {mounted && createPortal(
        showDeleteAccount && (
          <div className="sidebar-overlay" onClick={() => setShowDeleteAccount(false)}>
            <div className="sidebar-dialog sidebar-dialog-danger" onClick={(e) => e.stopPropagation()}>
              <div className="sidebar-dialog-icon" style={{ background: "rgba(232,72,58,0.1)", color: "#E8483A" }}>
                <i className="fa-solid fa-triangle-exclamation"></i>
              </div>
              <div className="sidebar-dialog-title" style={{ color: "#E8483A" }}>注销账户</div>
              <div className="sidebar-dialog-text">
                注销账户是永久性操作，一旦确认，以下数据将被完全删除且无法恢复：
              </div>
              <ul className="sidebar-delete-list">
                <li>你发布的所有作品（包括插画、漫画、小说）</li>
                <li>所有评论、点赞、收藏记录</li>
                <li>个人资料、头像及相关设置</li>
                <li>粉丝与关注关系</li>
              </ul>
              <div className="sidebar-dialog-text" style={{ fontSize: "13px", marginBottom: "16px" }}>
                请在下方输入「我确认注销账号，绝不反悔」以继续操作：
              </div>
              <input
                type="text"
                className="sidebar-dialog-input"
                placeholder="我确认注销账号，绝不反悔"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
              />
              <div className="sidebar-dialog-actions">
                <button className="settings-btn-secondary" onClick={() => { setShowDeleteAccount(false); setDeleteConfirmText(""); }}>取消</button>
                <button
                  className="sidebar-btn-danger"
                  disabled={deleteConfirmText !== "我确认注销账号，绝不反悔"}
                  onClick={() => {
                    setShowDeleteAccount(false);
                    setDeleteConfirmText("");
                  }}
                >
                  <i className="fa-regular fa-trash-can"></i> 永久注销账户
                </button>
              </div>
            </div>
          </div>
        ),
        document.body
      )}
    </>
  );
}
