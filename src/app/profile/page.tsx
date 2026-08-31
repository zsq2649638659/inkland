"use client";

// Personal center release marker: keeps the GitHub-to-Vercel deployment trigger explicit.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import HomeSidebar from "@/components/HomeSidebar";
import { createClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/AuthProvider";
import PostTagCard from "@/components/PostTagCard";
import SeriesCardGrid from "@/components/SeriesCardGrid";
import UserCard from "@/components/UserCard";
import { SkeletonProfile, SkeletonWorksGrid, SkeletonUserCardList } from "@/components/Skeleton";
import EmptyState from "@/components/EmptyState";
import { slimContent } from "@/lib/feed";
import type { Post } from "@/lib/types";

type FilterType = "all" | "single" | "image" | "series";
type TabType = "works" | "likes" | "bookmarks" | "following" | "followers";

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

const formatChapterPreviewTitle = (series: SeriesInfo): string => {
  const title = series.latestChapterTitle?.trim() || "";
  if (series.latestChapterNumber === null) return title;
  return `第${series.latestChapterNumber}章${title ? ` ${title}` : ""}`;
};

interface FollowUser {
  id: string;
  nickname: string;
  avatar_url: string | null;
  bio: string | null;
}

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
    const { data } = await supabase
      .from("posts")
      .select("id, series_name, chapter_number, created_at")
      .in("series_name", names)
      .eq("post_type", "serial")
      .eq("status", "published");
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
  const [{ data: stats }, { data: latestRows }] = await Promise.all([
    allChapterIds.length > 0
      ? supabase.from("post_stats").select("id, like_count, comment_count, bookmark_count").in("id", allChapterIds)
      : Promise.resolve({ data: null }),
    latestIds.length > 0
      ? supabase.from("posts").select("id, title, content, chapter_number, created_at").in("id", latestIds)
      : Promise.resolve({ data: null }),
  ]);

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

export default function ProfilePage() {
  const supabase = createClient();
  const { user, profile, loading: authLoading } = useAuth();
  const [displayPosts, setDisplayPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TabType>("works");
  const [filter, setFilter] = useState<FilterType>("all");
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
  const [tabLoading, setTabLoading] = useState(false);
  const [shownProfileItems, setShownProfileItems] = useState(12);
  const profileLoadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab");
    if (t === "likes") setTab("likes");
    else if (t === "bookmarks") setTab("bookmarks");
    else if (t === "following") setTab("following");
    else if (t === "followers") setTab("followers");
    else setTab("works");
  }, []);

  // 列表数据优先走服务端聚合路由（机房内拉取并瘦身，客户端只下载轻量数据）；
  // 本地 dev 或路由异常时返回 null，调用方回落客户端直连。
  const fetchProfilePosts = async (apiTab: "works" | "likes" | "bookmarks"): Promise<Post[] | null> => {
    try {
      const apiResp = await fetch(`/api/profile-posts?tab=${apiTab}`, { credentials: "same-origin" });
      if (apiResp.ok) {
        const json = await apiResp.json();
        if (json && Array.isArray(json.data)) return json.data as Post[];
      }
    } catch {
      // 回落直连
    }
    return null;
  };

  const loadPosts = async () => {
    if (!user) return;
    setLoading(true);
    setError("");

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
      if (err) { setError(`加载失败: ${err.message}`); setLoading(false); return; }
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
    setLoading(false);
  };

  // 按系列名称加载系列信息（不限定 user_id，可用于加载喜欢的系列）
  const loadSeriesByName = async (seriesNames: string[]): Promise<SeriesInfo[]> => {
    if (seriesNames.length === 0) return [];
    // 系列元数据与章节目录（不含正文）互不依赖，并行取回
    const [{ data }, { data: chapterDir }] = await Promise.all([
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
    setLoading(true);
    let posts: Array<Post & { interaction_at?: string }> | null = await fetchProfilePosts("likes") as Array<Post & { interaction_at?: string }> | null;
    if (posts === null) {
      const { data: likes } = await supabase.from("likes").select("post_id, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
      if (likes && likes.length > 0) {
        const postIds = likes.map((l: Record<string, unknown>) => l.post_id as string);
        const interactionTimes = new Map<string, string>(likes.map((l: Record<string, unknown>) => [l.post_id as string, l.created_at as string]));
        const { data: rawPosts } = await supabase.from("posts").select("id, title, content, cover_url, post_type, created_at, published_at, user_id, series_name, post_tags(tags(name)), author:profiles!posts_user_id_fkey(nickname, avatar_url)").in("id", postIds).eq("status", "published");
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
    setLoading(false);
  };

  const loadBookmarks = async () => {
    if (!user) return;
    setLoading(true);
    let posts: Array<Post & { interaction_at?: string }> | null = await fetchProfilePosts("bookmarks") as Array<Post & { interaction_at?: string }> | null;
    if (posts === null) {
      const { data: bms } = await supabase.from("bookmarks").select("post_id, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
      if (bms && bms.length > 0) {
        const postIds = bms.map((b: Record<string, unknown>) => b.post_id as string);
        const interactionTimes = new Map<string, string>(bms.map((b: Record<string, unknown>) => [b.post_id as string, b.created_at as string]));
        const { data: rawPosts } = await supabase.from("posts").select("id, title, content, cover_url, post_type, created_at, published_at, user_id, series_name, post_tags(tags(name)), author:profiles!posts_user_id_fkey(nickname, avatar_url)").in("id", postIds).eq("status", "published");
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
    setLoading(false);
  };

  const loadSeries = async () => {
    if (!user) return;
    // 系列元数据与「我的已发布连载章节目录」互不依赖，并行取回；
    // 目录不含正文，直接交给 assembleSeriesInfo 复用，省一轮串行往返。
    const [{ data }, { data: chapterDir }] = await Promise.all([
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

    if (data) {
      const raw = data as unknown as SeriesInfo[];
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
    }
  };

  const loadFollowing = async () => {
    if (!user) return;
    setTabLoading(true);
    const { data: fData } = await supabase
      .from("follows")
      .select("following_id, created_at, profiles!follows_following_id_fkey(id, nickname, avatar_url, bio)")
      .eq("follower_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (fData) {
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
    } else {
      setFollowing([]);
      setFollowingIds(new Set());
    }
    setTabLoading(false);
  };

  const loadFollowers = async () => {
    if (!user) return;
    setTabLoading(true);
    // 我的关注列表与粉丝列表互不依赖，并行取回（原实现串行两轮）
    const [{ data: myFollowing }, { data: fData }] = await Promise.all([
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
    const myFollowingSet = new Set<string>((myFollowing || []).map((f: Record<string, unknown>) => f.following_id as string));
    setFollowingIds(myFollowingSet);
    if (fData) {
      const users = (fData as unknown as Array<{ follower_id: string; profiles: { id: string; nickname: string; avatar_url: string | null; bio: string | null } | null }>)
        .filter((f) => f.profiles)
        .map((f) => ({
          id: f.profiles!.id,
          nickname: f.profiles!.nickname,
          avatar_url: f.profiles!.avatar_url,
          bio: f.profiles!.bio,
        }));
      setFollowers(users);
    } else {
      setFollowers([]);
    }
    setTabLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    if (tab === "works") { loadPosts(); loadSeries(); }
    else if (tab === "likes") loadLikes();
    else if (tab === "bookmarks") loadBookmarks();
    else if (tab === "following") loadFollowing();
    else if (tab === "followers") loadFollowers();
  }, [user, tab]);

  const filterPills: { key: FilterType; label: string }[] = [
    { key: "all", label: "全部" },
    { key: "single", label: "单篇" },
    { key: "image", label: "图片" },
    { key: "series", label: "长篇连载" },
  ];

  const showFilters = tab === "works" || tab === "likes" || tab === "bookmarks";

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
    if (tab === "following") return following.length;
    if (tab === "followers") return followers.length;
    return 0;
  })();

  useEffect(() => {
    setShownProfileItems(12);
  }, [tab, filter, likeFilter, bookmarkFilter]);

  useEffect(() => {
    const el = profileLoadMoreRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setShownProfileItems((count) => count + 12);
      },
      { rootMargin: "240px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [tab, filter, likeFilter, bookmarkFilter, profilePageTotal]);

  const workOrder = new Map(
    [
      ...seriesList.map((series) => ({
        id: `series:${series.id}`,
        time: new Date(series.created_at || "").getTime(),
      })),
      ...displayPosts.map((post) => ({
        id: `post:${post.id}`,
        time: new Date(post.published_at || post.created_at || "").getTime(),
      })),
    ]
      .sort((a, b) => b.time - a.time)
      .map((item, index) => [item.id, index] as const),
  );

  const likeOrder = new Map(
    [
      ...likedSeriesList.map((series) => ({ id: `series:${series.id}`, time: new Date(series.interaction_at || series.created_at || "").getTime() })),
      ...likedPosts.map((post) => ({ id: `post:${post.id}`, time: new Date((post as Post & { interaction_at?: string }).interaction_at || "").getTime() })),
    ]
      .sort((a, b) => b.time - a.time)
      .map((item, index) => [item.id, index] as const),
  );

  const bookmarkOrder = new Map(
    [
      ...bookmarkedSeriesList.map((series) => ({ id: `series:${series.id}`, time: new Date(series.interaction_at || series.created_at || "").getTime() })),
      ...bookmarkedPosts.map((post) => ({ id: `post:${post.id}`, time: new Date((post as Post & { interaction_at?: string }).interaction_at || "").getTime() })),
    ]
      .sort((a, b) => b.time - a.time)
      .map((item, index) => [item.id, index] as const),
  );

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
                    <i className="fa-solid fa-user-circle"></i>
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
        {/* Segmented Tabs */}
        <div className="segmented-tabs">
          <div className="segmented-tabs-left">
            <button
              className={`segmented-tab${tab === "works" ? " active" : ""}`}
              onClick={() => setTab("works")}
            ><span className="my-prefix">我的</span>作品</button>
            <button
              className={`segmented-tab${tab === "likes" ? " active" : ""}`}
              onClick={() => setTab("likes")}
            ><span className="my-prefix">我的</span>喜欢</button>
            <button
              className={`segmented-tab${tab === "bookmarks" ? " active" : ""}`}
              onClick={() => setTab("bookmarks")}
            ><span className="my-prefix">我的</span>收藏</button>
          </div>
          <div className="segmented-tabs-right">
            <button
              className={`segmented-tab${tab === "following" ? " active" : ""}`}
              onClick={() => setTab("following")}
            ><span className="my-prefix">我的</span>关注</button>
            <button
              className={`segmented-tab${tab === "followers" ? " active" : ""}`}
              onClick={() => setTab("followers")}
            ><span className="my-prefix">我的</span>粉丝</button>
          </div>
        </div>

        {/* Type Filters + View Toggle */}
        {showFilters && (
          <div className="type-filters-row">
            <div className="type-filters">
              {filterPills.map((f) => {
                const currentFilter = tab === "likes" ? likeFilter : tab === "bookmarks" ? bookmarkFilter : filter;
                const isActive = currentFilter === f.key;
                return (
                  <button
                    key={f.key}
                    className={`type-filter-pill${isActive ? " active" : ""}`}
                    onClick={() => {
                      if (tab === "likes") setLikeFilter(f.key);
                      else if (tab === "bookmarks") setBookmarkFilter(f.key);
                      else setFilter(f.key);
                    }}
                  >{f.label}</button>
                );
              })}
            </div>

          </div>
        )}

        {/* Tab: Works */}
        <div className={`tab-content${tab === "works" ? " active" : ""}`}>
          {loading ? (
            <SkeletonWorksGrid count={6} />
          ) : error ? (
            <div className="text-center py-8"><p className="text-sm text-red-500 mb-2">{error}</p></div>
          ) : displayPosts.length === 0 && seriesList.length === 0 ? (
            <div className="empty-state">
              <div className="empty-illustration">
                <div className="empty-tag-ring">
                  <div className="tag-ring-outer"></div>
                  <div className="tag-ring-inner">
                    <i className="fa-solid fa-book"></i>
                  </div>
                </div>
              </div>
              <h2 className="empty-title">还没有发布任何作品</h2>
              <p className="empty-desc">写下你的第一个故事，与世界分享你的创作</p>
              <Link href="/studio" className="empty-action"><i className="fa-solid fa-pen-to-square" style={{ marginRight: 6 }}></i>发布作品</Link>
            </div>
          ) : (
            <div className="card-grid">
              {/* 连载卡片 */}
              {(filter === "all" || filter === "series") &&
                seriesList.slice(0, shownProfileItems).map((series) => (
                    <div key={series.id} className="tag-card series" data-type="series" style={{ order: workOrder.get(`series:${series.id}`) ?? 9999 }}>
                    <Link href={`/series/${encodeURIComponent(series.name)}`} className="no-underline"><div className="series-header">
                      <div className="series-header-info">
                        <span className={`series-header-badge${series.status === "completed" ? " completed" : ""}`}>
                          {series.status === "completed" ? "已完结" : "连载中"}
                        </span>
                        <span className="series-header-name">{series.name}</span>
                        <div className="series-header-desc">{series.description || "暂无简介"}</div>
                        {series.tags && series.tags.length > 0 && (
                          <div className="card-tags has-overflow">
                            {series.tags.map((tag) => (
                              <span key={tag} className="card-tag">{tag}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div></Link>
                    {series.totalChapters > 0 ? (
                      <Link href={`/read/${series.latestChapterId}`} className="no-underline"><div className="chapter-preview">
                        <div className="chapter-preview-label">最新章节</div>
                        <div className="chapter-preview-title">{formatChapterPreviewTitle(series)}</div>
                        <div className="chapter-preview-excerpt">{series.latestChapterContent || ""}</div>
                      </div></Link>
                    ) : (
                      <div className="series-empty">
                        <div className="series-empty-box">
                          <div className="series-empty-icon">
                            <i className="fa-regular fa-pen-to-square"></i>
                          </div>
                          <div className="series-empty-info">
                            <div className="series-empty-label">等待开篇</div>
                            <div className="series-empty-hint">作者正在构思中</div>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="card-footer">
                      <div className="card-stats">
                        <span className="card-stat">
                          <i className="fa-regular fa-heart" /> {series.like_count || 0}
                        </span>
                        <span className="card-stat">
                          <i className="fa-regular fa-comment" /> {series.comment_count || 0}
                        </span>
                        <span className="card-stat">
                          <i className="fa-regular fa-bookmark" /> {series.bookmark_count || 0}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              {/* 帖子卡片 */}
              {displayPosts
                .filter((post) => {
                  if (filter === "all") return true;
                  if (filter === "image") return hasImages(post);
                  if (filter === "single") return !hasImages(post);
                  if (filter === "series") return false;
                  return true;
                })
                .slice(0, shownProfileItems)
                .map((post) => (
                  <PostTagCard key={post.id} post={post} style={{ order: workOrder.get(`post:${post.id}`) ?? 9999 }} imageTagsInOverlay />
                ))}
            </div>
          )}
        </div>

        {/* Tab: Likes */}
        <div className={`tab-content${tab === "likes" ? " active" : ""}`}>
          {loading ? (
            <SkeletonWorksGrid count={6} />
          ) : likeFilter === "series" ? (
            likedSeriesList.length === 0 ? (
              <div className="empty-state">
                <div className="empty-illustration">
                  <div className="empty-tag-ring">
                    <div className="tag-ring-outer"></div>
                    <div className="tag-ring-inner">
                      <i className="fa-regular fa-heart"></i>
                    </div>
                  </div>
                </div>
                <h2 className="empty-title">还没有喜欢任何长篇连载</h2>
                <p className="empty-desc">喜欢一个长篇连载后，它就会出现在这里</p>
              </div>
            ) : (
              <div className="card-grid">
                {likedSeriesList.slice(0, shownProfileItems).map((series) => (
                  <div key={series.id} className="tag-card series" data-type="series" style={{ order: likeOrder.get(`series:${series.id}`) ?? 9999 }}>
                    <Link href={`/series/${encodeURIComponent(series.name)}`} className="no-underline"><div className="series-header">
                      <div className="series-header-info">
                        <span className={`series-header-badge${series.status === "completed" ? " completed" : ""}`}>
                          {series.status === "completed" ? "已完结" : "连载中"}
                        </span>
                        <span className="series-header-name">{series.name}</span>
                        <div className="series-header-desc">{series.description || "暂无简介"}</div>
                        {series.tags && series.tags.length > 0 && (
                          <div className="card-tags has-overflow">
                            {series.tags.map((tag) => (
                              <span key={tag} className="card-tag">{tag}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div></Link>
                    {series.totalChapters > 0 ? (
                      <Link href={`/read/${series.latestChapterId}`} className="no-underline"><div className="chapter-preview">
                        <div className="chapter-preview-label">最新章节</div>
                        <div className="chapter-preview-title">{formatChapterPreviewTitle(series)}</div>
                        <div className="chapter-preview-excerpt">{series.latestChapterContent || ""}</div>
                      </div></Link>
                    ) : (
                      <div className="series-empty">
                        <div className="series-empty-box">
                          <div className="series-empty-icon">
                            <i className="fa-regular fa-pen-to-square"></i>
                          </div>
                          <div className="series-empty-info">
                            <div className="series-empty-label">等待开篇</div>
                            <div className="series-empty-hint">作者正在构思中</div>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="card-footer">
                      <div className="card-stats">
                        <span className="card-stat">
                          <i className="fa-regular fa-heart" /> {series.like_count || 0}
                        </span>
                        <span className="card-stat">
                          <i className="fa-regular fa-comment" /> {series.comment_count || 0}
                        </span>
                        <span className="card-stat">
                          <i className="fa-regular fa-bookmark" /> {series.bookmark_count || 0}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (() => {
            const filteredLikes = likedPosts.filter((p) => {
              if (likeFilter === "all") return true;
              if (likeFilter === "image") return hasImages(p);
              if (likeFilter === "single") return !hasImages(p);
              if (likeFilter === "series") return false;
              return true;
            });
            const showSeries = likeFilter === "all" && likedSeriesList.length > 0;
            const hasContent = showSeries || filteredLikes.length > 0;
            return !hasContent ? (
              <div className="empty-state">
                <div className="empty-illustration">
                  <div className="empty-tag-ring">
                    <div className="tag-ring-outer"></div>
                    <div className="tag-ring-inner">
                      <i className="fa-regular fa-heart"></i>
                    </div>
                  </div>
                </div>
                <h2 className="empty-title">还没有喜欢任何作品</h2>
                <p className="empty-desc">去发现更多精彩内容，为你喜欢的作品点亮爱心</p>
              </div>
            ) : (
              <div className="card-grid">
                {showSeries && likedSeriesList.slice(0, shownProfileItems).map((series) => (
                  <div key={series.id} className="tag-card series" data-type="series" style={{ order: likeOrder.get(`series:${series.id}`) ?? 9999 }}>
                    <Link href={`/series/${encodeURIComponent(series.name)}`} className="no-underline"><div className="series-header">
                      <div className="series-header-info">
                        <span className={`series-header-badge${series.status === "completed" ? " completed" : ""}`}>
                          {series.status === "completed" ? "已完结" : "连载中"}
                        </span>
                        <span className="series-header-name">{series.name}</span>
                        <div className="series-header-desc">{series.description || "暂无简介"}</div>
                        {series.tags && series.tags.length > 0 && (
                          <div className="card-tags has-overflow">
                            {series.tags.map((tag) => (
                              <span key={tag} className="card-tag">{tag}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div></Link>
                    {series.totalChapters > 0 ? (
                      <Link href={`/read/${series.latestChapterId}`} className="no-underline"><div className="chapter-preview">
                        <div className="chapter-preview-label">最新章节</div>
                        <div className="chapter-preview-title">{formatChapterPreviewTitle(series)}</div>
                        <div className="chapter-preview-excerpt">{series.latestChapterContent || ""}</div>
                      </div></Link>
                    ) : (
                      <div className="series-empty">
                        <div className="series-empty-box">
                          <div className="series-empty-icon">
                            <i className="fa-regular fa-pen-to-square"></i>
                          </div>
                          <div className="series-empty-info">
                            <div className="series-empty-label">等待开篇</div>
                            <div className="series-empty-hint">作者正在构思中</div>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="card-footer">
                      <div className="card-stats">
                        <span className="card-stat">
                          <i className="fa-regular fa-heart" /> {series.like_count || 0}
                        </span>
                        <span className="card-stat">
                          <i className="fa-regular fa-comment" /> {series.comment_count || 0}
                        </span>
                        <span className="card-stat">
                          <i className="fa-regular fa-bookmark" /> {series.bookmark_count || 0}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                {filteredLikes.slice(0, shownProfileItems).map((post) => <PostTagCard key={post.id} post={post} style={{ order: likeOrder.get(`post:${post.id}`) ?? 9999 }} imageTagsInOverlay />)}
              </div>
            );
          })()}
        </div>

        {/* Tab: Bookmarks */}
        <div className={`tab-content${tab === "bookmarks" ? " active" : ""}`}>
          {loading ? (
            <SkeletonWorksGrid count={6} />
          ) : bookmarkFilter === "series" ? (
            bookmarkedSeriesList.length === 0 ? (
              <div className="empty-state">
                <div className="empty-illustration">
                  <div className="empty-tag-ring">
                    <div className="tag-ring-outer"></div>
                    <div className="tag-ring-inner">
                      <i className="fa-solid fa-bookmark"></i>
                    </div>
                  </div>
                </div>
                <h2 className="empty-title">还没有收藏任何长篇连载</h2>
                <p className="empty-desc">收藏一个长篇连载后，它就会出现在这里</p>
              </div>
            ) : (
              <div className="card-grid">
                {bookmarkedSeriesList.slice(0, shownProfileItems).map((series) => (
                  <div key={series.id} className="tag-card series" data-type="series" style={{ order: bookmarkOrder.get(`series:${series.id}`) ?? 9999 }}>
                    <Link href={`/series/${encodeURIComponent(series.name)}`} className="no-underline"><div className="series-header">
                      <div className="series-header-info">
                        <span className={`series-header-badge${series.status === "completed" ? " completed" : ""}`}>
                          {series.status === "completed" ? "已完结" : "连载中"}
                        </span>
                        <span className="series-header-name">{series.name}</span>
                        <div className="series-header-desc">{series.description || "暂无简介"}</div>
                        {series.tags && series.tags.length > 0 && (
                          <div className="card-tags has-overflow">
                            {series.tags.map((tag) => (
                              <span key={tag} className="card-tag">{tag}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div></Link>
                    {series.totalChapters > 0 ? (
                      <Link href={`/read/${series.latestChapterId}`} className="no-underline"><div className="chapter-preview">
                        <div className="chapter-preview-label">最新章节</div>
                        <div className="chapter-preview-title">{formatChapterPreviewTitle(series)}</div>
                        <div className="chapter-preview-excerpt">{series.latestChapterContent || ""}</div>
                      </div></Link>
                    ) : (
                      <div className="series-empty">
                        <div className="series-empty-box">
                          <div className="series-empty-icon">
                            <i className="fa-regular fa-pen-to-square"></i>
                          </div>
                          <div className="series-empty-info">
                            <div className="series-empty-label">等待开篇</div>
                            <div className="series-empty-hint">作者正在构思中</div>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="card-footer">
                      <div className="card-stats">
                        <span className="card-stat">
                          <i className="fa-regular fa-heart" /> {series.like_count || 0}
                        </span>
                        <span className="card-stat">
                          <i className="fa-regular fa-comment" /> {series.comment_count || 0}
                        </span>
                        <span className="card-stat">
                          <i className="fa-regular fa-bookmark" /> {series.bookmark_count || 0}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (() => {
            const filteredBookmarks = bookmarkedPosts.filter((p) => {
              if (bookmarkFilter === "all") return true;
              if (bookmarkFilter === "image") return hasImages(p);
              if (bookmarkFilter === "single") return !hasImages(p);
              if (bookmarkFilter === "series") return false;
              return true;
            });
            const showSeries = bookmarkFilter === "all" && bookmarkedSeriesList.length > 0;
            const hasContent = showSeries || filteredBookmarks.length > 0;
            return !hasContent ? (
              <div className="empty-state">
                <div className="empty-illustration">
                  <div className="empty-tag-ring">
                    <div className="tag-ring-outer"></div>
                    <div className="tag-ring-inner">
                      <i className="fa-solid fa-bookmark"></i>
                    </div>
                  </div>
                </div>
                <h2 className="empty-title">还没有收藏任何作品</h2>
                <p className="empty-desc">收藏喜欢的作品，随时回来阅读</p>
              </div>
            ) : (
              <div className="card-grid">
                {showSeries && bookmarkedSeriesList.slice(0, shownProfileItems).map((series) => (
                  <div key={series.id} className="tag-card series" data-type="series" style={{ order: bookmarkOrder.get(`series:${series.id}`) ?? 9999 }}>
                    <Link href={`/series/${encodeURIComponent(series.name)}`} className="no-underline"><div className="series-header">
                      <div className="series-header-info">
                        <span className={`series-header-badge${series.status === "completed" ? " completed" : ""}`}>
                          {series.status === "completed" ? "已完结" : "连载中"}
                        </span>
                        <span className="series-header-name">{series.name}</span>
                        <div className="series-header-desc">{series.description || "暂无简介"}</div>
                        {series.tags && series.tags.length > 0 && (
                          <div className="card-tags has-overflow">
                            {series.tags.map((tag) => (
                              <span key={tag} className="card-tag">{tag}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div></Link>
                    {series.totalChapters > 0 ? (
                      <Link href={`/read/${series.latestChapterId}`} className="no-underline"><div className="chapter-preview">
                        <div className="chapter-preview-label">最新章节</div>
                        <div className="chapter-preview-title">{formatChapterPreviewTitle(series)}</div>
                        <div className="chapter-preview-excerpt">{series.latestChapterContent || ""}</div>
                      </div></Link>
                    ) : (
                      <div className="series-empty">
                        <div className="series-empty-box">
                          <div className="series-empty-icon">
                            <i className="fa-regular fa-pen-to-square"></i>
                          </div>
                          <div className="series-empty-info">
                            <div className="series-empty-label">等待开篇</div>
                            <div className="series-empty-hint">作者正在构思中</div>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="card-footer">
                      <div className="card-stats">
                        <span className="card-stat">
                          <i className="fa-regular fa-heart" /> {series.like_count || 0}
                        </span>
                        <span className="card-stat">
                          <i className="fa-regular fa-comment" /> {series.comment_count || 0}
                        </span>
                        <span className="card-stat">
                          <i className="fa-regular fa-bookmark" /> {series.bookmark_count || 0}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                {filteredBookmarks.slice(0, shownProfileItems).map((post) => <PostTagCard key={post.id} post={post} style={{ order: bookmarkOrder.get(`post:${post.id}`) ?? 9999 }} imageTagsInOverlay />)}
              </div>
            );
          })()}
        </div>

        {/* Tab: Following */}
        <div className={`tab-content${tab === "following" ? " active" : ""}`}>
          {tabLoading ? (
            <SkeletonUserCardList />
          ) : following.length === 0 ? (
            <div className="empty-state">
              <div className="empty-illustration">
                <div className="empty-tag-ring">
                  <div className="tag-ring-outer"></div>
                  <div className="tag-ring-inner">
                    <i className="fa-solid fa-user-group"></i>
                  </div>
                </div>
              </div>
              <h2 className="empty-title">还没有关注任何用户</h2>
              <p className="empty-desc">去发现更多创作者，关注他们不会错过精彩内容</p>
            </div>
          ) : (
            <>
              <div className="section-header">
                <span className="section-title">全部关注</span>
                <div className="list-search-wrapper">
                  <input type="text" className="list-search" id="search-following" placeholder="搜索关注用户..." />
                  <i className="fa-solid fa-magnifying-glass list-search-icon"></i>
                </div>
              </div>
              <div className="user-cards-grid">
                {following.slice(0, shownProfileItems).map((u) => (
                  <UserCard key={u.id} user={u} currentUserId={user.id} isFollowingTab={true} onUpdate={() => { loadFollowing(); }} />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Tab: Followers */}
        <div className={`tab-content${tab === "followers" ? " active" : ""}`}>
          {tabLoading ? (
            <SkeletonUserCardList />
          ) : followers.length === 0 ? (
            <div className="empty-state">
              <div className="empty-illustration">
                <div className="empty-tag-ring">
                  <div className="tag-ring-outer"></div>
                  <div className="tag-ring-inner">
                    <i className="fa-solid fa-users"></i>
                  </div>
                </div>
              </div>
              <h2 className="empty-title">还没有粉丝</h2>
              <p className="empty-desc">发布更多精彩内容，吸引粉丝关注你</p>
            </div>
          ) : (
            <>
              <div className="section-header">
                <span className="section-title">全部粉丝</span>
                <div className="list-search-wrapper">
                  <input type="text" className="list-search" id="search-followers" placeholder="搜索粉丝用户..." />
                  <i className="fa-solid fa-magnifying-glass list-search-icon"></i>
                </div>
              </div>
              <div className="user-cards-grid">
                {followers.slice(0, shownProfileItems).map((u) => (
                  <UserCard key={u.id} user={u} currentUserId={user.id} isFollowingTab={false} isFollowed={followingIds.has(u.id)} onUpdate={() => { loadFollowers(); }} />
                ))}
              </div>
            </>
          )}
        </div>
          {profilePageTotal > 0 && (
            <div className="card-load-more" ref={profileLoadMoreRef}>
              {shownProfileItems < profilePageTotal ? (
                <button type="button" className="btn-load-more" onClick={() => setShownProfileItems((count) => count + 12)}>
                  <i className="fa-solid fa-angles-down" aria-hidden="true" /> 加载更多
                </button>
              ) : (
                <span className="load-more-end">已加载全部 {profilePageTotal} 项内容</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
