"use client";
import SiteIcon from "@/components/SiteIcon";

// Personal center release marker: keeps the GitHub-to-Vercel deployment trigger explicit.

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import HomeSidebar from "@/components/HomeSidebar";
import { useAppDialog } from "@/components/AppDialogProvider";
import { createClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/AuthProvider";
import ProfileCardCollection from "@/components/ProfileCardCollection";
import ProfileFilterSelect from "@/components/ProfileFilterSelect";
import UserCard from "@/components/UserCard";
import DefaultAvatar from "@/components/DefaultAvatar";
import { SkeletonProfile, SkeletonUserCardList, SkeletonWorksGrid } from "@/components/Skeleton";
import { slimContent } from "@/lib/feed";
import type { Post } from "@/lib/types";
import { getOrCreateClientCache, invalidateClientCache } from "@/lib/client-cache";

type FilterType = "all" | "single" | "image" | "series";
type TabType = "works" | "likes" | "bookmarks" | "following" | "followers";
type StatusFilter = "all" | "published" | "draft" | "rejected";
type SortMode = "latest" | "created" | "hot";

const readProfileTab = (fallback: TabType): TabType => {
  if (typeof window === "undefined") return fallback;
  const tab = new URLSearchParams(window.location.search).get("tab");
  if (tab === "works" || tab === "likes" || tab === "bookmarks" || tab === "following" || tab === "followers") return tab;
  return fallback;
};

interface SeriesInfo {
  id: string;
  name: string;
  cover_url: string | null;
  description: string;
  series_type: string;
  tags: string[];
  status: string;
  created_at: string;
  latestChapterId: string | null;
  latestChapterNumber: number | null;
  latestChapterTitle: string | null;
  latestChapterContent: string | null;
  latestChapterCreatedAt: string | null;
  totalChapters: number;
  like_count: number;
  comment_count: number;
  bookmark_count: number;
  interaction_at?: string;
}

// 移除 Markdown 语法，提取纯文本
const stripMarkdown = (text: string): string => {
  return text
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[([^\]]*)\]\(.*?\)/g, "$1")
    .replace(/[#*_~`>]/g, "")
    .replace(/\n{2,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

interface FollowUser {
  id: string;
  nickname: string;
  avatar_url: string | null;
  bio: string | null;
}

type ProfileSummaryStats = {
  following: number | null;
  followers: number | null;
  works: number | null;
};

// 判断帖子是否有图片
const hasImages = (post: Post): boolean => {
  const cp = post as unknown as Record<string, unknown>;
  if (cp.cover_url) return true;
  const content = (cp.content as string) || "";
  return /!\[.*?\]\(.*?\)/g.test(content);
};

// 章节目录行：只取定位/排序需要的轻量字段，绝不携带正文
type ChapterDirRow = { id: string; series_name: string; chapter_number: number | null; created_at: string };

// 批量组装系列信息，两波轻量查询：
//   第 1 波：章节目录（id/series_name/chapter_number/created_at，不含正文）。
//            调用方若已并行预取（如“我的作品”页与系列查询同波发出），直接复用。
//   第 2 波：全部章节统计 + 各系列最新一章标题/正文，Promise.all 并行。
// 旧实现一次拉回所有系列全部章节的完整 content——连载动辄上百章、累计
// 数百 KB~数 MB 正文跨区传输，导致点击个人中心卡顿无响应。
const assembleSeriesInfo = async (
  supabase: ReturnType<typeof createClient>,
  seriesMeta: SeriesInfo[],
  opts?: { prefetchedChapters?: ChapterDirRow[] }
): Promise<SeriesInfo[]> => {
  if (seriesMeta.length === 0) return [];
  const seen = new Set<string>();
  const meta = seriesMeta.filter((s) => { if (seen.has(s.name)) return false; seen.add(s.name); return true; });
  const names = meta.map((s) => s.name);
  if (names.length === 0) return [];

  let chapterDir = opts?.prefetchedChapters;
  if (!chapterDir) {
    const { data, error } = await supabase
      .from("posts")
      .select("id, series_name, chapter_number, created_at")
      .in("series_name", names)
      .eq("post_type", "serial")
      .eq("status", "published");
    if (error) throw error;
    chapterDir = (data as unknown as ChapterDirRow[]) || [];
  }

  const nameSet = new Set(names);
  const bySeries = new Map<string, ChapterDirRow[]>();
  const allChapterIds: string[] = [];
  for (const ch of chapterDir) {
    const sn = ch.series_name;
    if (!sn || !nameSet.has(sn)) continue;
    if (!bySeries.has(sn)) bySeries.set(sn, []);
    bySeries.get(sn)!.push(ch);
    allChapterIds.push(ch.id);
  }
  const latestIds: string[] = [];
  for (const rows of bySeries.values()) {
    rows.sort((a, b) => (b.chapter_number || 0) - (a.chapter_number || 0));
    if (rows[0]) latestIds.push(rows[0].id);
  }

  // 第 2 波（并行）：所有章节统计（post_stats 已按章节聚合）+ 各系列最新一章标题/正文
  const [{ data: stats, error: statsError }, { data: latestRows, error: latestError }] = await Promise.all([
    allChapterIds.length > 0
      ? supabase.from("post_stats").select("id, like_count, comment_count, bookmark_count").in("id", allChapterIds)
      : Promise.resolve({ data: null, error: null }),
    latestIds.length > 0
      ? supabase.from("posts").select("id, title, content, chapter_number, created_at").in("id", latestIds)
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (statsError || latestError) throw statsError || latestError;

  const statsMap = new Map<string, { like: number; comment: number; bookmark: number }>();
  for (const s of (stats as unknown as Array<Record<string, unknown>>) || []) {
    statsMap.set(s.id as string, {
      like: (s.like_count as number) || 0,
      comment: (s.comment_count as number) || 0,
      bookmark: (s.bookmark_count as number) || 0,
    });
  }
  const latestMap = new Map<string, Record<string, unknown>>();
  for (const l of (latestRows as unknown as Array<Record<string, unknown>>) || []) latestMap.set(l.id as string, l);

  return meta.map((s) => {
    const dirs = bySeries.get(s.name) || [];
    const latestDir = dirs[0] || null;
    const latest = latestDir ? latestMap.get(latestDir.id) : undefined;
    let like = 0, comment = 0, bookmark = 0;
    for (const d of dirs) {
      const st = statsMap.get(d.id);
      if (st) { like += st.like; comment += st.comment; bookmark += st.bookmark; }
    }
    return {
      ...s,
      like_count: like,
      comment_count: comment,
      bookmark_count: bookmark,
      latestChapterId: latestDir ? latestDir.id : null,
      latestChapterNumber: latestDir ? latestDir.chapter_number : null,
      latestChapterTitle: latest ? (latest.title as string) || null : null,
      latestChapterContent: latest ? stripMarkdown((latest.content as string) || "") || null : null,
      latestChapterCreatedAt: latest ? (latest.created_at as string) || null : latestDir ? latestDir.created_at : null,
      totalChapters: dirs.length,
    };
  });
};

export default function ProfilePage({ defaultTab = "works" }: { defaultTab?: TabType }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const dialog = useAppDialog();
  const { user, profile, loading: authLoading } = useAuth();
  const displayName = profile?.nickname || user?.email?.split("@")[0] || "用户";
  const [displayPosts, setDisplayPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TabType>(defaultTab);
  const [filter, setFilter] = useState<FilterType>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("latest");
  const [profileSearch, setProfileSearch] = useState("");
  const [profileUrlReady, setProfileUrlReady] = useState(false);
  const [profileSummaryStats, setProfileSummaryStats] = useState<ProfileSummaryStats>({
    following: null,
    followers: null,
    works: null,
  });
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [mobileDraftFilter, setMobileDraftFilter] = useState<FilterType>("all");
  const [mobileDraftStatus, setMobileDraftStatus] = useState<StatusFilter>("all");
  const [mobileCardLayout, setMobileCardLayout] = useState<"full" | "square">("full");
  const [likedPosts, setLikedPosts] = useState<Post[]>([]);
  const [bookmarkedPosts, setBookmarkedPosts] = useState<Post[]>([]);
  const [seriesList, setSeriesList] = useState<SeriesInfo[]>([]);
  const [likedSeriesList, setLikedSeriesList] = useState<SeriesInfo[]>([]);
  const [bookmarkedSeriesList, setBookmarkedSeriesList] = useState<SeriesInfo[]>([]);
  const [likeFilter, setLikeFilter] = useState<FilterType>("all");
  const [bookmarkFilter, setBookmarkFilter] = useState<FilterType>("all");
  const [following, setFollowing] = useState<FollowUser[]>([]);
  const [followers, setFollowers] = useState<FollowUser[]>([]);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [relationshipSearch, setRelationshipSearch] = useState("");
  const [relationshipBatchMode, setRelationshipBatchMode] = useState(false);
  const [selectedRelationshipIds, setSelectedRelationshipIds] = useState<Set<string>>(new Set());
  const [relationshipBatchLoading, setRelationshipBatchLoading] = useState(false);
  const [relationshipError, setRelationshipError] = useState("");
  const [tabLoading, setTabLoading] = useState(false);
  const [shownProfileItems, setShownProfileItems] = useState(12);
  const profileLoadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const syncProfileStateFromUrl = () => {
      setTab(readProfileTab(defaultTab));
      if (defaultTab === "works") {
        setProfileSearch(new URLSearchParams(window.location.search).get("q") || "");
      }
      setProfileUrlReady(true);
    };
    syncProfileStateFromUrl();
    const handlePopState = () => {
      syncProfileStateFromUrl();
      setLoading(true);
      setError("");
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [defaultTab]);

  useEffect(() => {
    if (!profileUrlReady || defaultTab !== "works") return;
    const url = new URL(window.location.href);
    const query = profileSearch.trim();
    if (query) url.searchParams.set("q", query);
    else url.searchParams.delete("q");
    const nextUrl = url.pathname + url.search + url.hash;
    const currentUrl = window.location.pathname + window.location.search + window.location.hash;
    if (nextUrl !== currentUrl) window.history.replaceState(null, "", nextUrl);
  }, [defaultTab, profileSearch, profileUrlReady]);

  useEffect(() => {
    if (!user || defaultTab !== "works") return;
    let active = true;
    const cacheKey = "sidebar-stats:" + user.id;
    const loadStats = async () => {
      try {
        const nextStats = await getOrCreateClientCache<ProfileSummaryStats>(
          cacheKey,
          async () => {
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
          },
          { ttlMs: 30_000, persist: true },
        );
        if (active) setProfileSummaryStats(nextStats);
      } catch {
        if (active) setProfileSummaryStats({ following: null, followers: null, works: null });
      }
    };
    const handleStatsChanged = () => {
      invalidateClientCache(cacheKey);
      void loadStats();
    };
    void loadStats();
    window.addEventListener("inkland:stats-changed", handleStatsChanged);
    return () => {
      active = false;
      window.removeEventListener("inkland:stats-changed", handleStatsChanged);
    };
  }, [defaultTab, supabase, user]);

  const handleProfileTabChange = (next: TabType) => {
    setLoading(true);
    setError("");
    setTab(next);
    const params = new URLSearchParams(window.location.search);
    params.set("tab", next);
    if (profileSearch.trim()) params.set("q", profileSearch.trim());
    else params.delete("q");
    router.push(window.location.pathname + "?" + params.toString(), { scroll: false });
  };

  // 列表数据优先走服务端聚合路由（机房内拉取并瘦身，客户端只下载轻量数据）；
  // 本地 dev 或路由异常时返回 null，调用方回落客户端直连。
  const fetchProfilePosts = async (apiTab: "works" | "likes" | "bookmarks"): Promise<Post[] | null> => {
    return getOrCreateClientCache<Post[]>(
      `profile-posts:${user?.id || "anonymous"}:${apiTab}`,
      async () => {
        const apiResp = await fetch(`/api/profile-posts?tab=${apiTab}`, { credentials: "same-origin" });
        if (!apiResp.ok) throw new Error(`profile posts request failed: ${apiResp.status}`);
        const json = await apiResp.json();
        if (!json || !Array.isArray(json.data)) throw new Error("profile posts response invalid");
        return json.data as Post[];
      },
      { ttlMs: 30_000, persist: true },
    ).catch(() => null);
  };

  const loadPosts = async () => {
    if (!user) return;

    let data: Post[] | null = await fetchProfilePosts("works");
    if (data === null) {
      const q = supabase
        .from("posts")
        .select("id, title, content, cover_url, post_type, created_at, published_at, series_name, chapter_number, status, review_status, review_reason, user_id, post_tags(tags(name))")
        .eq("user_id", user.id)
        // 连载章节不在“我的作品”列表展示（由系列卡片承载），服务端直接排除：
        // 否则 limit(50) 会被章节行挤占，且白拉回大量章节正文（跨区传输数 MB）。
        .or("post_type.neq.serial,chapter_number.is.null")
        .order("created_at", { ascending: false })
        .limit(50);
      const { data: d, error: err } = await q;
      if (err) throw err;
      // 直连回落路径同样瘦身：卡片只消费摘要+图片，超长全文交给详情页
      data = ((d as unknown as Post[]) || []).map((p) => ({ ...p, content: slimContent(p.content || "") }));
    }

    const privatePrefix = "private://private-post-images/";
    const resolvePrivateUrl = async (url?: string | null) => {
      if (!url?.startsWith(privatePrefix)) return url || null;
      const { data: signed } = await supabase.storage.from("private-post-images").createSignedUrl(url.slice(privatePrefix.length), 3600);
      return signed?.signedUrl || url;
    };
    const resolvedPosts = await Promise.all((data as unknown as Post[]).map(async (post) => {
      let content = post.content || "";
      const privateUrls = [...new Set([...content.matchAll(/private:\/\/private-post-images\/([^\s)]+)/g)].map((match) => match[0]))];
      const replacements = await Promise.all(privateUrls.map(async (url) => ({ url, signedUrl: await resolvePrivateUrl(url) })));
      for (const replacement of replacements) {
        if (replacement.signedUrl) content = content.split(replacement.url).join(replacement.signedUrl);
      }
      return { ...post, content, cover_url: await resolvePrivateUrl(post.cover_url) };
    }));

    const raw = resolvedPosts.sort((a, b) => {
      const da = new Date(a.published_at || a.created_at || "").getTime();
      const db = new Date(b.published_at || b.created_at || "").getTime();
      return db - da;
    });
    const nonChapterPosts = raw.filter((p) => {
      const cp = p as unknown as Record<string, unknown>;
      if (cp.post_type !== "serial") return true;
      const cn = cp.chapter_number as number | null | undefined;
      return cn === null || cn === undefined;
    });

    const postsWithAuthor = nonChapterPosts.map((p) => {
      const cp = p as unknown as Record<string, unknown>;
      const ptags = (cp.post_tags as Array<{ tags: { name: string } }> | undefined)?.map((pt) => pt.tags?.name) || [];
      return {
        ...p,
        tags: ptags,
        author: {
          nickname: profile?.nickname || user.email?.split("@")[0] || "用户",
          avatar_url: profile?.avatar_url || null,
          username: profile?.nickname,
        },
      };
    });

    setDisplayPosts(postsWithAuthor);
  };

  // 按系列名称加载系列信息（不限定 user_id，可用于加载喜欢的系列）
  const loadSeriesByName = async (seriesNames: string[]): Promise<SeriesInfo[]> => {
    if (seriesNames.length === 0) return [];
    // 系列元数据与章节目录（不含正文）互不依赖，并行取回
    const [{ data, error: seriesError }, { data: chapterDir, error: chapterError }] = await Promise.all([
      supabase
        .from("series")
        .select("id, name, cover_url, description, series_type, tags, status, created_at")
        .in("name", seriesNames)
        .order("created_at", { ascending: false }),
      supabase
        .from("posts")
        .select("id, series_name, chapter_number, created_at")
        .in("series_name", seriesNames)
        .eq("post_type", "serial")
        .eq("status", "published"),
    ]);

    if (seriesError || chapterError) throw seriesError || chapterError;
    if (!data) return [];

    const seen = new Set<string>();
    const deduped = (data as unknown as SeriesInfo[]).filter((s) => {
      if (seen.has(s.name)) return false;
      seen.add(s.name);
      return true;
    });

    // 批量组装：目录已预取，内部只剩「统计 + 最新一章」一波并行查询
    return assembleSeriesInfo(supabase, deduped, {
      prefetchedChapters: (chapterDir as unknown as ChapterDirRow[]) || [],
    });
  };

  const loadLikes = async () => {
    if (!user) return;
    let posts: Array<Post & { interaction_at?: string }> | null = await fetchProfilePosts("likes") as Array<Post & { interaction_at?: string }> | null;
    if (posts === null) {
      const { data: likes, error: likesError } = await supabase.from("likes").select("post_id, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
      if (likesError) throw likesError;
      if (likes && likes.length > 0) {
        const postIds = likes.map((l: Record<string, unknown>) => l.post_id as string);
        const interactionTimes = new Map<string, string>(likes.map((l: Record<string, unknown>) => [l.post_id as string, l.created_at as string]));
        const { data: rawPosts, error: postsError } = await supabase.from("posts").select("id, title, content, cover_url, post_type, created_at, published_at, user_id, series_name, post_tags(tags(name)), author:profiles!posts_user_id_fkey(nickname, avatar_url)").in("id", postIds).eq("status", "published");
        if (postsError) throw postsError;
        posts = ((rawPosts as unknown as Post[]) || []).map((p) => ({
          ...p,
          content: slimContent(p.content || ""),
          interaction_at: interactionTimes.get(p.id) || p.created_at,
        }));
      } else {
        posts = [];
      }
    }
    if (posts.length > 0) {
      const formatted = posts.map((p) => {
        const cp = p as unknown as Record<string, unknown>;
        const ptags = (cp.post_tags as Array<{ tags: { name: string } }> | undefined)?.map((pt) => pt.tags?.name) || [];
        return { ...p, tags: ptags };
      });
      formatted.sort((a, b) => new Date((b as Post & { interaction_at?: string }).interaction_at || "").getTime() - new Date((a as Post & { interaction_at?: string }).interaction_at || "").getTime());
      setLikedPosts(formatted);

      // 收集喜欢帖子所属的系列，加载系列信息
      const seriesNames = [...new Set(formatted.filter((p) => p.series_name).map((p) => p.series_name as string))];
      const seriesData = await loadSeriesByName(seriesNames);
      setLikedSeriesList(seriesData.map((series) => ({
        ...series,
        interaction_at: formatted
          .filter((post) => post.series_name === series.name)
          .map((post) => (post as Post & { interaction_at?: string }).interaction_at || "")
          .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || series.created_at,
      })));
    } else {
      setLikedPosts([]);
      setLikedSeriesList([]);
    }
  };

  const loadBookmarks = async () => {
    if (!user) return;
    let posts: Array<Post & { interaction_at?: string }> | null = await fetchProfilePosts("bookmarks") as Array<Post & { interaction_at?: string }> | null;
    if (posts === null) {
      const { data: bms, error: bookmarksError } = await supabase.from("bookmarks").select("post_id, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
      if (bookmarksError) throw bookmarksError;
      if (bms && bms.length > 0) {
        const postIds = bms.map((b: Record<string, unknown>) => b.post_id as string);
        const interactionTimes = new Map<string, string>(bms.map((b: Record<string, unknown>) => [b.post_id as string, b.created_at as string]));
        const { data: rawPosts, error: postsError } = await supabase.from("posts").select("id, title, content, cover_url, post_type, created_at, published_at, user_id, series_name, post_tags(tags(name)), author:profiles!posts_user_id_fkey(nickname, avatar_url)").in("id", postIds).eq("status", "published");
        if (postsError) throw postsError;
        posts = ((rawPosts as unknown as Post[]) || []).map((p) => ({
          ...p,
          content: slimContent(p.content || ""),
          interaction_at: interactionTimes.get(p.id) || p.created_at,
        }));
      } else {
        posts = [];
      }
    }
    if (posts.length > 0) {
      const formatted = posts.map((p) => {
        const cp = p as unknown as Record<string, unknown>;
        const ptags = (cp.post_tags as Array<{ tags: { name: string } }> | undefined)?.map((pt) => pt.tags?.name) || [];
        return { ...p, tags: ptags };
      });
      formatted.sort((a, b) => new Date((b as Post & { interaction_at?: string }).interaction_at || "").getTime() - new Date((a as Post & { interaction_at?: string }).interaction_at || "").getTime());
      setBookmarkedPosts(formatted);

      // 收集收藏帖子所属的系列，加载系列信息
      const seriesNames = [...new Set(formatted.filter((p) => p.series_name).map((p) => p.series_name as string))];
      const seriesData = await loadSeriesByName(seriesNames);
      setBookmarkedSeriesList(seriesData.map((series) => ({
        ...series,
        interaction_at: formatted
          .filter((post) => post.series_name === series.name)
          .map((post) => (post as Post & { interaction_at?: string }).interaction_at || "")
          .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || series.created_at,
      })));
    } else {
      setBookmarkedPosts([]);
      setBookmarkedSeriesList([]);
    }
  };

  const loadSeries = async () => {
    if (!user) return;
    // 系列元数据与「我的已发布连载章节目录」互不依赖，并行取回；
    // 目录不含正文，直接交给 assembleSeriesInfo 复用，省一轮串行往返。
    const [{ data, error: seriesError }, { data: chapterDir, error: chapterError }] = await Promise.all([
      supabase
        .from("series")
        .select("id, name, cover_url, description, series_type, tags, status, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("posts")
        .select("id, series_name, chapter_number, created_at")
        .eq("user_id", user.id)
        .eq("post_type", "serial")
        .eq("status", "published"),
    ]);

    if (seriesError || chapterError) throw seriesError || chapterError;
    const raw = (data as unknown as SeriesInfo[]) || [];
    const seen = new Set<string>();
    const deduped = raw.filter((s) => {
      if (seen.has(s.name)) return false;
      seen.add(s.name);
      return true;
    });

    // 批量组装：目录已预取，内部只剩「统计 + 最新一章」一波并行查询
    setSeriesList(await assembleSeriesInfo(supabase, deduped, {
      prefetchedChapters: (chapterDir as unknown as ChapterDirRow[]) || [],
    }));
  };

  const reloadProfileContent = async (targetTab: TabType) => {
    if (!user) return;
    try {
      if (targetTab === "works") {
        const results = await Promise.allSettled([loadPosts(), loadSeries()]);
        const failedResult = results.find((result) => result.status === "rejected");
        if (failedResult?.status === "rejected") throw failedResult.reason;
      }
      else if (targetTab === "likes") await loadLikes();
      else if (targetTab === "bookmarks") await loadBookmarks();
    } catch {
      const label = targetTab === "likes"
        ? "喜欢的作品"
        : targetTab === "bookmarks"
          ? "收藏的作品"
          : "作品";
      setError(label);
    } finally {
      setLoading(false);
    }
  };

  const loadFollowing = async () => {
    if (!user) return;
    setTabLoading(true);
    setRelationshipError("");
    try {
      const { data: fData, error: queryError } = await supabase
        .from("follows")
        .select("following_id, created_at, profiles!follows_following_id_fkey(id, nickname, avatar_url, bio)")
        .eq("follower_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (queryError) throw queryError;
      const users = (fData as unknown as Array<{ following_id: string; profiles: { id: string; nickname: string; avatar_url: string | null; bio: string | null } | null }>)
        .filter((f) => f.profiles)
        .map((f) => ({
          id: f.profiles!.id,
          nickname: f.profiles!.nickname,
          avatar_url: f.profiles!.avatar_url,
          bio: f.profiles!.bio,
        }));
      setFollowing(users);
      setFollowingIds(new Set(users.map((u) => u.id)));
    } catch {
      setFollowing([]);
      setFollowingIds(new Set());
      setRelationshipError("关注列表暂时无法加载，请重试。");
    } finally {
      setTabLoading(false);
    }
  };

  const loadFollowers = async () => {
    if (!user) return;
    setTabLoading(true);
    setRelationshipError("");
    // 我的关注列表与粉丝列表互不依赖，并行取回（原实现串行两轮）
    try {
      const [{ data: myFollowing, error: followingError }, { data: fData, error: followerError }] = await Promise.all([
        supabase
          .from("follows")
          .select("following_id")
          .eq("follower_id", user.id),
        supabase
          .from("follows")
          .select("follower_id, created_at, profiles!follows_follower_id_fkey(id, nickname, avatar_url, bio)")
          .eq("following_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      if (followingError || followerError) throw followingError || followerError;
      const myFollowingSet = new Set<string>((myFollowing || []).map((f: Record<string, unknown>) => f.following_id as string));
      setFollowingIds(myFollowingSet);
      const users = (fData as unknown as Array<{ follower_id: string; profiles: { id: string; nickname: string; avatar_url: string | null; bio: string | null } | null }>)
        .filter((f) => f.profiles)
        .map((f) => ({
          id: f.profiles!.id,
          nickname: f.profiles!.nickname,
          avatar_url: f.profiles!.avatar_url,
          bio: f.profiles!.bio,
        }));
      setFollowers(users);
    } catch {
      setFollowingIds(new Set());
      setFollowers([]);
      setRelationshipError("粉丝列表暂时无法加载，请重试。");
    } finally {
      setTabLoading(false);
    }
  };

  const retryRelationshipLoad = () => {
    if (tab === "following") void loadFollowing();
    else if (tab === "followers") void loadFollowers();
  };

  useEffect(() => {
    if (!user) return;
    if (tab === "works" || tab === "likes" || tab === "bookmarks") void reloadProfileContent(tab);
    else if (tab === "following") loadFollowing();
    else if (tab === "followers") loadFollowers();
  }, [user, tab]);

  useEffect(() => {
    if (tab !== "following" && tab !== "followers") return;
    setRelationshipSearch("");
    setRelationshipBatchMode(false);
    setSelectedRelationshipIds(new Set());
  }, [tab]);

  const filterPills: { key: FilterType; label: string }[] = [
    { key: "all", label: "全部" },
    { key: "single", label: "单篇" },
    { key: "image", label: "图片" },
    { key: "series", label: "长篇连载" },
  ];

  const showFilters = tab === "works" || tab === "likes" || tab === "bookmarks";
  const relationshipPage = defaultTab === "following" || defaultTab === "followers";
  const relationshipQuery = relationshipSearch.trim().toLocaleLowerCase();
  const matchesRelationshipUser = (item: FollowUser) => {
    if (!relationshipQuery) return true;
    return `${item.nickname} ${item.bio || ""}`.toLocaleLowerCase().includes(relationshipQuery);
  };
  const filteredFollowing = following.filter(matchesRelationshipUser);
  const filteredFollowers = followers.filter(matchesRelationshipUser);
  const activeRelationshipUsers = tab === "following" ? filteredFollowing : filteredFollowers;
  const activeRelationshipItems = tab === "following" ? following : followers;

  // “全部”需要把长篇、单篇和图片放进同一个时间序列，而不是按卡片类型分组。
  const profilePageTotal = (() => {
    if (tab === "works") {
      const seriesCount = filter === "all" || filter === "series" ? seriesList.length : 0;
      const posts = filter === "all"
        ? displayPosts.length
        : displayPosts.filter((p) => (filter === "image" ? hasImages(p) : !hasImages(p))).length;
      return seriesCount + posts;
    }
    if (tab === "likes") {
      if (likeFilter === "series") return likedSeriesList.length;
      const seriesCount = likeFilter === "all" ? likedSeriesList.length : 0;
      const posts = likeFilter === "all"
        ? likedPosts.length
        : likedPosts.filter((p) => (likeFilter === "image" ? hasImages(p) : !hasImages(p))).length;
      return seriesCount + posts;
    }
    if (tab === "bookmarks") {
      if (bookmarkFilter === "series") return bookmarkedSeriesList.length;
      const seriesCount = bookmarkFilter === "all" ? bookmarkedSeriesList.length : 0;
      const posts = bookmarkFilter === "all"
        ? bookmarkedPosts.length
        : bookmarkedPosts.filter((p) => (bookmarkFilter === "image" ? hasImages(p) : !hasImages(p))).length;
      return seriesCount + posts;
    }
    if (tab === "following") return filteredFollowing.length;
    if (tab === "followers") return filteredFollowers.length;
    return 0;
  })();

  useEffect(() => {
    setShownProfileItems(12);
  }, [tab, filter, likeFilter, bookmarkFilter, relationshipSearch]);

  useEffect(() => {
    const el = profileLoadMoreRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setShownProfileItems((count) => count < profilePageTotal ? Math.min(count + 12, profilePageTotal) : count);
        }
      },
      { rootMargin: "240px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [tab, filter, likeFilter, bookmarkFilter, relationshipSearch, profilePageTotal]);

  const toggleRelationshipSelect = (id: string) => {
    setSelectedRelationshipIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllRelationships = () => {
    const ids = activeRelationshipUsers.map((item) => item.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedRelationshipIds.has(id));
    setSelectedRelationshipIds(allSelected ? new Set() : new Set(ids));
  };

  const handleRelationshipBatch = async () => {
    if (!user || relationshipBatchLoading || selectedRelationshipIds.size === 0) return;
    const ids = Array.from(selectedRelationshipIds);
    const isFollowingTab = tab === "following";
    const actionLabel = isFollowingTab ? "批量取关" : "批量移除";
    if (!await dialog.confirm({ title: actionLabel, message: `确定${actionLabel}选中的 ${ids.length} 位用户吗？`, confirmLabel: actionLabel, variant: "danger" })) return;

    setRelationshipBatchLoading(true);
    const result = isFollowingTab
      ? await supabase.from("follows").delete().eq("follower_id", user.id).in("following_id", ids)
      : await supabase.from("follows").delete().eq("following_id", user.id).in("follower_id", ids);
    setRelationshipBatchLoading(false);
    if (result.error) {
      await dialog.alert({ title: `${actionLabel}失败`, message: result.error.message, variant: "danger" });
      return;
    }

    if (isFollowingTab) {
      setFollowing((items) => items.filter((item) => !ids.includes(item.id)));
      setFollowingIds((current) => {
        const next = new Set(current);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setFollowers((items) => items.filter((item) => !ids.includes(item.id)));
    }
    setSelectedRelationshipIds(new Set());
    setRelationshipBatchMode(false);
    dialog.toast(`${actionLabel}完成`);
  };

  const activeProfileFilter = tab === "likes" ? likeFilter : tab === "bookmarks" ? bookmarkFilter : filter;
  const activeProfilePosts = tab === "likes" ? likedPosts : tab === "bookmarks" ? bookmarkedPosts : displayPosts;
  const activeProfileSeries = tab === "likes" ? likedSeriesList : tab === "bookmarks" ? bookmarkedSeriesList : seriesList;
  const updateActiveFilter = (next: FilterType) => {
    if (tab === "likes") setLikeFilter(next);
    else if (tab === "bookmarks") setBookmarkFilter(next);
    else setFilter(next);
  };

  if (authLoading) {
    return <div className="min-h-screen bg-paper pb-20 lg:pb-0"><main className="max-w-4xl mx-auto px-4 py-8"><SkeletonProfile /></main></div>;
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
                    <SiteIcon name="fa-profile-settings" variant="solid" />
                  </div>
                </div>
              </div>
              <h2 className="feed-empty-title">登录后查看个人主页</h2>
              <p className="feed-empty-desc">登录后即可查看你的作品、收藏、喜欢和关注</p>
              <Link href="/login" className="feed-empty-action">登录</Link>
              <Link href="/register" className="feed-empty-register">还没有账号？立即注册 →</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper pb-20 lg:pb-0" id="page-profile">
      <div className="main-container">
        <HomeSidebar />
        <div className="content-area">
        {defaultTab === "works" && (
          <section className="profile-section profile-page-identity" aria-label="个人资料">
            <div className="profile-identity">
              <Link href="/profile" className="profile-avatar no-underline" aria-label="查看我的空间">
                {profile?.avatar_url ? (
                  <Image src={profile.avatar_url} alt="" width={80} height={80} sizes="80px" />
                ) : (
                  <DefaultAvatar name={displayName} />
                )}
              </Link>
              <div className="profile-info">
                <h1 className="profile-name" title={displayName}>{displayName}</h1>
                <p className="profile-bio">{profile?.bio || "这个人很懒，什么都没写"}</p>
              </div>
            </div>
            <div className="profile-stats" aria-label="个人统计">
              <Link href="/relationships" className="profile-stat" aria-label="查看我的关注">
                <span className="stat-value">{profileSummaryStats.following ?? "—"}</span>
                <span className="profile-stat-label">关注</span>
              </Link>
              <Link href="/relationships/followers" className="profile-stat" aria-label="查看我的粉丝">
                <span className="stat-value">{profileSummaryStats.followers ?? "—"}</span>
                <span className="profile-stat-label">粉丝</span>
              </Link>
              <Link href="/profile?tab=works" className="profile-stat" aria-label="查看我的作品">
                <span className="stat-value">{profileSummaryStats.works ?? "—"}</span>
                <span className="profile-stat-label">作品</span>
              </Link>
            </div>
          </section>
        )}
        <div className="profile-primary-content">
          {showFilters ? (
            <div className="segmented-tabs segmented-tabs--profile-primary">
              <div className="segmented-tabs-left">
                {(["works", "likes", "bookmarks"] as const).map((key) => (
                  <button key={key} className={`segmented-tab${tab === key ? " active" : ""}`} onClick={() => handleProfileTabChange(key)}>
                    <span className="my-prefix">我的</span>{key === "works" ? "作品" : key === "likes" ? "喜欢" : "收藏"}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="segmented-tabs segmented-tabs--relations">
              <div className="segmented-tabs-left">
                {relationshipPage ? (
                  <Link href="/relationships" className={`segmented-tab${tab === "following" ? " active" : ""}`}><span className="my-prefix">我的</span>关注</Link>
                ) : (
                  <button className={`segmented-tab${tab === "following" ? " active" : ""}`} onClick={() => setTab("following")}><span className="my-prefix">我的</span>关注</button>
                )}
                {relationshipPage ? (
                  <Link href="/relationships/followers" className={`segmented-tab${tab === "followers" ? " active" : ""}`}><span className="my-prefix">我的</span>粉丝</Link>
                ) : (
                  <button className={`segmented-tab${tab === "followers" ? " active" : ""}`} onClick={() => setTab("followers")}><span className="my-prefix">我的</span>粉丝</button>
                )}
              </div>
            </div>
          )}

          {showFilters && (
            <>
              <div className="filter-system-composition-row" data-composition-contract="filter.toolbar@0.1" data-composition-dependencies="Input Select">
                <div className="filter-system-field filter-system-field--query">
                  <div className="profile-filter-search-shell">
                    <SiteIcon name="fa-magnifying-glass" variant="solid" aria-hidden="true" />
                    <input className="form-control" type="search" value={profileSearch} onChange={(event) => setProfileSearch(event.target.value)} placeholder="搜索作品标题…" aria-label="搜索作品标题" />
                    <button type="button" className="profile-filter-search-clear" aria-label="清除搜索作品" onClick={() => setProfileSearch("")}>
                      <SiteIcon name="fa-xmark" variant="solid" aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <ProfileFilterSelect label="作品类型" id="profile-filter-type-menu" value={activeProfileFilter} options={filterPills.map((item) => ({ value: item.key, label: item.key === "all" ? "所有作品" : item.label }))} onChange={(value) => updateActiveFilter(value as FilterType)} />
                <ProfileFilterSelect label="排序" id="profile-filter-sort-menu" value={sortMode} options={[{ value: "latest", label: "最近更新" }, { value: "created", label: "最近创建" }, { value: "hot", label: "热度最高" }]} onChange={(value) => setSortMode(value as SortMode)} />
              </div>
              <div className="profile-mobile-filter-bar">
                <div className="filter-system-field profile-mobile-search">
                  <div className="profile-filter-search-shell">
                    <SiteIcon name="fa-magnifying-glass" variant="solid" aria-hidden="true" />
                    <input className="form-control" type="search" value={profileSearch} onChange={(event) => setProfileSearch(event.target.value)} placeholder="搜索作品标题…" aria-label="搜索作品标题" />
                    <button type="button" className="profile-filter-search-clear" aria-label="清除搜索作品" onClick={() => setProfileSearch("")}>
                      <SiteIcon name="fa-xmark" variant="solid" aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <button type="button" className="profile-mobile-filter-button profile-mobile-icon-button" onClick={() => { setMobileDraftFilter(activeProfileFilter); setMobileDraftStatus(statusFilter); setMobileFilterOpen(true); }} aria-label="打开筛选"><SiteIcon name="fa-filter" variant="default" aria-hidden="true" /></button>
                <button type="button" className="profile-mobile-filter-button profile-mobile-icon-button" onClick={() => setMobileCardLayout((current) => current === "full" ? "square" : "full")} aria-label={mobileCardLayout === "full" ? "切换为三列卡片" : "切换为单列列表"} aria-pressed={mobileCardLayout === "square"}><SiteIcon name={mobileCardLayout === "full" ? "fa-card-compact" : "fa-list-compact"} variant="default" aria-hidden="true" /></button>
              </div>
              {mobileFilterOpen && (
                <div className="profile-filter-drawer-backdrop" role="presentation" onClick={() => setMobileFilterOpen(false)}>
                  <section className="profile-filter-drawer" role="dialog" aria-modal="true" aria-label="筛选作品" onClick={(event) => event.stopPropagation()}>
                    <h2>筛选作品</h2>
                    <div className="profile-filter-drawer-section"><strong>作品类型</strong><div>{filterPills.map((item) => <button key={item.key} type="button" className={`profile-filter-control${mobileDraftFilter === item.key ? " is-active" : ""}`} onClick={() => setMobileDraftFilter(item.key)}>{item.label}</button>)}</div></div>
                    <div className="profile-filter-drawer-section"><strong>发布状态</strong><div>{([['all', '全部'], ['published', '已发布'], ['draft', '草稿'], ['rejected', '未过审']] as const).map(([key, label]) => <button key={key} type="button" className={`profile-filter-control${mobileDraftStatus === key ? " is-active" : ""}`} onClick={() => setMobileDraftStatus(key)}>{label}</button>)}</div></div>
                    <div className="profile-filter-drawer-actions"><button type="button" onClick={() => { setMobileDraftFilter("all"); setMobileDraftStatus("all"); }}>重置</button><button type="button" className="is-primary" onClick={() => { updateActiveFilter(mobileDraftFilter); setStatusFilter(mobileDraftStatus); setMobileFilterOpen(false); }}>应用筛选</button></div>
                  </section>
                </div>
              )}
              {loading ? (
                <SkeletonWorksGrid count={6} />
              ) : error ? (
                <div className="profile-content-error" role="alert">
                  <h2>{error}暂时无法加载</h2>
                  <p>请检查网络连接后重试。</p>
                  <button type="button" className="profile-filter-control is-active" onClick={() => { setLoading(true); setError(""); void reloadProfileContent(tab); }}>重试</button>
                </div>
              ) : (activeProfilePosts.length > 0 || activeProfileSeries.length > 0) ? (
                <ProfileCardCollection posts={activeProfilePosts} series={activeProfileSeries} filter={activeProfileFilter} query={profileSearch} status={statusFilter} sort={sortMode} limit={shownProfileItems} mobileLayout={mobileCardLayout} />
              ) : (
                <div className="empty-state">
                  <div className="empty-illustration">
                    <div className="empty-tag-ring">
                      <div className="tag-ring-outer"></div>
                      <div className="tag-ring-inner">
                        <SiteIcon name="fa-feather-pointed" variant="solid" />
                      </div>
                    </div>
                  </div>
                  <h2 className="empty-title">这里还没有作品</h2>
                  <p className="empty-desc">发布或收藏作品后，会显示在这里。</p>
                </div>
              )}
            </>
          )}

          {!showFilters && (
            <div className="relationship-content">
              <div className={`relationship-toolbar${relationshipBatchMode ? " is-batch-mode" : ""}`}>
                <div className="filter-system-field filter-system-field--query relationship-search-field">
                  <div className="profile-filter-search-shell">
                    <SiteIcon name="fa-magnifying-glass" variant="solid" aria-hidden="true" />
                    <input
                      className="form-control"
                      type="search"
                      value={relationshipSearch}
                      onChange={(event) => setRelationshipSearch(event.target.value)}
                      placeholder={tab === "following" ? "搜索关注用户" : "搜索粉丝用户"}
                      aria-label={tab === "following" ? "搜索关注用户" : "搜索粉丝用户"}
                    />
                    <button type="button" className="profile-filter-search-clear" aria-label="清除用户搜索" onClick={() => setRelationshipSearch("")}>
                      <SiteIcon name="fa-xmark" variant="solid" aria-hidden="true" />
                    </button>
                  </div>
                </div>
                {!relationshipBatchMode ? (
                  <button type="button" className="studio-toolbar-action relationship-batch-toggle" onClick={() => { setRelationshipBatchMode(true); setSelectedRelationshipIds(new Set()); }}>
                    批量操作
                  </button>
                ) : (
                  <div className="relationship-batch-row">
                    <button type="button" className="studio-toolbar-action" disabled={relationshipBatchLoading || selectedRelationshipIds.size === 0} onClick={() => void handleRelationshipBatch()}>
                      {tab === "following" ? "批量取关" : "批量移除"}
                    </button>
                    <button type="button" className="studio-toolbar-action" disabled={relationshipBatchLoading} onClick={selectAllRelationships}>全选</button>
                    <button type="button" className="studio-toolbar-action" disabled={relationshipBatchLoading} onClick={() => { setRelationshipBatchMode(false); setSelectedRelationshipIds(new Set()); }}>取消</button>
                  </div>
                )}
              </div>

              {tabLoading ? (
                <SkeletonUserCardList />
              ) : relationshipError ? (
                <div className="empty-state relationship-error-state" role="alert">
                  <div className="empty-illustration">
                    <div className="empty-tag-ring">
                      <div className="tag-ring-outer"></div>
                      <div className="tag-ring-inner">
                        <SiteIcon name="fa-circle-exclamation" variant="solid" />
                      </div>
                    </div>
                  </div>
                  <h2 className="empty-title">加载失败</h2>
                  <p className="empty-desc">{relationshipError}</p>
                  <button type="button" className="empty-action" onClick={retryRelationshipLoad}>重试</button>
                </div>
              ) : activeRelationshipItems.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-illustration">
                    <div className="empty-tag-ring">
                      <div className="tag-ring-outer"></div>
                      <div className="tag-ring-inner">
                        <SiteIcon name={tab === "following" ? "fa-user-group" : "fa-users"} variant="solid" />
                      </div>
                    </div>
                  </div>
                  <h2 className="empty-title">{tab === "following" ? "还没有关注任何用户" : "还没有粉丝"}</h2>
                  <p className="empty-desc">{tab === "following" ? "去发现更多创作者，关注他们不会错过精彩内容" : "发布更多精彩内容，吸引粉丝关注你"}</p>
                </div>
              ) : activeRelationshipUsers.length === 0 ? (
                <div className="empty-state relationship-filter-empty">
                  <div className="empty-illustration">
                    <div className="empty-tag-ring">
                      <div className="tag-ring-outer"></div>
                      <div className="tag-ring-inner">
                        <SiteIcon name="fa-magnifying-glass" variant="solid" />
                      </div>
                    </div>
                  </div>
                  <h2 className="empty-title">没有找到匹配的用户</h2>
                  <p className="empty-desc">试试其他昵称或简介关键词。</p>
                </div>
              ) : (
                <div className="user-cards-grid">
                  {activeRelationshipUsers.slice(0, shownProfileItems).map((item) => (
                    <UserCard
                      key={item.id}
                      user={item}
                      currentUserId={user.id}
                      isFollowingTab={tab === "following"}
                      isFollowed={tab === "followers" ? followingIds.has(item.id) : undefined}
                      selectable={relationshipBatchMode}
                      selected={selectedRelationshipIds.has(item.id)}
                      onToggleSelect={() => toggleRelationshipSelect(item.id)}
                      onUpdate={() => { if (tab === "following") void loadFollowing(); else void loadFollowers(); }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        {shownProfileItems < profilePageTotal && (
          <div
            className="profile-load-more-sentinel"
            ref={profileLoadMoreRef}
            aria-hidden="true"
          />
        )}
      </div>
    </div>
    </div>
  );
}
