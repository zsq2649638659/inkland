"use client";

import { useEffect, useState, Suspense, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import HomeSidebar from "@/components/HomeSidebar";
import { createClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/AuthProvider";
import { SkeletonSearchResults } from "@/components/Skeleton";
import type { Post } from "@/lib/types";
import DefaultAvatar from "@/components/DefaultAvatar";
import { slimContent } from "@/lib/feed";

type SearchFilter = "tags" | "users" | "works" | "posts";

interface TagResult {
  name: string;
  post_count: number;
}

interface UserResult {
  id: string;
  nickname: string;
  avatar_url: string | null;
}

function SearchContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";
  const initialType = (searchParams.get("type") || "tags") as SearchFilter;
  const supabase = createClient();
  const { user, loading: authLoading } = useAuth();

  const [inputValue, setInputValue] = useState(initialQuery);
  const [activeFilter, setActiveFilter] = useState<SearchFilter>(initialType);
  // 作品（标题匹配）和正文（内容匹配）分开存储，不再混入标签关联作品
  const [titlePosts, setTitlePosts] = useState<Post[]>([]);
  const [contentPosts, setContentPosts] = useState<Post[]>([]);
  const [tags, setTags] = useState<TagResult[]>([]);
  const [users, setUsers] = useState<UserResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(!!initialQuery);

  // 防抖 + 请求序列号，避免竞态
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  const filters: { key: SearchFilter; label: string }[] = [
    { key: "tags", label: "标签" },
    { key: "users", label: "用户" },
    { key: "works", label: "作品" },
    { key: "posts", label: "正文" },
  ];

  const doSearch = useCallback(async (query: string, rid: number) => {
    if (!query.trim() || !user) {
      if (rid !== requestIdRef.current) return;
      setTitlePosts([]);
      setContentPosts([]);
      setTags([]);
      setUsers([]);
      setLoading(false);
      setHasSearched(false);
      return;
    }

    setLoading(true);
    setHasSearched(true);

    const q = query.trim();

    const postSelect = "id, title, content, word_count, post_type, created_at, cover_url, user_id, series_name, chapter_number, author:profiles!posts_user_id_fkey(nickname, avatar_url)";

    // 第一波并行：屏蔽关系 + 标签 + 用户 + 作品标题 + 正文。
    // 屏蔽关系不应再单独占用一轮跨区往返。
    const [blockedRes, tagRes, userRes, titleRes, contentRes] = await Promise.all([
      supabase.from("blocked_users").select("blocked_user_id").eq("user_id", user.id),
      supabase.from("tags").select("id, name").ilike("name", `%${q}%`).limit(20),
      supabase.from("profiles").select("id, nickname, avatar_url").ilike("nickname", `%${q}%`).limit(20),
      // 作品：只搜标题
      supabase.from("posts").select(postSelect).ilike("title", `%${q}%`).eq("status", "published").order("created_at", { ascending: false }).limit(20),
      // 正文：只搜内容
      supabase.from("posts").select(postSelect).ilike("content", `%${q}%`).eq("status", "published").order("created_at", { ascending: false }).limit(20),
    ]);

    if (rid !== requestIdRef.current) return;

    const blockedIds = new Set(((blockedRes.data || []) as Array<{ blocked_user_id?: string | null }>).map((row) => row.blocked_user_id as string));

    // 先展示主结果；标签篇数在后台补齐，不再让一条统计查询阻塞整页。
    const tagRows = (tagRes.data || []) as Array<{ id: string; name: string }>;
    const visibleUsers = ((userRes.data || []) as UserResult[]).filter((item) => !blockedIds.has(item.id));
    const visibleTitlePosts = ((titleRes.data || []) as unknown as Post[])
      .filter((post) => !blockedIds.has(post.user_id || ""))
      .map((post) => ({ ...post, content: slimContent(post.content || "") }));
    const visibleContentPosts = ((contentRes.data || []) as unknown as Post[])
      .filter((post) => !blockedIds.has(post.user_id || ""))
      .map((post) => ({ ...post, content: slimContent(post.content || "") }));
    const initialTags = tagRows.map((tag) => ({ name: tag.name, post_count: 0 }));
    setTags(initialTags);
    setUsers(visibleUsers);
    setTitlePosts(visibleTitlePosts);
    setContentPosts(visibleContentPosts);
    setLoading(false);

    if (tagRows.length === 0) return;

    const tagIds = tagRows.map((t) => t.id);
    const { data: ptCounts } = await supabase
        .from("post_tags")
        .select("tag_id, post_id")
        .in("tag_id", tagIds);

    if (rid !== requestIdRef.current) return;

    const countMap = new Map<string, number>();
    if (ptCounts) {
      for (const row of ptCounts as Array<{ tag_id: string; post_id: string }>) {
        countMap.set(row.tag_id, (countMap.get(row.tag_id) || 0) + 1);
      }
    }

    setTags(tagRows
      .map((tag) => ({ name: tag.name, post_count: countMap.get(tag.id) || 0 }))
      .sort((a, b) => b.post_count - a.post_count));
  }, [supabase, user]);

  // URL 参数同步（初始加载）
  useEffect(() => {
    setInputValue(initialQuery);
  }, [initialQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  // 输入防抖自动搜索（300ms）
  useEffect(() => {
    if (!user) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const q = inputValue.trim();
    if (!q) {
      setTitlePosts([]);
      setContentPosts([]);
      setTags([]);
      setUsers([]);
      setLoading(false);
      setHasSearched(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(() => {
      const rid = ++requestIdRef.current;
      doSearch(q, rid);
      // 同步 URL（不触发 React 重渲染）
      window.history.replaceState(null, "", `/search?q=${encodeURIComponent(q)}&type=${activeFilter}`);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [inputValue, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleInputChange = (value: string) => {
    setInputValue(value);
  };

  const handleClear = () => {
    setInputValue("");
    setTitlePosts([]);
    setContentPosts([]);
    setTags([]);
    setUsers([]);
    setHasSearched(false);
    window.history.replaceState(null, "", "/search");
  };

  const handleFilterClick = (filter: SearchFilter) => {
    setActiveFilter(filter);
    const q = inputValue.trim();
    if (q) {
      window.history.replaceState(null, "", `/search?q=${encodeURIComponent(q)}&type=${filter}`);
    }
  };

  const getPostVisual = (postType?: string) => {
    switch (postType) {
      case "serial": return { label: "长篇连载", icon: "fa-book-open", kind: "series" };
      case "illustration":
      case "comic":
      case "cosplay": return { label: "图片", icon: "fa-image", kind: "image" };
      default: return { label: "单篇", icon: "fa-file-lines", kind: "single" };
    }
  };

  if (authLoading) {
    return <SkeletonSearchResults variant={activeFilter} />;
  }

  // 未登录状态
  if (!user) {
    return (
      <div id="page-search">
        <div className="search-palette" role="search" aria-label="搜索模块">
          <div className="search-header">
            <div className="search-input-wrapper">
              <i className="fa-solid fa-magnifying-glass search-icon"></i>
              <input
                type="text"
                className="search-page-input"
                aria-label="搜索页面内容"
                placeholder="搜索作品、标签、用户..."
                value={inputValue}
                onChange={(e) => handleInputChange(e.target.value)}
                disabled
                autoComplete="off"
              />
              <div className="search-actions">
                <button className="search-clear-btn" aria-label="清除搜索">
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>
            </div>
          </div>
          <div className="filter-tabs" role="tablist">
            {filters.map((f) => (
              <button
                key={f.key}
                className={`filter-tab${activeFilter === f.key ? " active" : ""}`}
                role="tab"
                aria-selected={activeFilter === f.key}
                onClick={() => handleFilterClick(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="results-area">
            <div className="feed-empty-state">
              <div className="feed-empty-illustration">
                <div className="feed-empty-tag-ring">
                  <div className="feed-empty-ring-outer"></div>
                  <div className="feed-empty-ring-inner">
                    <i className="fa-solid fa-magnifying-glass"></i>
                  </div>
                </div>
              </div>
              <h2 className="feed-empty-title">登录后搜索内容</h2>
              <p className="feed-empty-desc">登录后即可搜索作品、标签和用户</p>
              <Link href="/login" className="feed-empty-action">登录</Link>
              <Link href="/register" className="feed-empty-register">还没有账号？立即注册 →</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 结果计数
  const tagCount = tags.length;
  const userCount = users.length;
  const workCount = titlePosts.length;
  const postCount = contentPosts.length;

  const hasTagResults = tagCount > 0;
  const hasUserResults = userCount > 0;
  const hasWorkResults = workCount > 0;
  const hasPostResults = postCount > 0;

  const currentHasResults = (() => {
    switch (activeFilter) {
      case "tags": return hasTagResults;
      case "users": return hasUserResults;
      case "works": return hasWorkResults;
      case "posts": return hasPostResults;
      default: return false;
    }
  })();

  return (
    <div id="page-search">
      <div className="search-palette" role="search" aria-label="搜索模块">
        <div className="search-header">
          <div className="search-input-wrapper">
            <i className="fa-solid fa-magnifying-glass search-icon"></i>
            <input
              type="text"
              className="search-page-input"
              aria-label="搜索页面内容"
              placeholder="搜索作品、标签、用户..."
              value={inputValue}
              onChange={(e) => handleInputChange(e.target.value)}
              autoComplete="off"
            />
            <div className="search-actions">
              <button
                className={`search-clear-btn${inputValue ? " visible" : ""}`}
                onClick={handleClear}
                aria-label="清除搜索"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
          </div>
        </div>

        <div className="filter-tabs" role="tablist">
          {filters.map((f) => (
            <button
              key={f.key}
              className={`filter-tab${activeFilter === f.key ? " active" : ""}`}
              role="tab"
              aria-selected={activeFilter === f.key}
              onClick={() => handleFilterClick(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <SkeletonSearchResults />
        )}

        {/* Initial empty state */}
        {!loading && !hasSearched && (
          <div className="results-area">
            <div className="feed-empty-state">
              <div className="feed-empty-illustration">
                <div className="feed-empty-tag-ring">
                  <div className="feed-empty-ring-outer"></div>
                  <div className="feed-empty-ring-inner">
                    <i className="fa-solid fa-magnifying-glass"></i>
                  </div>
                </div>
              </div>
              <h2 className="feed-empty-title">还没有搜索结果</h2>
              <p className="feed-empty-desc">输入关键词搜索作品、标签和用户</p>
            </div>
          </div>
        )}

        {/* No results */}
        {!loading && hasSearched && !currentHasResults && (
          <div className="no-results visible">
            <i className="fa-solid fa-magnifying-glass"></i>
            <p>没有找到相关结果</p>
          </div>
        )}

        {/* Results */}
        {!loading && hasSearched && (
          <div className="results-area">
            {/* Tags Section */}
            {(activeFilter === "tags") && hasTagResults && (
              <div className="result-section" data-section="tags">
                <div className="tags-grid">
                  {tags.map((tag) => (
                    <Link
                      key={tag.name}
                      href={`/tag/${encodeURIComponent(tag.name)}`}
                      className="tag-card"
                    >
                      <span className="tag-icon"><i className="fa-solid fa-tag"></i></span>
                      <span className="tag-name">{tag.name}</span>
                      <span className="tag-count">{tag.post_count} 篇作品</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Users Section */}
            {(activeFilter === "users") && hasUserResults && (
              <div className="result-section" data-section="users">
                <div className="user-cards-grid">
                  {users.map((u) => (
                    <div key={u.id} className="user-card">
                      <div className="user-avatar">
                        {u.avatar_url ? (
                          <img
                            src={u.avatar_url}
                            alt={u.nickname || ""}
                            style={{
                              width: "100%",
                              height: "100%",
                              borderRadius: "50%",
                              objectFit: "cover",
                              position: "absolute",
                              inset: 0,
                            }}
                          />
                        ) : (
                          <DefaultAvatar name={u.nickname || "?"} />
                        )}
                      </div>
                      <div className="user-info">
                        <div className="user-name">{u.nickname}</div>
                      </div>
                      <div className="user-actions">
                        <Link
                          href={`/user/${u.id}`}
                          className="btn-follow"
                        >
                          查看主页
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Works Section */}
            {(activeFilter === "works") && hasWorkResults && (
              <div className="result-section" data-section="works">
                <div className="work-list">
                  {titlePosts.map((post) => {
                    const raw = post as unknown as Record<string, unknown>;
                    const author = raw.author as { nickname: string } | null;
                    const visual = getPostVisual(post.post_type);
                    return (
                      <Link
                        key={post.id}
                        href={`/read/${post.id}`}
                        className="work-item"
                      >
                        <div className={`work-item-icon ${visual.kind}`}>
                          <i className={`fa-solid ${visual.icon}`}></i>
                        </div>
                        <div className="work-info">
                          <div className="work-title">{post.title}</div>
                          <div className="work-meta">
                            <span className="work-type-badge">{visual.label}</span>
                            <span className="meta-dot"></span>
                            <span>{post.word_count?.toLocaleString() || 0} 字</span>
                            <span className="meta-dot"></span>
                            <span>{author?.nickname || "匿名"}</span>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Posts Section */}
            {(activeFilter === "posts") && hasPostResults && (
              <div className="result-section" data-section="posts">
                <div className="post-list">
                  {contentPosts.map((post) => {
                    const raw = post as unknown as Record<string, unknown>;
                    const author = raw.author as { nickname: string } | null;
                    const plainText = (post.content || "")
                      .replace(/!\[.*?\]\(.*?\)/g, "")
                      .replace(/\[([^\]]*)\]\(.*?\)/g, "$1")
                      .replace(/[*_~`#>|-]/g, "")
                      .replace(/\n+/g, " ")
                      .replace(/\s+/g, " ")
                      .trim();
                    return (
                      <Link
                        key={post.id}
                        href={`/read/${post.id}`}
                        className="post-item"
                      >
                        <div className="post-item-icon">
                          <i className="fa-solid fa-file-lines"></i>
                        </div>
                        <div className="post-item-content">
                          <div className="post-snippet">{plainText}</div>
                          <div className="post-source">
                            <i className="fa-solid fa-book"></i>
                            <span>{post.title}</span>
                            <span>— {author?.nickname || "匿名"}</span>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <div className="min-h-screen bg-paper pb-20 lg:pb-0">
      <div className="main-container">
        <HomeSidebar />
        <div className="content-area">
          <Suspense fallback={
            <div className="flex items-center justify-center py-20">
              <p className="text-muted">加载中...</p>
            </div>
          }>
            <SearchContent />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
