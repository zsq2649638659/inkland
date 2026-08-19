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
import { SkeletonProfile, SkeletonProfileSection } from "@/components/Skeleton";
import EmptyState from "@/components/EmptyState";
import DefaultAvatar from "@/components/DefaultAvatar";
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

// 查询系列下所有章节的点赞/评论/收藏总数
const loadSeriesStats = async (supabase: ReturnType<typeof createClient>, seriesName: string) => {
  const { data: chapters } = await supabase
    .from("posts")
    .select("id")
    .eq("series_name", seriesName)
    .eq("post_type", "serial")
    .eq("status", "published");

  if (!chapters || chapters.length === 0) return { like_count: 0, comment_count: 0, bookmark_count: 0 };

  const chapterIds = chapters.map((c: Record<string, unknown>) => c.id as string);

  const [likeRes, commentRes, bookmarkRes] = await Promise.all([
    supabase.from("likes").select("id", { count: "exact", head: true }).in("post_id", chapterIds),
    supabase.from("comments").select("id", { count: "exact", head: true }).in("post_id", chapterIds),
    supabase.from("bookmarks").select("id", { count: "exact", head: true }).in("post_id", chapterIds),
  ]);

  return {
    like_count: likeRes.count || 0,
    comment_count: commentRes.count || 0,
    bookmark_count: bookmarkRes.count || 0,
  };
};

export default function ProfilePage() {
  const supabase = createClient();
  const { user, profile, loading: authLoading } = useAuth();
  const [allPosts, setAllPosts] = useState<Post[]>([]);
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

  // Stats
  const [likeCount, setLikeCount] = useState(0);
  const [bookmarkCount, setBookmarkCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [followerCount, setFollowerCount] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab");
    if (t === "likes") setTab("likes");
    else if (t === "bookmarks") setTab("bookmarks");
    else if (t === "following") setTab("following");
    else if (t === "followers") setTab("followers");
    else setTab("works");
  }, []);

  const loadStats = async () => {
    if (!user) return;
    const [likeRes, bmRes, fwingRes, fwerRes] = await Promise.all([
      supabase.from("likes").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("bookmarks").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", user.id),
      supabase.from("follows").select("id", { count: "exact", head: true }).eq("following_id", user.id),
    ]);
    setLikeCount(likeRes.count || 0);
    setBookmarkCount(bmRes.count || 0);
    setFollowingCount(fwingRes.count || 0);
    setFollowerCount(fwerRes.count || 0);
  };

  const loadPosts = async () => {
    if (!user) return;
    setLoading(true);
    setError("");

    const q = supabase
      .from("posts")
      .select("id, title, content, cover_url, post_type, created_at, published_at, series_name, chapter_number, status, review_status, review_reason, user_id, post_tags(tags(name))")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    const { data, error: err } = await q;
    if (err) { setError(`加载失败: ${err.message}`); setLoading(false); return; }

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

    setAllPosts(raw);
    setDisplayPosts(postsWithAuthor);
    setLoading(false);
  };

  // 按系列名称加载系列信息（不限定 user_id，可用于加载喜欢的系列）
  const loadSeriesByName = async (seriesNames: string[]): Promise<SeriesInfo[]> => {
    if (seriesNames.length === 0) return [];
    const { data } = await supabase
      .from("series")
      .select("id, name, cover_url, description, series_type, tags, status, created_at")
      .in("name", seriesNames)
      .order("created_at", { ascending: false });

    if (!data) return [];

    const seen = new Set<string>();
    const deduped = (data as unknown as SeriesInfo[]).filter((s) => {
      if (seen.has(s.name)) return false;
      seen.add(s.name);
      return true;
    });

    const seriesWithChapters = await Promise.all(deduped.map(async (s) => {
      const { data: chapters, count } = await supabase
        .from("posts")
        .select("id, title, content, chapter_number, created_at", { count: "exact" })
        .eq("series_name", s.name)
        .eq("post_type", "serial")
        .eq("status", "published")
        .order("chapter_number", { ascending: false })
        .limit(1);

      const latest = chapters && chapters.length > 0 ? chapters[0] as Record<string, unknown> : null;
      const stats = await loadSeriesStats(supabase, s.name);
      return {
        ...s,
        ...stats,
        latestChapterId: latest ? latest.id as string : null,
        latestChapterNumber: latest ? latest.chapter_number as number : null,
        latestChapterTitle: latest ? latest.title as string : null,
        latestChapterContent: latest ? stripMarkdown((latest.content as string) || "") || null : null,
        latestChapterCreatedAt: latest ? latest.created_at as string : null,
        totalChapters: count || 0,
      };
    }));

    return seriesWithChapters;
  };

  const loadLikes = async () => {
    if (!user) return;
    setLoading(true);
    const { data: likes } = await supabase.from("likes").select("post_id, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
    if (likes && likes.length > 0) {
      const postIds = likes.map((l: Record<string, unknown>) => l.post_id as string);
      const interactionTimes = new Map(likes.map((l: Record<string, unknown>) => [l.post_id as string, l.created_at as string]));
      const { data: posts } = await supabase.from("posts").select("id, title, content, cover_url, post_type, created_at, published_at, user_id, series_name, post_tags(tags(name)), author:profiles!posts_user_id_fkey(nickname, avatar_url)").in("id", postIds).eq("status", "published");
      if (posts) {
        const formatted = (posts as unknown as Post[]).map((p) => {
          const cp = p as unknown as Record<string, unknown>;
          const ptags = (cp.post_tags as Array<{ tags: { name: string } }> | undefined)?.map((pt) => pt.tags?.name) || [];
          return { ...p, tags: ptags, interaction_at: interactionTimes.get(p.id) || p.created_at };
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
      }
    } else {
      setLikedPosts([]);
      setLikedSeriesList([]);
    }
    setLoading(false);
  };

  const loadBookmarks = async () => {
    if (!user) return;
    setLoading(true);
    const { data: bms } = await supabase.from("bookmarks").select("post_id, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
    if (bms && bms.length > 0) {
      const postIds = bms.map((b: Record<string, unknown>) => b.post_id as string);
      const interactionTimes = new Map(bms.map((b: Record<string, unknown>) => [b.post_id as string, b.created_at as string]));
      const { data: posts } = await supabase.from("posts").select("id, title, content, cover_url, post_type, created_at, published_at, user_id, series_name, post_tags(tags(name)), author:profiles!posts_user_id_fkey(nickname, avatar_url)").in("id", postIds).eq("status", "published");
      if (posts) {
        const formatted = (posts as unknown as Post[]).map((p) => {
          const cp = p as unknown as Record<string, unknown>;
          const ptags = (cp.post_tags as Array<{ tags: { name: string } }> | undefined)?.map((pt) => pt.tags?.name) || [];
          return { ...p, tags: ptags, interaction_at: interactionTimes.get(p.id) || p.created_at };
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
      }
    } else {
      setBookmarkedPosts([]);
      setBookmarkedSeriesList([]);
    }
    setLoading(false);
  };

  const loadSeries = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("series")
      .select("id, name, cover_url, description, series_type, tags, status, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (data) {
      const raw = data as unknown as SeriesInfo[];
      const seen = new Set<string>();
      const deduped = raw.filter((s) => {
        if (seen.has(s.name)) return false;
        seen.add(s.name);
        return true;
      });

      const seriesWithChapters = await Promise.all(deduped.map(async (s) => {
        const { data: chapters, count } = await supabase
          .from("posts")
          .select("id, title, content, chapter_number, created_at", { count: "exact" })
          .eq("series_name", s.name)
          .eq("post_type", "serial")
          .eq("status", "published")
          .order("chapter_number", { ascending: false })
          .limit(1);

        const latest = chapters && chapters.length > 0 ? chapters[0] as Record<string, unknown> : null;
        const stats = await loadSeriesStats(supabase, s.name);
        return {
          ...s,
          ...stats,
          latestChapterId: latest ? latest.id as string : null,
          latestChapterNumber: latest ? latest.chapter_number as number : null,
          latestChapterTitle: latest ? latest.title as string : null,
          latestChapterContent: latest ? stripMarkdown((latest.content as string) || "") || null : null,
          latestChapterCreatedAt: latest ? latest.created_at as string : null,
          totalChapters: count || 0,
        };
      }));

      setSeriesList(seriesWithChapters);
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
    // Also load current user's following IDs for the followers tab
    const { data: myFollowing } = await supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", user.id);
    const myFollowingSet = new Set((myFollowing || []).map((f: Record<string, unknown>) => f.following_id as string));
    setFollowingIds(myFollowingSet);

    const { data: fData } = await supabase
      .from("follows")
      .select("follower_id, created_at, profiles!follows_follower_id_fkey(id, nickname, avatar_url, bio)")
      .eq("following_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
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
    loadStats();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (tab === "works") { loadPosts(); loadSeries(); }
    else if (tab === "likes") loadLikes();
    else if (tab === "bookmarks") loadBookmarks();
    else if (tab === "following") loadFollowing();
    else if (tab === "followers") loadFollowers();
  }, [user, tab, filter]);

  const displayName = profile?.nickname || user?.email?.split("@")[0] || "用户";
  const avatarChar = profile?.nickname?.[0] || user?.email?.[0] || "?";

  // 与创作中心“总作品数”保持一致：普通作品 + 去重后的长篇连载。
  // 章节本身不单独计数，草稿和未过审作品也沿用创作中心的总数口径。
  const workCount = allPosts.filter((p) => {
    const cp = p as unknown as Record<string, unknown>;
    return cp.post_type !== "serial";
  }).length + seriesList.length;

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
        {/* Profile Section */}
        {loading ? <SkeletonProfileSection /> : <section className="profile-section">
          <div className="profile-avatar">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt={displayName} />
            ) : (
              <DefaultAvatar name={displayName} style={{ width: "100%", height: "100%" }} />
            )}
          </div>
          <div className="profile-info">
            <h1 className="profile-name">{displayName}</h1>
            <p className="profile-bio">{profile?.bio || "这个人很懒，什么都没写"}</p>
            <div className="profile-stats">
              <div className="profile-stat">
                <i className="fa-solid fa-book"></i>
                <span>作品数</span>
                <span className="stat-value">{workCount}</span>
              </div>
              <div className="profile-stat">
                <i className="fa-regular fa-heart"></i>
                <span>喜欢数</span>
                <span className="stat-value">{likeCount}</span>
              </div>
              <div className="profile-stat">
                <i className="fa-solid fa-bookmark"></i>
                <span>收藏数</span>
                <span className="stat-value">{bookmarkCount}</span>
              </div>
              <div className="profile-stat">
                <i className="fa-solid fa-user-group"></i>
                <span>关注数</span>
                <span className="stat-value">{followingCount}</span>
              </div>
              <div className="profile-stat">
                <i className="fa-solid fa-users"></i>
                <span>粉丝数</span>
                <span className="stat-value">{followerCount}</span>
              </div>
            </div>
          </div>
          <div className="profile-actions">
            <Link href="/profile/edit" className="btn-edit-profile">
              <i className="fa-solid fa-pen-to-square"></i> 编辑资料
            </Link>
          </div>
        </section>}

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
            <SkeletonProfile />
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
            <SkeletonProfile />
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
            <SkeletonProfile />
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
            <p className="text-sm text-muted text-center py-8">加载中...</p>
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
                  <UserCard key={u.id} user={u} currentUserId={user.id} isFollowingTab={true} onUpdate={() => { loadFollowing(); loadStats(); }} />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Tab: Followers */}
        <div className={`tab-content${tab === "followers" ? " active" : ""}`}>
          {tabLoading ? (
            <p className="text-sm text-muted text-center py-8">加载中...</p>
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
                  <UserCard key={u.id} user={u} currentUserId={user.id} isFollowingTab={false} isFollowed={followingIds.has(u.id)} onUpdate={() => { loadFollowers(); loadStats(); }} />
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
