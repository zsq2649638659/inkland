"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";

import { createClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/AuthProvider";
import UserHoverCard from "@/components/UserHoverCard";

interface Suggestion {
  name: string;
  type: "tag" | "user" | "post";
  subtitle?: string;
  id?: string;
}

export default function Navbar() {
  const { user, profile, loading } = useAuth();
  const supabase = createClient();
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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

  const [searchQuery, setSearchQuery] = useState("");
  const [tagSuggestions, setTagSuggestions] = useState<Suggestion[]>([]);
  const [userSuggestions, setUserSuggestions] = useState<Suggestion[]>([]);
  const [postSuggestions, setPostSuggestions] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setTagSuggestions([]);
        setUserSuggestions([]);
        setPostSuggestions([]);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const displayName = profile?.nickname || user?.email?.split("@")[0] || "用户";
  const avatarChar = profile?.nickname?.[0] || user?.email?.[0] || "?";

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 1) {
      setTagSuggestions([]); setUserSuggestions([]); setPostSuggestions([]);
      return;
    }
    setSearching(true);
    const { data: tags } = await supabase.from("tags").select("name, post_count").ilike("name", `%${q}%`).order("post_count", { ascending: false }).limit(5);
    setTagSuggestions((tags || []).map((t: Record<string, unknown>) => ({ name: t.name as string, type: "tag" as const, subtitle: `${t.post_count} 篇` })));
    const { data: users } = await supabase.from("profiles").select("id, nickname, avatar_url").ilike("nickname", `%${q}%`).limit(5);
    setUserSuggestions((users || []).map((u: Record<string, unknown>) => ({ name: (u.nickname as string) || "匿名用户", type: "user" as const, id: u.id as string, subtitle: (u.avatar_url as string) || "" })));
    const { data: posts } = await supabase.from("posts").select("id, title").or(`title.ilike.%${q}%,content.ilike.%${q}%`).eq("status", "published").order("created_at", { ascending: false }).limit(5);
    setPostSuggestions((posts || []).map((p: Record<string, unknown>) => ({ name: (p.title as string) || "无标题", type: "post" as const, id: p.id as string })));
    setSearching(false);
  }, [supabase]);

  const handleSearchInput = (val: string) => {
    setSearchQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 200);
  };

  const handleSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && searchQuery.trim()) {
      window.location.href = `/search?q=${encodeURIComponent(searchQuery.trim())}`;
    }
  };

  const selectSuggestion = (s: Suggestion) => {
    if (s.type === "tag") window.location.href = `/tag/${encodeURIComponent(s.name)}`;
    else if (s.type === "user") window.location.href = `/user/${s.id}`;
    else window.location.href = `/read/${s.id}`;
  };

  const hasAnyResults = tagSuggestions.length > 0 || userSuggestions.length > 0 || postSuggestions.length > 0;

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 backdrop-blur-sm border-b"
      style={{
        background: theme === "dark" ? "rgba(26,26,26,0.95)" : "rgba(250,248,245,0.95)",
        borderColor: theme === "dark" ? "#333" : "#e8e0d5",
      }}
    >
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-warm no-underline flex items-center gap-1.5">
          <i className="fa-solid fa-feather-pointed text-accent" />墨者
        </Link>

        <div className="flex items-center gap-3">
          <div ref={searchRef} className="relative">
              <div className="relative">
                <input type="text" placeholder="搜索作品、标签、用户..." className="search-box" style={{ width: "320px" }}
                  value={searchQuery} onChange={(e) => handleSearchInput(e.target.value)} onKeyDown={handleSearchKey} onFocus={() => { if (searchQuery) fetchSuggestions(searchQuery); }}
                />
                {hasAnyResults && (
                  <div
                  className="absolute left-0 top-full mt-1 w-[640px] max-w-[95vw] border rounded-xl shadow-lg py-4 z-[200]"
                  style={{
                    background: theme === "dark" ? "#2a2a2a" : "#fff",
                    borderColor: theme === "dark" ? "#333" : "#e8e0d5",
                  }}
                >
                    <div className="grid grid-cols-3 gap-0 divide-x divide-rule">
                      <div className="px-4">
                        <div className="text-xs text-muted font-medium mb-2.5 px-1"><i className="fa-solid fa-tag mr-1" />相关标签</div>
                        {tagSuggestions.length > 0 ? tagSuggestions.map((s) => (
                          <button key={s.name} className="w-full text-left px-2 py-2 text-sm text-warm hover:bg-accent-light rounded-md flex items-center gap-2"
                            onMouseDown={(e) => { e.preventDefault(); selectSuggestion(s); }}>
                            <span className="truncate">{s.name}</span><span className="text-xs text-muted flex-shrink-0">{s.subtitle}</span>
                          </button>
                        )) : <p className="text-xs text-muted px-2 py-2">无匹配</p>}
                        <Link href={`/search?q=${encodeURIComponent(searchQuery)}&type=tags`} className="block text-xs text-accent hover:underline px-2 pt-1.5 mt-1" onMouseDown={(e) => e.preventDefault()}>查看更多 &gt;</Link>
                      </div>
                      <div className="px-4">
                        <div className="text-xs text-muted font-medium mb-2.5 px-1"><i className="fa-solid fa-user mr-1" />相关用户</div>
                        {userSuggestions.length > 0 ? userSuggestions.map((s) => (
                          <button key={s.id} className="w-full text-left px-2 py-2 text-sm text-warm hover:bg-accent-light rounded-md flex items-center gap-2"
                            onMouseDown={(e) => { e.preventDefault(); selectSuggestion(s); }}>
                            <img src={s.subtitle || `https://placehold.co/24x24/f5e6d3/b8752e?text=${encodeURIComponent(s.name[0] || "?")}`}
                              className="w-5 h-5 rounded-full object-cover flex-shrink-0" alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                            <span className="truncate">{s.name}</span>
                          </button>
                        )) : <p className="text-xs text-muted px-2 py-2">无匹配</p>}
                        <Link href={`/search?q=${encodeURIComponent(searchQuery)}&type=users`} className="block text-xs text-accent hover:underline px-2 pt-1.5 mt-1" onMouseDown={(e) => e.preventDefault()}>查看更多 &gt;</Link>
                      </div>
                      <div className="px-4">
                        <div className="text-xs text-muted font-medium mb-2.5 px-1"><i className="fa-solid fa-file-lines mr-1" />相关文章</div>
                        {postSuggestions.length > 0 ? postSuggestions.map((s) => (
                          <button key={s.id} className="w-full text-left px-2 py-2 text-sm text-warm hover:bg-accent-light rounded-md truncate block"
                            onMouseDown={(e) => { e.preventDefault(); selectSuggestion(s); }}>{s.name}</button>
                        )) : <p className="text-xs text-muted px-2 py-2">无匹配</p>}
                        <Link href={`/search?q=${encodeURIComponent(searchQuery)}`} className="block text-xs text-accent hover:underline px-2 pt-1.5 mt-1" onMouseDown={(e) => e.preventDefault()}>查看更多 &gt;</Link>
                      </div>
                    </div>
                  </div>
            )}
            {searching && !hasAnyResults && (
              <div className="absolute left-0 top-full mt-1 w-64 bg-white border border-rule rounded-xl shadow-lg py-3 z-[200] text-center">
                <span className="text-xs text-muted"><i className="fa-solid fa-spinner animate-spin mr-1" />搜索中...</span>
              </div>
            )}
          </div>
          </div>

          <Link href="/create" className="btn-accent hidden sm:inline-flex items-center gap-1.5 no-underline">
            <i className="fa-solid fa-pen-to-square text-sm" />创作
          </Link>

          {loading ? (
            <span className="btn-ghost"><i className="fa-solid fa-spinner animate-spin" /></span>
          ) : user ? (
            <UserHoverCard userId={user.id} profile={profile} displayName={displayName} avatarChar={avatarChar}>
              {/* 点击头像跳转个人中心，不出现下拉菜单 */}
              <Link href="/profile" className="btn-ghost flex items-center gap-1.5 no-underline">
                <img
                  src={profile?.avatar_url || `https://placehold.co/36x36/f5e6d3/b8752e?text=${encodeURIComponent(avatarChar)}`}
                  className="w-9 h-9 rounded-full object-cover border-2 border-accent/20 hover:border-accent/60 transition-colors"
                  alt="avatar"
                />
              </Link>
            </UserHoverCard>
          ) : (
            <Link href="/login" className="btn-ghost no-underline"><i className="fa-solid fa-user" /></Link>
          )}
        </div>
      </div>
    </header>
  );
}