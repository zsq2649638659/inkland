"use client";
import SiteIcon from "@/components/SiteIcon";
import { InklandIcon, type InklandIconName } from "@/components/inkland/iconRegistry";

import { Suspense, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/AuthProvider";
import { formatNotificationCount } from "@/lib/notifications";
import { fetchVisibleUnreadNotificationCount, notificationPreferencesCacheKey, readNotificationPreferences } from "@/lib/notificationPreferences";
import { includeTestDataForProfile, withTestDataVisibility } from "@/lib/test-data-visibility";
import { getOrCreateClientCache, invalidateClientCache, readClientCache } from "@/lib/client-cache";

function HomeSidebarContent() {
  const supabase = useMemo(() => createClient(), []);
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [notificationCount, setNotificationCount] = useState(0);
  const [newWorksCount, setNewWorksCount] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [showLogout, setShowLogout] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
    void getOrCreateClientCache(`new-works:${user.id}:${includeTestDataForProfile(profile) ? "test" : "public"}:${lastSeen}`, async () => {
      const query = withTestDataVisibility(
        supabase
          .from("posts")
          .select("id", { count: "exact", head: true })
          .eq("status", "published")
          .gt("created_at", lastSeen),
        includeTestDataForProfile(profile),
      );
      const { count } = await query;
      return count || 0;
    }, { ttlMs: 30_000, persist: true }).then((count) => setNewWorksCount(count));
  }, [user, profile?.is_test_account, pathname, supabase]);

  useEffect(() => {
    if (!user) return;
    const notificationPreferences = readNotificationPreferences(user);
    const cacheKey = `notification-count:${user.id}:${includeTestDataForProfile(profile) ? "test" : "public"}:${notificationPreferencesCacheKey(notificationPreferences)}`;
    const cached = readClientCache<number>(cacheKey, 30_000, true);
    if (cached !== undefined) setNotificationCount(cached);
    const fetchNotificationCount = () => {
      void getOrCreateClientCache(cacheKey, async () => {
        return fetchVisibleUnreadNotificationCount(
          supabase,
          user.id,
          includeTestDataForProfile(profile),
          notificationPreferences,
        );
      }, { ttlMs: 30_000, persist: true }).then((count) => setNotificationCount(count));
    };
    if (cached === undefined) fetchNotificationCount();
    const timer = window.setInterval(fetchNotificationCount, 30_000);
    return () => {
      window.clearInterval(timer);
    };
  }, [user, profile?.is_test_account, supabase]);

  const isActive = (page: string) => {
    if (page === "home") return pathname === "/";
    if (page === "profile-settings") return pathname === "/profile-settings";
    if (page === "relationships") return pathname === "/relationships" || pathname.startsWith("/relationships/");
    if (page === "profile") return pathname === "/profile";
    if (page === "settings") return pathname === "/settings";
    if (page === "more") return pathname === "/about" || pathname === "/contact";
    return pathname.startsWith(`/${page}`);
  };

  const toggleTheme = () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  };

  const menuItems: Array<{ page: string; icon: InklandIconName; label: string; href: string; badge?: number }> = [
    { page: "home", icon: "fa-house", label: "首页", href: "/", badge: newWorksCount },
    { page: "search", icon: "fa-magnifying-glass", label: "搜索", href: "/search" },
    { page: "notifications", icon: "fa-bell", label: "我的消息", href: "/notifications", badge: notificationCount },
    { page: "studio", icon: "fa-workbench", label: "作品管理", href: "/studio" },
    { page: "relationships", icon: "fa-followers", label: "关注粉丝", href: "/relationships" },
    { page: "profile", icon: "fa-profile-center", label: "我的空间", href: "/profile" },
    { page: "history", icon: "fa-clock-rotate-left", label: "阅读历史", href: "/history" },
    { page: "profile-settings", icon: "fa-profile-settings", label: "个人资料", href: "/profile-settings" },
  ];

  // 只有首次鉴权还没完成时才替换成骨架。
  // 页面之间切换时，侧栏会重新挂载，但用户信息应立即保留，统计数据在后台更新即可。
  if (authLoading) {
    const loadingMenuItems: Array<{ page: string; icon: InklandIconName; label: string; href: string }> = [
      { page: "home", icon: "fa-house", label: "首页", href: "/" },
      { page: "search", icon: "fa-magnifying-glass", label: "搜索", href: "/search" },
      { page: "notifications", icon: "fa-bell", label: "我的消息", href: "/notifications" },
      { page: "studio", icon: "fa-workbench", label: "作品管理", href: "/studio" },
      { page: "relationships", icon: "fa-followers", label: "关注粉丝", href: "/relationships" },
      { page: "profile", icon: "fa-profile-center", label: "我的空间", href: "/profile" },
      { page: "history", icon: "fa-clock-rotate-left", label: "阅读历史", href: "/history" },
      { page: "profile-settings", icon: "fa-profile-settings", label: "个人资料", href: "/profile-settings" },
    ];
    return (
      <aside className="sidebar" aria-label="侧边导航加载中" aria-busy="true">
        <div className="sidebar-card">
          {loadingMenuItems.map((item) => (
            <Link key={item.page} href={item.href} title={item.label} className={`sidebar-menu-item ${isActive(item.page) ? "active" : ""}`}>
              <span className="sidebar-menu-icon"><InklandIcon name={item.icon} variant={isActive(item.page) ? "solid" : "outline"} aria-hidden="true" /></span>
              <span className="sidebar-menu-label">{item.label}</span>
            </Link>
          ))}
          <Link href="/settings" title="设置和隐私" className={`sidebar-menu-item ${isActive("settings") ? "active" : ""}`}>
            <span className="sidebar-menu-icon"><SiteIcon name="fa-gear" variant="solid" size={16} /></span>
            <span className="sidebar-menu-label">设置和隐私</span>
          </Link>
          <button className="sidebar-menu-item sidebar-more-trigger text-left" title="更多" onClick={() => setMoreOpen(!moreOpen)}>
            <span className="sidebar-menu-icon"><SiteIcon name="fa-ellipsis-circle" /></span>
            <span className="sidebar-menu-label">更多</span>
          </button>
        </div>
      </aside>
    );
  }

  // 未登录状态 UI - 完全按照设计稿 home-unlogged.html
  if (!user) {
    return (
      <aside className="sidebar">
        <div className="sidebar-card">
          {menuItems.map((item) => (
            <Link
              key={item.page}
              href={item.href}
              title={item.label}
              className={`sidebar-menu-item ${isActive(item.page) ? "active" : ""}`}
            >
              <span className="sidebar-menu-icon">
                <InklandIcon name={item.icon} variant={isActive(item.page) ? "solid" : "outline"} />
              </span>
              <span className="sidebar-menu-label">{item.label}</span>
            </Link>
          ))}
          <button
            className="sidebar-menu-item sidebar-more-trigger text-left"
            title="更多"
            onClick={() => setMoreOpen(!moreOpen)}
          >
            <span className="sidebar-menu-icon">
              <span className="sidebar-more-icon">
                <SiteIcon name="fa-ellipsis-circle" />
              </span>
            </span>
            <span className="sidebar-menu-label">更多</span>
          </button>
          {(moreOpen || isActive("more")) && (
            <div className="sidebar-more-dropdown">
              <button className="sidebar-more-item" onClick={toggleTheme}>
                <span className="sidebar-more-item-icon"><SiteIcon name="fa-moon" variant="solid" /></span>
                日夜模式
              </button>
              <Link
                href="/contact"
                className={`sidebar-more-item no-underline ${pathname === "/contact" ? "active" : ""}`}
                onClick={() => setMoreOpen(false)}
              >
                <span className="sidebar-more-item-icon"><InklandIcon name="fa-contact-us" /></span>
                联系我们
              </Link>
              <Link
                href="/about"
                className={`sidebar-more-item no-underline ${pathname === "/about" ? "active" : ""}`}
                onClick={() => setMoreOpen(false)}
              >
                <span className="sidebar-more-item-icon"><InklandIcon name="fa-about-us" /></span>
                关于我们
              </Link>
            </div>
          )}
        </div>
      </aside>
    );
  }

  return (
    <>
      <aside className="sidebar">
      <div className="sidebar-card">
      {/* Menu items */}
      {menuItems.map((item) => (
        <Link
          key={item.page}
          href={item.href}
          className={`sidebar-menu-item ${isActive(item.page) ? "active" : ""}`}
        >
          <span className="sidebar-menu-icon">
            <InklandIcon name={item.icon} variant={isActive(item.page) ? "solid" : "outline"} />
          </span>
          <span className="sidebar-menu-label">{item.label}</span>
          {item.badge !== undefined && item.badge > 0 && (
            <span className="sidebar-menu-badge">
              {item.page === "notifications" ? formatNotificationCount(item.badge) : item.badge}
            </span>
          )}
        </Link>
      ))}

      {/* Settings link */}
      <Link
        href="/settings"
        className={`sidebar-menu-item ${isActive("settings") ? "active" : ""}`}
      >
        <span className="sidebar-menu-icon">
          <SiteIcon name="fa-gear" variant="solid" size={16} />
        </span>
        <span className="sidebar-menu-label">设置和隐私</span>
      </Link>

      {/* More actions */}
      <div className="sidebar-more-container">
        <button
          className="sidebar-menu-item sidebar-more-trigger text-left"
          title="更多"
          onClick={() => setMoreOpen(!moreOpen)}
        >
          <span className="sidebar-menu-icon">
            <span className="sidebar-more-icon">
              <SiteIcon name="fa-ellipsis-circle" />
            </span>
          </span>
          <span className="sidebar-menu-label">更多</span>
        </button>

        {/* More dropdown */}
        {(moreOpen || isActive("more")) && (
          <div className="sidebar-more-dropdown">
          <button
            className="sidebar-more-item"
            onClick={toggleTheme}
          >
            <span className="sidebar-more-item-icon"><SiteIcon name="fa-moon" variant="solid" /></span>
            日夜模式
          </button>
          <Link
            href="/contact"
            className={`sidebar-more-item no-underline ${pathname === "/contact" ? "active" : ""}`}
            onClick={() => setMoreOpen(false)}
          >
            <span className="sidebar-more-item-icon"><InklandIcon name="fa-contact-us" /></span>
            联系我们
          </Link>
          <Link
            href="/about"
            className={`sidebar-more-item no-underline ${pathname === "/about" ? "active" : ""}`}
            onClick={() => setMoreOpen(false)}
          >
            <span className="sidebar-more-item-icon"><InklandIcon name="fa-about-us" /></span>
            关于我们
          </Link>
          <button
            className="sidebar-more-item"
            onClick={() => { setMoreOpen(false); setShowLogout(true); }}
          >
            <span className="sidebar-more-item-icon"><SiteIcon name="fa-right-from-bracket" variant="solid" /></span>
            退出账户
          </button>
          <button
            className="sidebar-more-item sidebar-more-item-danger"
            onClick={() => { setMoreOpen(false); setShowDeleteAccount(true); }}
          >
            <span className="sidebar-more-item-icon"><SiteIcon name="fa-power" variant="solid" /></span>
            注销账户
          </button>
          </div>
        )}
      </div>
      </div>
    </aside>

      {/* ---- Popup: 退出账户 (portal to body) ---- */}
      {mounted && createPortal(
        showLogout && (
          <div className="sidebar-overlay" onClick={() => setShowLogout(false)}>
            <div className="sidebar-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="sidebar-dialog-icon" style={{ background: "var(--color-primary-bg)", color: "var(--color-primary)" }}>
                <SiteIcon name="fa-right-from-bracket" variant="solid" />
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
                <SiteIcon name="fa-circle-exclamation" variant="solid" />
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
                  <SiteIcon name="fa-trash-can" variant="outline" /> 永久注销账户
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

export default function HomeSidebar() {
  return (
    <Suspense fallback={null}>
      <HomeSidebarContent />
    </Suspense>
  );
}
