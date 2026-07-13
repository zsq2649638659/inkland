"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/AuthProvider";
import type { UserProfile } from "@/components/AuthProvider";

interface UserHoverCardProps {
  userId: string;
  profile: UserProfile | null;
  displayName: string;
  avatarChar: string;
  children: React.ReactNode;
}

export default function UserHoverCard({ userId, profile, displayName, avatarChar, children }: UserHoverCardProps) {
  const supabase = createClient();
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState({ following: 0, followers: 0, works: 0 });
  const [loading, setLoading] = useState(false);
  const [cardPosition, setCardPosition] = useState({ top: 0, left: 0 });
  const cardRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const t = document.documentElement.getAttribute("data-theme");
    setTheme(t === "dark" ? "dark" : "light");
    const observer = new MutationObserver(() => {
      const nt = document.documentElement.getAttribute("data-theme");
      setTheme(nt === "dark" ? "dark" : "light");
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClick);
    }
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const fetchStats = async () => {
    if (loading) return;
    setLoading(true);
    const [followingRes, followerRes, worksRes] = await Promise.all([
      supabase.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", userId),
      supabase.from("follows").select("id", { count: "exact", head: true }).eq("following_id", userId),
      supabase.from("posts").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "published"),
    ]);
    setStats({
      following: followingRes.count || 0,
      followers: followerRes.count || 0,
      works: worksRes.count || 0,
    });
    setLoading(false);
  };

  const updatePosition = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setCardPosition({
        top: rect.bottom + 4,
        left: rect.left + rect.width / 2,
      });
    }
  };

  const handleMouseEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      updatePosition();
      setOpen(true);
      fetchStats();
    }, 300);
  };

  const handleMouseLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setOpen(false), 200);
  };

  const cardContent = (
    <div
      ref={cardRef}
      className="fixed w-72 bg-white border border-rule rounded-2xl shadow-2xl overflow-hidden"
      style={{
        zIndex: 99999,
        top: `${cardPosition.top}px`,
        left: `${cardPosition.left}px`,
        transform: "translateX(-50%)",
      }}
      onMouseEnter={() => { if (timerRef.current) clearTimeout(timerRef.current); }}
      onMouseLeave={() => setOpen(false)}
    >
      {/* 用户信息 - 居中布局 */}
      <div className="px-4 pt-5 pb-3 flex flex-col items-center">
        <Link href={`/user/${userId}`} onClick={() => setOpen(false)}>
          <img
            src={profile?.avatar_url || `https://placehold.co/64x64/f5e6d3/b8752e?text=${encodeURIComponent(avatarChar)}`}
            className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-md"
            alt=""
          />
        </Link>
        <Link
          href={`/user/${userId}`}
          className="mt-2 font-semibold text-base text-accent no-underline hover:opacity-80 transition-opacity"
          onClick={() => setOpen(false)}
        >
          {displayName}
        </Link>
        <p className="text-xs text-muted mt-0.5 text-center line-clamp-1">{profile?.bio || "这个用户很懒，什么都没写"}</p>
      </div>

      {/* 统计数据 - 三列 */}
      <div className="flex">
        <Link
          href={`/user/${userId}?tab=following`}
          className="flex-1 text-center py-3 no-underline hover:bg-accent-light/30 transition-colors"
          onClick={() => setOpen(false)}
        >
          <div className="text-base font-bold text-warm">{stats.following}</div>
          <div className="text-[0.65rem] text-muted">关注</div>
        </Link>
        <Link
          href={`/user/${userId}?tab=followers`}
          className="flex-1 text-center py-3 no-underline hover:bg-accent-light/30 transition-colors"
          onClick={() => setOpen(false)}
        >
          <div className="text-base font-bold text-warm">{stats.followers}</div>
          <div className="text-[0.65rem] text-muted">粉丝</div>
        </Link>
        <div className="flex-1 text-center py-3">
          <div className="text-base font-bold text-warm">{stats.works}</div>
          <div className="text-[0.65rem] text-muted">作品</div>
        </div>
      </div>

      {/* 菜单项 */}
      <div className="border-t border-rule py-1">
        <Link
          href="/profile"
          className="flex items-center gap-2.5 px-5 py-2.5 text-sm text-warm no-underline hover:bg-accent-light transition-colors"
          onClick={() => setOpen(false)}
        >
          <i className="fa-solid fa-user text-accent text-xs w-4 text-center" />
          <span>个人中心</span>
          <i className="fa-solid fa-chevron-right text-[0.6rem] text-muted ml-auto" />
        </Link>
        <Link
          href="/studio"
          className="flex items-center gap-2.5 px-5 py-2.5 text-sm text-warm no-underline hover:bg-accent-light transition-colors"
          onClick={() => setOpen(false)}
        >
          <i className="fa-solid fa-pen-to-square text-accent text-xs w-4 text-center" />
          <span>创作中心</span>
          <i className="fa-solid fa-chevron-right text-[0.6rem] text-muted ml-auto" />
        </Link>
        <Link
          href="/profile?tab=likes"
          className="flex items-center gap-2.5 px-5 py-2.5 text-sm text-warm no-underline hover:bg-accent-light transition-colors"
          onClick={() => setOpen(false)}
        >
          <i className="fa-solid fa-heart text-accent text-xs w-4 text-center" />
          <span>我的喜欢</span>
          <i className="fa-solid fa-chevron-right text-[0.6rem] text-muted ml-auto" />
        </Link>
        <Link
          href="/profile?tab=bookmarks"
          className="flex items-center gap-2.5 px-5 py-2.5 text-sm text-warm no-underline hover:bg-accent-light transition-colors"
          onClick={() => setOpen(false)}
        >
          <i className="fa-solid fa-bookmark text-accent text-xs w-4 text-center" />
          <span>我的收藏</span>
          <i className="fa-solid fa-chevron-right text-[0.6rem] text-muted ml-auto" />
        </Link>
      </div>

      {/* 主题切换 */}
      <div className="border-t border-rule py-1">
        <button
          className="w-full text-left flex items-center gap-2.5 px-5 py-2.5 text-sm text-warm hover:bg-accent-light transition-colors"
          onClick={() => {
            const html = document.documentElement;
            const next = theme === "dark" ? "light" : "dark";
            html.setAttribute("data-theme", next);
            try { localStorage.setItem("theme", next); } catch { /* ignore */ }
          }}
        >
          <i className={`fa-solid fa-${theme === "dark" ? "sun" : "moon"} text-xs w-4 text-center`} />
          <span>{theme === "dark" ? "日间模式" : "夜间模式"}</span>
        </button>
      </div>

      {/* 退出登录 */}
      <div className="border-t border-rule py-1">
        <button
          className="w-full text-left flex items-center gap-2.5 px-5 py-2.5 text-sm text-muted hover:bg-accent-light transition-colors"
          onClick={() => { setOpen(false); signOut(); }}
        >
          <i className="fa-solid fa-right-from-bracket text-xs w-4 text-center" />
          <span>退出登录</span>
        </button>
      </div>
    </div>
  );

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {open && createPortal(cardContent, document.body)}
    </div>
  );
}