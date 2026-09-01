"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import HomeSidebar from "@/components/HomeSidebar";
import { createClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/AuthProvider";
import { SkeletonSearchResults } from "@/components/Skeleton";
import type { Post } from "@/lib/types";
import DefaultAvatar from "@/components/DefaultAvatar";
import { slimContent } from "@/lib/feed";
import { includeTestDataForProfile, withTestDataVisibility } from "@/lib/test-data-visibility";

type SearchFilter = "tags" | "users" | "works" | "posts";
type WorkTypeFilter = "all" | "single" | "image" | "serial";
type SeriesStatusFilter = "all" | "ongoing" | "completed";
type SortFilter = "latest" | "hot" | "bookmarks";

interface TagResult {
  name: string;
  post_count: number;
}

interface UserResult {
  id: string;
  nickname: string;
  avatar_url: string | null;
}

type SearchPost = Post & {
  series_status?: SeriesStatusFilter;
};

const IMAGE_POST_TYPES = ["illustration", "comic", "cosplay"] as const;
const SINGLE_POST_TYPES = ["illustration", "comic", "cosplay", "serial"] as const;
const SEARCH_RESULT_LIMIT = 20;
const SEARCH_SORT_CANDIDATE_LIMIT = 100;

function parseSearchFilter(value: string | null): SearchFilter {
  return value === "users" || value === "works" || value === "posts" ? value : "tags";
}

function parseWorkType(value: string | null): WorkTypeFilter {
  return value === "single" || value === "image" || value === "serial" ? value : "all";
}

function parseSeriesStatus(value: string | null): SeriesStatusFilter {
  return value === "ongoing" || value === "completed" ? value : "all";
}

function parseSort(value: string | null): SortFilter {
  return value === "hot" || value === "bookmarks" ? value : "latest";
}

const SORT_OPTIONS: Array<{ value: SortFilter; label: string }> = [
  { value: "latest", label: "按时间" },
  { value: "hot", label: "按热度" },
  { value: "bookmarks", label: "按收藏量" },
];

function getPostVisual(postType?: string) {
  switch (postType) {
    case "serial": return { label: "长篇连载", icon: "fa-book-open", kind: "series" };
    case "illustration":
    case "comic":
    case "cosplay": return { label: "图片", icon: "fa-image", kind: "image" };
    default: return { label: "单篇", icon: "fa-file-lines", kind: "single" };
  }
}

function getPostHeat(post: SearchPost): number {
  return (post.like_count || 0) + (post.comment_count || 0) + (post.bookmark_count || 0);
}

function sortPosts(posts: SearchPost[], sortBy: SortFilter): SearchPost[] {
  if (sortBy === "latest") {
    return [...posts].sort((a, b) => {
      const aTime = new Date(a.updated_at || a.created_at || 0).getTime();
      const bTime = new Date(b.updated_at || b.created_at || 0).getTime();
      return bTime - aTime;
    });
  }

  return [...posts].sort((a, b) => {
    const aValue = sortBy === "hot" ? getPostHeat(a) : (a.bookmark_count || 0);
    const bValue = sortBy === "hot" ? getPostHeat(b) : (b.bookmark_count || 0);
    if (bValue !== aValue) return bValue - aValue;
    const aTime = new Date(a.updated_at || a.created_at || 0).getTime();
    const bTime = new Date(b.updated_at || b.created_at || 0).getTime();
    return bTime - aTime;
  });
}

function SearchContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";
  const initialType = parseSearchFilter(searchParams.get("type"));
  const supabase = createClient();
  const { user, profile, loading: authLoading } = useAuth();

  const [inputValue, setInputValue] = useState(initialQuery);
  const [activeFilter, setActiveFilter] = useState<SearchFilter>(initialType);
  const [workType, setWorkType] = useState<WorkTypeFilter>(parseWorkType(searchParams.get("workType")));
  const [seriesStatus, setSeriesStatus] = useState<SeriesStatusFilter>(parseSeriesStatus(searchParams.get("seriesStatus")));
  const [sortBy, setSortBy] = useState<SortFilter>(parseSort(searchParams.get("sort")));
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  // 作品（标题匹配）和正文（内容匹配）分开存储，不再混入标签关联作品
  const [titlePosts, setTitlePosts] = useState<SearchPost[]>([]);
  const [contentPosts, setContentPosts] = useState<Post[]>([]);
  const [tags, setTags] = useState<TagResult[]>([]);
  const [users, setUsers] = useState<UserResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(!!initialQuery);

  // 防抖 + 请求序列号，避免竞态
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);

  const filters: { key: SearchFilter; label: string }[] = [
    { key: "tags", label: "标签" },
    { key: "users", label: "用户" },
    { key: "works", label: "作品" },
    { key: "posts", label: "正文" },
  ];

  const syncSearchUrl = (overrides: { query?: string; type?: SearchFilter } = {}) => {
    const url = new URL(window.location.href);
    const query = overrides.query ?? inputValue.trim();
    const type = overrides.type ?? activeFilter;
    const nextValues: Array<[string, string]> = [
      ["q", query],
      ["type", type],
      ["workType", workType],
      ["seriesStatus", seriesStatus],
      ["sort", sortBy],
    ];

    ["q", "type", "workType", "seriesStatus", "sort", "minWords", "maxWords"].forEach((key) => url.searchParams.delete(key));
    nextValues.forEach(([key, value]) => {
      if (!value || (key === "type" && value === "tags") || (key === "workType" && value === "all") || (key === "seriesStatus" && value === "all") || (key === "sort" && value === "latest")) return;
      url.searchParams.set(key, value);
    });
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  };

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
    const includeTestData = includeTestDataForProfile(profile);
    const applyWorkRefine = activeFilter === "works";
    const postSelect = "id, title, content, word_count, post_type, created_at, updated_at, cover_url, user_id, series_name, chapter_number, author:profiles!posts_user_id_fkey(nickname, avatar_url)";

    let allowedSeriesNames: string[] | null = null;
    if (applyWorkRefine && seriesStatus !== "all") {
      const seriesQuery = withTestDataVisibility(
        supabase.from("series").select("name").eq("status", seriesStatus),
        includeTestData,
      );
      const { data: seriesRows } = await seriesQuery;
      allowedSeriesNames = ((seriesRows || []) as Array<{ name?: string | null }>)
        .map((row) => row.name || "")
        .filter(Boolean);
    }

    if (rid !== requestIdRef.current) return;

    const makePostQuery = (matchColumn: "title" | "content", refineWorks: boolean) => {
      let queryBuilder = withTestDataVisibility(
        supabase
          .from("posts")
          .select(postSelect)
          .ilike(matchColumn, `%${q}%`)
          .eq("status", "published"),
        includeTestData,
      );

      if (refineWorks) {
        if (workType === "serial") queryBuilder = queryBuilder.eq("post_type", "serial");
        if (workType === "image") queryBuilder = queryBuilder.in("post_type", [...IMAGE_POST_TYPES]);
        if (workType === "single") queryBuilder = queryBuilder.not("post_type", "in", `(${SINGLE_POST_TYPES.join(",")})`);
        if (seriesStatus !== "all") {
          if (!allowedSeriesNames || allowedSeriesNames.length === 0) return null;
          queryBuilder = queryBuilder.in("series_name", allowedSeriesNames);
        }
      }

      return queryBuilder
        .order("updated_at", { ascending: false })
        .limit(refineWorks && sortBy !== "latest" ? SEARCH_SORT_CANDIDATE_LIMIT : SEARCH_RESULT_LIMIT);
    };

    // 第一波并行：屏蔽关系 + 标签 + 用户 + 作品标题 + 正文。
    // 作品筛选只作用于“作品”结果，正文搜索保留原有语义。
    const titleQuery = makePostQuery("title", applyWorkRefine);
    const [blockedRes, tagRes, userRes, titleRes, contentRes] = await Promise.all([
      supabase.from("blocked_users").select("blocked_user_id").eq("user_id", user.id),
      supabase.from("tags").select("id, name").ilike("name", `%${q}%`).limit(20),
      withTestDataVisibility(
        supabase.from("profiles").select("id, nickname, avatar_url").ilike("nickname", `%${q}%`).limit(20),
        includeTestData,
      ),
      titleQuery || Promise.resolve({ data: [] as unknown[] }),
      makePostQuery("content", false),
    ]);

    if (rid !== requestIdRef.current) return;

    const blockedIds = new Set(((blockedRes.data || []) as Array<{ blocked_user_id?: string | null }>).map((row) => row.blocked_user_id as string));
    const tagRows = (tagRes.data || []) as Array<{ id: string; name: string }>;
    const visibleUsers = ((userRes.data || []) as UserResult[]).filter((item) => !blockedIds.has(item.id));
    const rawTitlePosts = ((titleRes.data || []) as unknown as SearchPost[])
      .filter((post) => !blockedIds.has(post.user_id || ""));
    const visibleContentPosts = ((contentRes?.data || []) as unknown as Post[])
      .filter((post) => !blockedIds.has(post.user_id || ""))
      .map((post) => ({ ...post, content: slimContent(post.content || "") }));

    const serialNames = [...new Set(rawTitlePosts.filter((post) => post.post_type === "serial" && post.series_name).map((post) => post.series_name as string))];
    const seriesQuery = serialNames.length > 0
      ? withTestDataVisibility(supabase.from("series").select("name, status").in("name", serialNames), includeTestData)
      : null;
    const statsQuery = applyWorkRefine && sortBy !== "latest" && rawTitlePosts.length > 0
      ? supabase.from("post_stats").select("id, like_count, comment_count, bookmark_count").in("id", rawTitlePosts.map((post) => post.id))
      : null;
    const [{ data: seriesRows }, { data: statsRows }] = await Promise.all([
      seriesQuery || Promise.resolve({ data: [] as unknown[] }),
      statsQuery || Promise.resolve({ data: [] as unknown[] }),
    ]);

    const seriesStatusMap = new Map(((seriesRows || []) as Array<{ name?: string | null; status?: SeriesStatusFilter }>).map((row) => [row.name || "", row.status || "ongoing"]));
    const statsMap = new Map(((statsRows || []) as Array<{ id?: string; like_count?: number; comment_count?: number; bookmark_count?: number }>).map((row) => [row.id || "", row]));
    const visibleTitlePosts = rawTitlePosts
      .map((post) => ({
        ...post,
        content: slimContent(post.content || ""),
        series_status: post.post_type === "serial" ? (seriesStatusMap.get(post.series_name || "") || "ongoing") : undefined,
        like_count: statsMap.get(post.id)?.like_count || 0,
        comment_count: statsMap.get(post.id)?.comment_count || 0,
        bookmark_count: statsMap.get(post.id)?.bookmark_count || 0,
      }));

    if (rid !== requestIdRef.current) return;

    setTags([]);
    setUsers(visibleUsers);
    setTitlePosts(sortPosts(visibleTitlePosts, applyWorkRefine ? sortBy : "latest").slice(0, SEARCH_RESULT_LIMIT));
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
    const candidatePostIds = [...new Set((ptCounts || []).map((row: Record<string, unknown>) => row.post_id as string).filter(Boolean))];
    const { data: publicPosts } = candidatePostIds.length > 0
      ? await withTestDataVisibility(supabase.from("posts").select("id").in("id", candidatePostIds), includeTestData)
      : { data: [] as unknown[] };
    const publicPostIds = new Set((publicPosts || []).map((row: Record<string, unknown>) => row.id as string));
    if (ptCounts) {
      for (const row of ptCounts as Array<{ tag_id: string; post_id: string }>) {
        if (!publicPostIds.has(row.post_id)) continue;
        countMap.set(row.tag_id, (countMap.get(row.tag_id) || 0) + 1);
      }
    }

    setTags(tagRows
      .filter((tag) => (countMap.get(tag.id) || 0) > 0)
      .map((tag) => ({ name: tag.name, post_count: countMap.get(tag.id) || 0 }))
      .sort((a, b) => b.post_count - a.post_count));
  }, [activeFilter, profile, seriesStatus, sortBy, supabase, user, workType]);

  useEffect(() => {
    if (!sortMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(event.target as Node)) {
        setSortMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSortMenuOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [sortMenuOpen]);

  // 输入和筛选条件共用防抖自动搜索（300ms）
  useEffect(() => {
    if (!user) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const q = inputValue.trim();
    if (!q) {
      syncSearchUrl({ query: "" });
      return;
    }

    debounceRef.current = setTimeout(() => {
      const rid = ++requestIdRef.current;
      setLoading(true);
      syncSearchUrl({ query: q });
      void doSearch(q, rid);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [activeFilter, doSearch, inputValue, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearResults = () => {
    requestIdRef.current += 1;
    setTitlePosts([]);
    setContentPosts([]);
    setTags([]);
    setUsers([]);
    setLoading(false);
    setHasSearched(false);
  };

  const handleInputChange = (value: string) => {
    setInputValue(value);
    if (!value.trim()) clearResults();
  };

  const handleClear = () => {
    setInputValue("");
    clearResults();
    syncSearchUrl({ query: "" });
  };

  const handleFilterClick = (filter: SearchFilter) => {
    setActiveFilter(filter);
    const q = inputValue.trim();
    syncSearchUrl({ query: q, type: filter });
  };

  const handleWorkTypeChange = (nextType: WorkTypeFilter) => {
    setWorkType(nextType);
    if (nextType === "single" || nextType === "image") setSeriesStatus("all");
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
                <button type="button" className="search-clear-btn" aria-label="清除搜索">
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>
            </div>
          </div>
          <div className="filter-tabs" role="tablist">
            {filters.map((f) => (
              <button
                type="button"
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
                type="button"
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
              type="button"
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

        {activeFilter === "works" && (
          <section className="search-refine-panel" aria-label="作品筛选条件">
            <div className="search-refine-grid">
              <fieldset className="search-refine-group">
                <legend>作品类型</legend>
                <div className="search-refine-options" role="radiogroup" aria-label="作品类型">
                  {(["all", "single", "image", "serial"] as WorkTypeFilter[]).map((type) => {
                    const labels: Record<WorkTypeFilter, string> = { all: "全部", single: "单篇", image: "图片", serial: "连载" };
                    return (
                      <button
                        type="button"
                        key={type}
                        className={`search-refine-chip${workType === type ? " active" : ""}`}
                        role="radio"
                        aria-checked={workType === type}
                        onClick={() => handleWorkTypeChange(type)}
                      >
                        {labels[type]}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <fieldset className="search-refine-group" disabled={workType === "single" || workType === "image"}>
                <legend>连载状态 <span className="search-refine-legend-note">仅连载</span></legend>
                <div className="search-refine-options" role="radiogroup" aria-label="连载状态">
                  {(["all", "ongoing", "completed"] as SeriesStatusFilter[]).map((status) => {
                    const labels: Record<SeriesStatusFilter, string> = { all: "全部", ongoing: "连载中", completed: "已完结" };
                    return (
                      <button
                        type="button"
                        key={status}
                        className={`search-refine-chip${seriesStatus === status ? " active" : ""}`}
                        role="radio"
                        aria-checked={seriesStatus === status}
                        onClick={() => setSeriesStatus(status)}
                      >
                        {labels[status]}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <div className="search-refine-control">
                <span className="search-refine-label">排序方式</span>
                <div className={`search-refine-sort${sortMenuOpen ? " open" : ""}`} ref={sortMenuRef}>
                  <button
                    type="button"
                    className="search-refine-sort-trigger"
                    aria-haspopup="listbox"
                    aria-expanded={sortMenuOpen}
                    aria-controls="search-sort-menu"
                    onClick={() => setSortMenuOpen((open) => !open)}
                  >
                    <span>{SORT_OPTIONS.find((option) => option.value === sortBy)?.label}</span>
                    <i className="fa-solid fa-chevron-down" aria-hidden="true"></i>
                  </button>
                  {sortMenuOpen && (
                    <div id="search-sort-menu" className="search-refine-sort-menu" role="listbox" aria-label="排序方式">
                      {SORT_OPTIONS.map((option) => (
                        <button
                          type="button"
                          key={option.value}
                          className="search-refine-sort-option"
                          role="option"
                          aria-selected={sortBy === option.value}
                          onClick={() => {
                            setSortBy(option.value);
                            setSortMenuOpen(false);
                          }}
                        >
                          <span>{option.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {loading && <SkeletonSearchResults />}

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

        {!loading && hasSearched && !currentHasResults && (
          <div className="no-results visible">
            <i className="fa-solid fa-magnifying-glass"></i>
            <p>{activeFilter === "works" && (workType !== "all" || seriesStatus !== "all" || sortBy !== "latest") ? "没有符合当前筛选条件的作品" : "没有找到相关结果"}</p>
          </div>
        )}

        {!loading && hasSearched && (
          <div className="results-area">
            {activeFilter === "tags" && hasTagResults && (
              <div className="result-section" data-section="tags">
                <div className="tags-grid">
                  {tags.map((tag) => (
                    <Link key={tag.name} href={`/tag/${encodeURIComponent(tag.name)}`} className="tag-card">
                      <span className="tag-icon"><i className="fa-solid fa-tag"></i></span>
                      <span className="tag-name">{tag.name}</span>
                      <span className="tag-count">{tag.post_count} 篇作品</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {activeFilter === "users" && hasUserResults && (
              <div className="result-section" data-section="users">
                <div className="user-cards-grid">
                  {users.map((u) => (
                    <div key={u.id} className="user-card">
                      <div className="user-avatar">
                        {u.avatar_url ? (
                          <img src={u.avatar_url} alt={u.nickname || ""} style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover", position: "absolute", inset: 0 }} />
                        ) : (
                          <DefaultAvatar name={u.nickname || "?"} />
                        )}
                      </div>
                      <div className="user-info"><div className="user-name">{u.nickname}</div></div>
                      <div className="user-actions"><Link href={`/user/${u.id}`} className="btn-follow">查看主页</Link></div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeFilter === "works" && hasWorkResults && (
              <div className="result-section" data-section="works">
                <div className="work-list">
                  {titlePosts.map((post) => {
                    const raw = post as unknown as Record<string, unknown>;
                    const author = raw.author as { nickname: string } | null;
                    const visual = getPostVisual(post.post_type);
                    const statLabel = sortBy === "hot" ? `热度 ${getPostHeat(post)}` : sortBy === "bookmarks" ? `收藏 ${post.bookmark_count || 0}` : "";
                    return (
                      <Link key={post.id} href={`/read/${post.id}`} className="work-item">
                        <div className={`work-item-icon ${visual.kind}`}><i className={`fa-solid ${visual.icon}`}></i></div>
                        <div className="work-info">
                          <div className="work-title">{post.title}</div>
                          <div className="work-meta">
                            <span className="work-type-badge">{visual.label}</span>
                            {post.post_type === "serial" && <span className={`work-status-badge${post.series_status === "completed" ? " completed" : ""}`}>{post.series_status === "completed" ? "已完结" : "连载中"}</span>}
                            <span className="meta-dot"></span>
                            <span>{post.word_count?.toLocaleString() || 0} 字</span>
                            <span className="meta-dot"></span>
                            <span>{author?.nickname || "匿名"}</span>
                            {statLabel && <span className="work-sort-stat"><i className={`fa-solid ${sortBy === "hot" ? "fa-fire" : "fa-bookmark"}`}></i>{statLabel}</span>}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {activeFilter === "posts" && hasPostResults && (
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
                      <Link key={post.id} href={`/read/${post.id}`} className="post-item">
                        <div className="post-item-icon"><i className="fa-solid fa-file-lines"></i></div>
                        <div className="post-item-content">
                          <div className="post-snippet">{plainText}</div>
                          <div className="post-source"><i className="fa-solid fa-book"></i><span>{post.title}</span><span>— {author?.nickname || "匿名"}</span></div>
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
          <Suspense fallback={<div className="flex items-center justify-center py-20"><p className="text-muted">加载中...</p></div>}>
            <SearchContent />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
