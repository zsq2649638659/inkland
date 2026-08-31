"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/AuthProvider";
import { useMobileDrawer } from "@/components/MobileDrawerContext";
import DefaultAvatar from "@/components/DefaultAvatar";
import { getOrCreateClientCache, invalidateClientCache } from "@/lib/client-cache";

interface Suggestion {
  name: string;
  type: "tag" | "user" | "post" | "content";
  subtitle?: string;
  id?: string;
}

interface SuggestionResult {
  tags: Suggestion[];
  users: Suggestion[];
  posts: Suggestion[];
  content: Suggestion[];
}

export default function Navbar() {
  const { user } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { open, openDrawer } = useMobileDrawer();
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [scrolled, setScrolled] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setNotificationCount(0);
      return;
    }
    const fetchNotificationCount = (force = false) => {
      if (force) invalidateClientCache(`notification-count:${user.id}`);
      void getOrCreateClientCache(`notification-count:${user.id}`, async () => {
        const { count } = await supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("read", false);
        return count || 0;
      }, { ttlMs: 30_000, persist: true }).then((count) => setNotificationCount(count));
    };
    fetchNotificationCount();
    const channel = supabase
      .channel(`navbar-notifications:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => fetchNotificationCount(true))
      .subscribe();
    const timer = window.setInterval(fetchNotificationCount, 30_000);
    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [supabase, user]);

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
    const handleScroll = () => {
      setScrolled(window.scrollY > 0);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const [searchQuery, setSearchQuery] = useState("");
  const [tagSuggestions, setTagSuggestions] = useState<Suggestion[]>([]);
  const [userSuggestions, setUserSuggestions] = useState<Suggestion[]>([]);
  const [postSuggestions, setPostSuggestions] = useState<Suggestion[]>([]);
  const [contentSuggestions, setContentSuggestions] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeFilterTab, setActiveFilterTab] = useState<"tags" | "users" | "works" | "content">("tags");

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setTagSuggestions([]);
        setUserSuggestions([]);
        setPostSuggestions([]);
        setContentSuggestions([]);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 1) {
      setTagSuggestions([]); setUserSuggestions([]); setPostSuggestions([]); setContentSuggestions([]);
      return;
    }
    setSearching(true);
    const result = await getOrCreateClientCache<SuggestionResult>(
      `search-suggestions:${user?.id || "anon"}:${q.toLowerCase()}`,
      async () => {
        const [blockedRes, tagsRes, usersRes, titleRes, contentRes] = await Promise.all([
          user ? supabase.from("blocked_users").select("blocked_user_id").eq("user_id", user.id) : Promise.resolve({ data: [] as unknown[] }),
          supabase.from("tags").select("name, post_count").ilike("name", `%${q}%`).order("post_count", { ascending: false }).limit(5),
          supabase.from("profiles").select("id, nickname, avatar_url").ilike("nickname", `%${q}%`).limit(5),
          supabase.from("posts").select("id, title, user_id").ilike("title", `%${q}%`).eq("status", "published").order("created_at", { ascending: false }).limit(5),
          supabase.from("posts").select("id, title, content, user_id").ilike("content", `%${q}%`).eq("status", "published").order("created_at", { ascending: false }).limit(5),
        ]);
        const blockedIds = new Set((blockedRes.data || []).map((row: Record<string, unknown>) => row.blocked_user_id as string));
        const users = (usersRes.data || []).filter((item: Record<string, unknown>) => !blockedIds.has(item.id as string));
        const posts = (titleRes.data || []).filter((item: Record<string, unknown>) => !blockedIds.has(item.user_id as string));
        const content = (contentRes.data || []).filter((item: Record<string, unknown>) => !blockedIds.has(item.user_id as string));
        return {
          tags: (tagsRes.data || []).map((t: Record<string, unknown>) => ({ name: t.name as string, type: "tag" as const, subtitle: `${t.post_count} 篇` })),
          users: users.map((item: Record<string, unknown>) => ({ name: (item.nickname as string) || "匿名用户", type: "user" as const, id: item.id as string, subtitle: (item.avatar_url as string) || "" })),
          posts: posts.map((item: Record<string, unknown>) => ({ name: (item.title as string) || "无标题", type: "post" as const, id: item.id as string })),
          content: content.map((item: Record<string, unknown>) => {
            const rawContent = (item.content as string) || "";
            const excerpt = rawContent.replace(/!\[.*?\]\(.*?\)/g, "").replace(/\[([^\]]*)\]\(.*?\)/g, "$1").replace(/[*_~`#>|-]/g, "").replace(/\n+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
            return { name: (item.title as string) || "无标题", type: "content" as const, id: item.id as string, subtitle: excerpt ? `...${excerpt}...` : "" };
          }),
        };
      },
      { ttlMs: 10_000, persist: true },
    );
    setTagSuggestions(result.tags);
    setUserSuggestions(result.users);
    setPostSuggestions(result.posts);
    setContentSuggestions(result.content);
    setSearching(false);
  }, [supabase, user]);

  const handleSearchInput = (val: string) => {
    setSearchQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 200);
  };

  const handleSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const selectSuggestion = (s: Suggestion) => {
    if (s.type === "tag") router.push(`/tag/${encodeURIComponent(s.name)}`);
    else if (s.type === "user") router.push(`/user/${s.id}`);
    else if (s.type === "post" || s.type === "content") router.push(`/read/${s.id}`);
  };

  const hasAnyResults = tagSuggestions.length > 0 || userSuggestions.length > 0 || postSuggestions.length > 0 || contentSuggestions.length > 0;

  return (
    <nav className={`navbar ${scrolled ? "scrolled" : ""}`} id="navbar">
      <div className="navbar-inner">
        {/* V2: navbar-left with wordmark logo */}
        <div className="navbar-left">
          <Link href="/" className="wordmark-logo" aria-label="inkland 首页" />
        </div>

        {/* V2: navbar-center with search input */}
        <div className="navbar-center" ref={searchRef}>
          <div style={{ position: "relative" }}>
            <input
              type="search"
              name="site-search"
              className="search-input"
              aria-label="全局搜索"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              data-bwignore="true"
              placeholder="搜索作品、标签、用户..."
              value={searchQuery}
              onChange={(e) => handleSearchInput(e.target.value)}
              onKeyDown={handleSearchKey}
              onFocus={() => { if (searchQuery) fetchSuggestions(searchQuery); }}
            />
            {hasAnyResults && (
              <div className="search-dropdown">
                {/* Filter Tabs */}
                <div className="search-dropdown-filters">
                  <button
                    className={`search-dropdown-tab${activeFilterTab === "tags" ? " active" : ""}`}
                    onMouseDown={(e) => { e.preventDefault(); setActiveFilterTab("tags"); }}
                  ><i className="fa-solid fa-tag" /> 标签</button>
                  <button
                    className={`search-dropdown-tab${activeFilterTab === "users" ? " active" : ""}`}
                    onMouseDown={(e) => { e.preventDefault(); setActiveFilterTab("users"); }}
                  ><i className="fa-solid fa-user" /> 用户</button>
                  <button
                    className={`search-dropdown-tab${activeFilterTab === "works" ? " active" : ""}`}
                    onMouseDown={(e) => { e.preventDefault(); setActiveFilterTab("works"); }}
                  ><i className="fa-solid fa-file-lines" /> 作品</button>
                  <button
                    className={`search-dropdown-tab${activeFilterTab === "content" ? " active" : ""}`}
                    onMouseDown={(e) => { e.preventDefault(); setActiveFilterTab("content"); }}
                  ><i className="fa-solid fa-align-left" /> 正文</button>
                </div>

                {/* Results */}
                <div className="search-dropdown-results">
                  {/* Tags */}
                  {activeFilterTab === "tags" && (tagSuggestions.length > 0 ? tagSuggestions.map((s) => (
                    <button key={s.name} className="search-dropdown-item" onMouseDown={(e) => { e.preventDefault(); selectSuggestion(s); }}>
                      <div className="search-dropdown-item-icon"><i className="fa-solid fa-tag" /></div>
                      <div className="search-dropdown-item-body">
                        <span className="search-dropdown-item-title">{s.name}</span>
                      </div>
                      <span className="search-dropdown-item-meta">{s.subtitle}</span>
                    </button>
                  )) : <div className="search-dropdown-empty"><i className="fa-solid fa-tag" />无匹配标签</div>)}

                  {/* Users */}
                  {activeFilterTab === "users" && (userSuggestions.length > 0 ? userSuggestions.map((s) => (
                    <button key={s.id} className="search-dropdown-item" onMouseDown={(e) => { e.preventDefault(); selectSuggestion(s); }}>
                      <div className="search-dropdown-item-icon avatar">
                        {s.subtitle ? (
                          <img src={s.subtitle} alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        ) : (
                          <DefaultAvatar name={s.name} />
                        )}
                      </div>
                      <div className="search-dropdown-item-body">
                        <span className="search-dropdown-item-title">{s.name}</span>
                      </div>
                    </button>
                  )) : <div className="search-dropdown-empty">无匹配用户</div>)}

                  {/* Works (title) */}
                  {activeFilterTab === "works" && (postSuggestions.length > 0 ? postSuggestions.map((s) => (
                    <button key={s.id} className="search-dropdown-item" onMouseDown={(e) => { e.preventDefault(); selectSuggestion(s); }}>
                      <div className="search-dropdown-item-icon work"><i className="fa-solid fa-file-lines" /></div>
                      <div className="search-dropdown-item-body">
                        <span className="search-dropdown-item-title">{s.name}</span>
                      </div>
                    </button>
                  )) : <div className="search-dropdown-empty"><i className="fa-solid fa-file-lines" />无匹配作品</div>)}

                  {/* Content */}
                  {activeFilterTab === "content" && (contentSuggestions.length > 0 ? contentSuggestions.map((s) => (
                    <button key={s.id} className="search-dropdown-item" onMouseDown={(e) => { e.preventDefault(); selectSuggestion(s); }}>
                      <div className="search-dropdown-item-icon content"><i className="fa-solid fa-align-left" /></div>
                      <div className="search-dropdown-item-body">
                        <span className="search-dropdown-item-title">{s.name}</span>
                        {s.subtitle && <span className="search-dropdown-item-subtitle">{s.subtitle}</span>}
                      </div>
                    </button>
                  )) : <div className="search-dropdown-empty"><i className="fa-solid fa-align-left" />无匹配正文</div>)}
                </div>

                {/* Footer */}
                <div className="search-dropdown-footer">
                  <Link
                    href={`/search?q=${encodeURIComponent(searchQuery)}${activeFilterTab === "tags" ? "&type=tags" : activeFilterTab === "users" ? "&type=users" : activeFilterTab === "works" ? "&type=works" : "&type=posts"}`}
                    onMouseDown={(e) => e.preventDefault()}
                  >查看全部结果 <i className="fa-solid fa-arrow-right" /></Link>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* V2: navbar-right — only create button + mobile menu (avatar is in sidebar) */}
        <div className="navbar-right">
          <Link href={user ? "/create" : "/login"} className="btn-create no-underline">
            <i className="fa-solid fa-pen-to-square" /> 创作
          </Link>

          {/* V2: mobile menu button */}
          <button
            className={`btn-mobile-menu ${notificationCount > 0 ? "has-unread-notifications" : ""}`}
            id="btnMobileMenu"
            aria-label={notificationCount > 0 ? `打开菜单，${notificationCount} 条未读消息` : "打开菜单"}
            aria-expanded={open}
            aria-controls="mobile-drawer"
            onClick={openDrawer}
          >
            <i className="fa-solid fa-bars" />
          </button>
        </div>
      </div>
    </nav>
  );
}
