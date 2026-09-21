"use client";
import SiteIcon from "@/components/SiteIcon";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import HomeSidebar from "@/components/HomeSidebar";
import ProfileFilterSelect from "@/components/ProfileFilterSelect";
import { createClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/AuthProvider";
import { SkeletonSearchResults } from "@/components/Skeleton";
import type { Post } from "@/lib/types";
import DefaultAvatar from "@/components/DefaultAvatar";
import TagHistoryCard from "@/components/TagHistoryCard";
import { slimContent } from "@/lib/feed";
import { includeTestDataForProfile, withTestDataVisibility } from "@/lib/test-data-visibility";

type SearchFilter = "tags" | "users" | "works";
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
  return value === "users" || value === "works" ? value : "tags";
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
  { value: "latest", label: "最近更新" },
  { value: "hot", label: "热度最高" },
  { value: "bookmarks", label: "收藏最高" },
];
const WORK_TYPE_OPTIONS: Array<{ value: WorkTypeFilter; label: string }> = [
  { value: "all", label: "全部作品" },
  { value: "single", label: "单篇" },
  { value: "image", label: "图片" },
  { value: "serial", label: "长篇连载" },
];
const SERIES_STATUS_OPTIONS: Array<{ value: SeriesStatusFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "ongoing", label: "连载中" },
  { value: "completed", label: "已完结" },
];

function getPostHeat(post: SearchPost): number {
  return (post.like_count || 0) + (post.comment_count || 0) + (post.bookmark_count || 0);
}

function toSearchCardPost(post: SearchPost): Post {
  return {
    ...post,
    status: post.post_type === "serial" && post.series_status === "completed" ? "draft" : "published",
  };
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
  const searchParamsString = searchParams.toString();
  const initialQuery = searchParams.get("q") || "";
  const initialType = parseSearchFilter(searchParams.get("type"));
  const initialWorkType = parseWorkType(searchParams.get("workType"));
  const initialSeriesStatus = parseSeriesStatus(searchParams.get("seriesStatus"));
  const supabase = createClient();
  const { user, profile, loading: authLoading } = useAuth();

  const [inputValue, setInputValue] = useState(initialQuery);
  const [activeFilter, setActiveFilter] = useState<SearchFilter>(initialType);
  const [workType, setWorkType] = useState<WorkTypeFilter>(initialWorkType);
  const [seriesStatus, setSeriesStatus] = useState<SeriesStatusFilter>(initialWorkType === "serial" ? initialSeriesStatus : "all");
  const [sortBy, setSortBy] = useState<SortFilter>(parseSort(searchParams.get("sort")));
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [draftWorkType, setDraftWorkType] = useState<WorkTypeFilter>(workType);
  const [draftSeriesStatus, setDraftSeriesStatus] = useState<SeriesStatusFilter>(seriesStatus);
  const [draftSortBy, setDraftSortBy] = useState<SortFilter>(sortBy);
  // 作品搜索仅匹配标题，不混入标签关联作品
  const [titlePosts, setTitlePosts] = useState<SearchPost[]>([]);
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
  ];

  // Next.js preserves the client component while only the search params
  // change. Keep the controlled search state aligned with URL navigation,
  // including the Navbar's "查看全部结果" link.
  useEffect(() => {
    const nextQuery = searchParams.get("q") || "";
    const nextType = parseSearchFilter(searchParams.get("type"));
    const nextWorkType = parseWorkType(searchParams.get("workType"));
    const nextSeriesStatus = nextWorkType === "serial" ? parseSeriesStatus(searchParams.get("seriesStatus")) : "all";
    const nextSortBy = parseSort(searchParams.get("sort"));

    if (
      inputValue === nextQuery &&
      activeFilter === nextType &&
      workType === nextWorkType &&
      seriesStatus === nextSeriesStatus &&
      sortBy === nextSortBy
    ) {
      return;
    }

    requestIdRef.current += 1;
    // The URL is an external navigation source; mirror it into the
    // controlled form state before the debounced search runs.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInputValue(nextQuery);
    setActiveFilter(nextType);
    setWorkType(nextWorkType);
    setSeriesStatus(nextSeriesStatus);
    setSortBy(nextSortBy);
    setDraftWorkType(nextWorkType);
    setDraftSeriesStatus(nextSeriesStatus);
    setDraftSortBy(nextSortBy);
    setMobileFilterOpen(false);
    setTitlePosts([]);
    setTags([]);
    setUsers([]);
    setLoading(false);
    setHasSearched(Boolean(nextQuery));
  // Search params are the external source of truth; local edits update the
  // URL in the search effect below and should not be overwritten in between.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParamsString]);

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

    // 第一波并行：屏蔽关系 + 标签 + 用户 + 作品标题。
    // 作品筛选只作用于“作品”结果。
    const titleQuery = makePostQuery("title", applyWorkRefine);
    const [blockedRes, tagRes, userRes, titleRes] = await Promise.all([
      supabase.from("blocked_users").select("blocked_user_id").eq("user_id", user.id),
      supabase.from("tags").select("id, name").ilike("name", `%${q}%`).limit(20),
      withTestDataVisibility(
        supabase.from("profiles").select("id, nickname, avatar_url").ilike("nickname", `%${q}%`).limit(20),
        includeTestData,
      ),
      titleQuery || Promise.resolve({ data: [] as unknown[] }),
    ]);

    if (rid !== requestIdRef.current) return;

    const blockedIds = new Set(((blockedRes.data || []) as Array<{ blocked_user_id?: string | null }>).map((row) => row.blocked_user_id as string));
    const tagRows = (tagRes.data || []) as Array<{ id: string; name: string }>;
    const visibleUsers = ((userRes.data || []) as UserResult[]).filter((item) => !blockedIds.has(item.id));
    const rawTitlePosts = ((titleRes.data || []) as unknown as SearchPost[])
      .filter((post) => !blockedIds.has(post.user_id || ""));

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
    if (!mobileFilterOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileFilterOpen(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mobileFilterOpen]);

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
    if (nextType !== "serial") setSeriesStatus("all");
  };

  const openMobileFilter = () => {
    setDraftWorkType(workType);
    setDraftSeriesStatus(seriesStatus);
    setDraftSortBy(sortBy);
    setMobileFilterOpen(true);
  };

  const handleDraftWorkTypeChange = (nextType: WorkTypeFilter) => {
    setDraftWorkType(nextType);
    if (nextType !== "serial") setDraftSeriesStatus("all");
  };

  const applyMobileFilter = () => {
    const nextSeriesStatus = draftWorkType === "serial" ? draftSeriesStatus : "all";
    setWorkType(draftWorkType);
    setSeriesStatus(nextSeriesStatus);
    setSortBy(draftSortBy);
    setMobileFilterOpen(false);
  };

  const typeFilterOptions = WORK_TYPE_OPTIONS;
  const seriesStatusFilterOptions = SERIES_STATUS_OPTIONS;
  const sortFilterOptions = SORT_OPTIONS;
  const renderSearchFilterSelectors = (prefix: string) => (
    <>
      <ProfileFilterSelect
        label="作品类型"
        id={`${prefix}-type-menu`}
        value={workType}
        options={typeFilterOptions}
        onChange={(value) => handleWorkTypeChange(value as WorkTypeFilter)}
      />
      <ProfileFilterSelect
        label="连载状态"
        id={`${prefix}-series-status-menu`}
        value={seriesStatus}
        options={seriesStatusFilterOptions}
        disabled={workType !== "serial"}
        onChange={(value) => setSeriesStatus(value as SeriesStatusFilter)}
      />
      <ProfileFilterSelect
        label="排序"
        id={`${prefix}-sort-menu`}
        value={sortBy}
        options={sortFilterOptions}
        onChange={(value) => setSortBy(value as SortFilter)}
      />
    </>
  );

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
              <SiteIcon name="fa-magnifying-glass" variant="solid" className="search-icon" />
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
                  <SiteIcon name="fa-xmark" variant="solid" />
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
                    <SiteIcon name="fa-magnifying-glass" variant="solid" />
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
  const hasTagResults = tagCount > 0;
  const hasUserResults = userCount > 0;
  const hasWorkResults = workCount > 0;

  const currentHasResults = (() => {
    switch (activeFilter) {
      case "tags": return hasTagResults;
      case "users": return hasUserResults;
      case "works": return hasWorkResults;
      default: return false;
    }
  })();

  return (
    <div id="page-search">
      <div className="search-palette" role="search" aria-label="搜索模块">
        <div className="search-header">
          <div className="search-input-wrapper">
            <SiteIcon name="fa-magnifying-glass" variant="solid" className="search-icon" />
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
                <SiteIcon name="fa-xmark" variant="solid" />
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
          <>
            <div className="search-mobile-filter-bar">
              <button
                type="button"
                className="studio-mobile-filter-button"
                aria-expanded={mobileFilterOpen}
                aria-controls="search-filter-mobile-modal"
                onClick={openMobileFilter}
              >
                <SiteIcon name="fa-filter" variant="default" aria-hidden="true" />
                <span>筛选</span>
              </button>
            </div>

            <section
              className="search-refine-panel studio-filter-composition"
              aria-label="作品筛选条件"
              data-composition-contract="filter.toolbar@0.1"
              data-composition-dependencies="Input Select"
            >
              <div className="filter-system-composition-row">
                {renderSearchFilterSelectors("search")}
              </div>
            </section>

            {mobileFilterOpen && (
              <div
                id="search-filter-mobile-modal"
                className="search-filter-drawer-backdrop"
                role="presentation"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget) setMobileFilterOpen(false);
                }}
              >
                <div
                  className="search-filter-drawer"
                  role="dialog"
                  aria-modal="true"
                  aria-label="筛选作品"
                  onMouseDown={(event) => event.stopPropagation()}
                >
                  <h2>筛选作品</h2>
                  <div className="studio-filter-drawer-section">
                    <strong>作品类型</strong>
                    <div>
                      {typeFilterOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={`studio-filter-control${draftWorkType === option.value ? " is-active" : ""}`}
                          onClick={() => handleDraftWorkTypeChange(option.value)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {draftWorkType === "serial" && (
                    <div className="studio-filter-drawer-section">
                      <strong>连载状态</strong>
                      <div>
                        {seriesStatusFilterOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            className={`studio-filter-control${draftSeriesStatus === option.value ? " is-active" : ""}`}
                            onClick={() => setDraftSeriesStatus(option.value)}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="studio-filter-drawer-section">
                    <strong>排序</strong>
                    <div>
                      {sortFilterOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={`studio-filter-control${draftSortBy === option.value ? " is-active" : ""}`}
                          onClick={() => setDraftSortBy(option.value)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="studio-filter-drawer-actions">
                    <button type="button" onClick={() => { setDraftWorkType("all"); setDraftSeriesStatus("all"); setDraftSortBy("latest"); }}>重置</button>
                    <button type="button" className="is-primary" onClick={applyMobileFilter}>应用筛选</button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {loading && <SkeletonSearchResults />}

        {!loading && !hasSearched && (
          <div className="results-area">
            <div className="feed-empty-state">
              <div className="feed-empty-illustration">
                <div className="feed-empty-tag-ring">
                  <div className="feed-empty-ring-outer"></div>
                  <div className="feed-empty-ring-inner">
                    <SiteIcon name="fa-magnifying-glass" variant="solid" />
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
            <SiteIcon name="fa-magnifying-glass" variant="solid" />
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
                      <span className="tag-icon"><SiteIcon name="fa-tag" variant="solid" /></span>
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
                <div className="tag-history-card-grid search-work-card-grid">
                  {titlePosts.map((post) => (
                    <TagHistoryCard key={post.id} post={toSearchCardPost(post)} context="search" />
                  ))}
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
    <div id="page-search-shell" className="min-h-screen bg-paper pb-20 lg:pb-0">
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
