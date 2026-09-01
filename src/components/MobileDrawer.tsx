"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/browser";
import { useMobileDrawer } from "@/components/MobileDrawerContext";
import { useAuth } from "@/components/AuthProvider";
import { formatNotificationCount } from "@/lib/notifications";
import { includeTestDataForProfile, withTestDataVisibility } from "@/lib/test-data-visibility";
import DefaultAvatar from "@/components/DefaultAvatar";
import { getOrCreateClientCache, readClientCache } from "@/lib/client-cache";

export default function MobileDrawer() {
  const { open, closeDrawer } = useMobileDrawer();
  const { user, profile, loading: authLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [showLogout, setShowLogout] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [notificationCount, setNotificationCount] = useState(0);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    if (!user) return;
    const cacheKey = `notification-count:${user.id}:${includeTestDataForProfile(profile) ? "test" : "public"}`;
    const cached = readClientCache<number>(cacheKey, 30_000, true);
    if (cached !== undefined) setNotificationCount(cached);
    const fetchCount = () => {
      void getOrCreateClientCache(cacheKey, async () => {
        const query = withTestDataVisibility(
          supabase
            .from("notifications")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id)
            .eq("read", false),
          includeTestDataForProfile(profile),
        );
        const { count } = await query;
        return count || 0;
      }, { ttlMs: 30_000, persist: true }).then((count) => setNotificationCount(count));
    };
    if (cached === undefined) fetchCount();
    const timer = window.setInterval(fetchCount, 30_000);
    return () => {
      window.clearInterval(timer);
    };
  }, [user, profile?.is_test_account, supabase]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDrawer();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, closeDrawer]);

  const displayName = profile?.nickname || user?.email?.split("@")[0] || "用户";
  const avatarChar = displayName[0] || "?";
  const bio = profile?.bio || "这个人很懒，什么都没写";

  const menuItems = [
    { page: "home", icon: "fa-house", label: "首页", href: "/" },
    { page: "search", icon: "fa-magnifying-glass", label: "搜索", href: "/search" },
    { page: "profile", icon: "fa-circle-user", label: "个人中心", href: "/profile" },
    { page: "studio", icon: "fa-pen-to-square", label: "创作中心", href: "/studio" },
    { page: "notifications", icon: "fa-bell", label: "我的消息", href: "/notifications", badge: notificationCount },
  ];

  const isActive = (page: string) => {
    if (page === "home") return pathname === "/";
    return pathname.startsWith(`/${page}`);
  };

  const handleNav = (href: string) => {
    closeDrawer();
    router.push(href);
  };

  const drawerContent = open ? (
    <>
      {/* Overlay — 独立 fixed 元素，关闭时 display:none */}
      <div
        id="mobile-drawer"
        aria-label="移动端导航"
        aria-hidden={!open}
        inert={!open}
        style={{
          display: open ? "block" : "none",
          position: "fixed",
          inset: 0,
          background: "rgba(0, 0, 0, 0.4)",
          zIndex: 1001,
          opacity: open ? 1 : 0,
          transition: "opacity 0.3s ease",
        }}
        onClick={closeDrawer}
      />

      {/* Drawer panel — 独立 fixed 元素 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="移动端导航"
        tabIndex={-1}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          width: "280px",
          maxWidth: "85vw",
          height: "100vh",
          background: "var(--color-bg-page, #FAF9F7)",
          zIndex: 1002,
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            padding: "16px 20px",
          }}
        >
          <button
            aria-label="关闭菜单"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "44px",
              height: "44px",
              border: "none",
              background: "var(--color-bg-secondary, #E8E4E0)",
              borderRadius: "50%",
              cursor: "pointer",
              color: "var(--color-text-muted, #6B6B6B)",
              fontSize: "16px",
              transition: "all 0.2s ease",
            }}
            onClick={closeDrawer}
          >
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="mobile-drawer-body" style={{ flex: 1, padding: "12px 0" }}>
          {/* User section — 与参考设计保持一致的 sidebar-user 垂直居中布局 */}
          {authLoading ? (
            <div className="sidebar-user" aria-busy="true">
              <div className="sidebar-user-avatar">
                <i className="fa-solid fa-user text-white/60" />
              </div>
              <div className="sidebar-user-info">
                <div className="sidebar-user-name">正在确认登录状态…</div>
                <div className="sidebar-user-bio">请稍候</div>
              </div>
            </div>
          ) : user ? (
            <div className="sidebar-user">
              <div className="sidebar-user-avatar">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="" />
                ) : (
                  <DefaultAvatar name={avatarChar} style={{ width:"100%", height:"100%", borderRadius:"inherit" }} />
                )}
              </div>
              <div className="sidebar-user-info">
                <div className="sidebar-user-name">{displayName}</div>
                <div className="sidebar-user-bio">{bio}</div>
              </div>
            </div>
          ) : (
            <div className="sidebar-user sidebar-user-unauth">
              <div className="sidebar-user-avatar">
                <i className="fa-solid fa-user" />
              </div>
              <div className="sidebar-user-info">
                <div className="sidebar-user-name">欢迎来到 inkland</div>
                <div className="sidebar-user-bio">登录后即可发布作品、收藏喜欢的内容，加入创作社区</div>
                <div className="sidebar-user-stats">
                  <button className="sidebar-login-btn" onClick={() => handleNav("/login")}>
                    登录
                  </button>
                  <button className="sidebar-register-btn" onClick={() => handleNav("/login")}>
                    还没有账号？立即注册 →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Menu items */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {menuItems.map((item) => (
              <button
                key={item.page}
                className={`sidebar-menu-item text-left ${isActive(item.page) ? "active" : ""}`}
                onClick={() => handleNav(item.href)}
              >
                <span className="sidebar-menu-icon">
                  <i className={`fa-solid ${item.icon}`} />
                </span>
                <span className="sidebar-menu-label">{item.label}</span>
                {"badge" in item && (item.badge as number) > 0 && (
                  <span className="sidebar-menu-badge">
                    {formatNotificationCount(item.badge as number)}
                  </span>
                )}
              </button>
            ))}

            {/* Theme toggle */}
            <button
              className="sidebar-menu-item text-left"
              onClick={() => {
                const current = document.documentElement.getAttribute("data-theme");
                const next = current === "dark" ? "light" : "dark";
                document.documentElement.setAttribute("data-theme", next);
                localStorage.setItem("theme", next);
              }}
            >
              <span className="sidebar-menu-icon">
                <i className="fa-solid fa-moon" />
              </span>
              <span className="sidebar-menu-label">日夜模式</span>
            </button>

            {/* Settings link */}
            <button
              className={`sidebar-menu-item text-left ${pathname.startsWith("/settings") ? "active" : ""}`}
              onClick={() => handleNav("/settings")}
            >
              <span className="sidebar-menu-icon">
                <i className="fa-solid fa-gear" />
              </span>
              <span className="sidebar-menu-label">设置</span>
            </button>

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

            {moreOpen && (
              <div style={{ padding: "0 24px", display: "flex", flexDirection: "column", gap: "4px" }}>
                <button
                  className="sidebar-more-item"
                  style={{ width: "100%", textAlign: "left", padding: "10px 16px", borderRadius: "10px", border: "none", background: "transparent", cursor: "pointer", fontSize: "14px", color: "var(--color-text)", display: "flex", alignItems: "center", gap: "10px" }}
                  onClick={() => { setMoreOpen(false); setShowLogout(true); }}
                >
                  <span className="sidebar-more-item-icon"><i className="fa-solid fa-right-from-bracket"></i></span>
                  退出账户
                </button>
                <button
                  className="sidebar-more-item sidebar-more-item-danger"
                  style={{ width: "100%", textAlign: "left", padding: "10px 16px", borderRadius: "10px", border: "none", background: "transparent", cursor: "pointer", fontSize: "14px", color: "var(--color-primary)", display: "flex", alignItems: "center", gap: "10px" }}
                  onClick={() => { setMoreOpen(false); setShowDeleteAccount(true); }}
                >
                  <span className="sidebar-more-item-icon"><i className="fa-solid fa-trash-can"></i></span>
                  注销账户
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  ) : null;

  const popupContent = (
    <>
      {showLogout && (
        <div className="sidebar-overlay" onClick={() => setShowLogout(false)}>
          <div className="sidebar-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="sidebar-dialog-icon" style={{ background: "var(--color-primary-bg)", color: "var(--color-primary)" }}>
              <i className="fa-solid fa-right-from-bracket"></i>
            </div>
            <div className="sidebar-dialog-title">退出账户</div>
            <div className="sidebar-dialog-text">确定要退出当前账户吗？退出后需要重新登录。</div>
            <div className="sidebar-dialog-actions">
              <button
                style={{ padding: "10px 24px", borderRadius: "28px", border: "1px solid var(--color-border)", background: "transparent", cursor: "pointer", fontSize: "14px", fontWeight: 500, color: "var(--color-text-muted)" }}
                onClick={() => setShowLogout(false)}
              >取消</button>
              <button
                style={{ padding: "10px 24px", borderRadius: "28px", border: "none", background: "var(--color-primary)", color: "#fff", cursor: "pointer", fontSize: "14px", fontWeight: 600 }}
                onClick={async () => {
                  setShowLogout(false);
                  closeDrawer();
                  router.push("/login");
                }}
              >确认退出</button>
            </div>
          </div>
        </div>
      )}

      {showDeleteAccount && (
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
            <div style={{ fontSize: "13px", color: "var(--color-text-muted)", marginBottom: "16px" }}>
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
              <button
                style={{ padding: "10px 24px", borderRadius: "28px", border: "1px solid var(--color-border)", background: "transparent", cursor: "pointer", fontSize: "14px", fontWeight: 500, color: "var(--color-text-muted)" }}
                onClick={() => { setShowDeleteAccount(false); setDeleteConfirmText(""); }}
              >取消</button>
              <button
                style={{
                  padding: "10px 24px",
                  borderRadius: "28px",
                  border: "none",
                  background: deleteConfirmText === "我确认注销账号，绝不反悔" ? "#E8483A" : "#E8483A80",
                  color: "#fff",
                  cursor: deleteConfirmText === "我确认注销账号，绝不反悔" ? "pointer" : "not-allowed",
                  fontSize: "14px",
                  fontWeight: 600,
                }}
                disabled={deleteConfirmText !== "我确认注销账号，绝不反悔"}
                onClick={() => { setShowDeleteAccount(false); setDeleteConfirmText(""); }}
              >
                <i className="fa-regular fa-trash-can"></i> 永久注销账户
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  // SSR 时不渲染（portal 需要 DOM），客户端挂载后通过 portal 渲染到 body
  if (!mounted) return null;
  return (
    <>
      {createPortal(drawerContent, document.body)}
      {createPortal(popupContent, document.body)}
    </>
  );
}
