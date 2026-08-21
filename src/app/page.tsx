"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import PostCard from "@/components/PostCard";
import SerialPostCard from "@/components/SerialPostCard";
import type { SerialPostCardData } from "@/components/SerialPostCard";
import HomeSidebar from "@/components/HomeSidebar";
import { createClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/AuthProvider";
import { SkeletonFeed, SkeletonHome } from "@/components/Skeleton";
import EmptyState from "@/components/EmptyState";
import type { Post } from "@/lib/types";

type TabType = "following" | "myTags" | "hot24";

interface TagItem {
  name: string;
  post_count: number;
}

export default function HomePage() {
  const supabase = createClient();
  const { user, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<TabType>("following");
  const [posts, setPosts] = useState<Post[]>([]);
  const [serialCards, setSerialCards] = useState<SerialPostCardData[]>([]);
  const [followedTags, setFollowedTags] = useState<TagItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [hasNewPosts, setHasNewPosts] = useState(false);
  const [requestTimedOut, setRequestTimedOut] = useState(false);
  const latestPostTimeRef = useRef<string>("");
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkNewPosts = useCallback(async () => {
    if (!latestPostTimeRef.current) return;
    let query = supabase
      .from("posts")
      .select("id, created_at")
      .eq("status", "published")
      .gt("created_at", latestPostTimeRef.current);

    let bookmarkedSeriesNames: string[] = [];
    if (tab === "following" && user) {
      const [{ data: follows }, { data: bookmarks }] = await Promise.all([
        supabase.from("follows").select("following_id").eq("follower_id", user.id),
        supabase.from("bookmarks").select("post_id").eq("user_id", user.id),
      ]);
      const followingIds = [user.id];
      if (follows) {
        for (const f of follows) {
          followingIds.push((f as Record<string, unknown>).following_id as string);
        }
      }
      query = query.in("user_id", followingIds);
      const bookmarkedPostIds = [...new Set((bookmarks || []).map((bookmark) => bookmark.post_id as string).filter(Boolean))];
      if (bookmarkedPostIds.length > 0) {
        const { data: bookmarkedPosts } = await supabase
          .from("posts")
          .select("series_name, post_type, chapter_number")
          .in("id", bookmarkedPostIds)
          .eq("status", "published");
        bookmarkedSeriesNames = [...new Set((bookmarkedPosts || [])
          .filter((post) => post.post_type === "serial" && post.chapter_number && post.series_name)
          .map((post) => post.series_name as string))];
      }
    }

    const { data: newPosts } = await query.limit(1);
    if (newPosts && newPosts.length > 0) {
      setHasNewPosts(true);
      return;
    }
    if (tab === "following" && bookmarkedSeriesNames.length > 0) {
      const { data: newSeriesPosts } = await supabase
        .from("posts")
        .select("id, created_at")
        .eq("status", "published")
        .gt("created_at", latestPostTimeRef.current)
        .in("series_name", bookmarkedSeriesNames)
        .limit(1);
      if (newSeriesPosts && newSeriesPosts.length > 0) setHasNewPosts(true);
    }
  }, [supabase, tab, user, latestPostTimeRef]);

  useEffect(() => {
    if (tab === "myTags") {
      loadFollowedTags();
    } else {
      loadPosts();
    }
  }, [tab, user]);

  useEffect(() => {
    if (tab === "myTags") return;
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(() => {
      checkNewPosts();
    }, 30000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [tab, checkNewPosts]);

  const handleRefresh = () => {
    setHasNewPosts(false);
    loadPosts();
  };

  const loadPosts = async () => {
    setLoading(true);
    setError("");

    const postSelect = `id, user_id, title, content, cover_url, word_count, post_type, created_at, series_name, chapter_number,
         author:profiles!posts_user_id_fkey(nickname, avatar_url),
         post_tags(tags(name))`;

    // Batch 1：互不依赖的旁路查询并行发出。Supabase 为跨区访问，单次请求约 1s，
    // 串行 await 会成倍拖长骨架屏，先把这几条查出来再据此组合主查询。
    const needsFollow = tab === "following";
    const blockedPromise = user
      ? supabase.from("blocked_users").select("blocked_user_id").eq("user_id", user.id)
      : Promise.resolve({ data: [] as unknown[] });
    const followsPromise = needsFollow && user
      ? supabase.from("follows").select("following_id").eq("follower_id", user.id)
      : Promise.resolve({ data: [] as unknown[] });
    const bookmarksPromise = needsFollow && user
      ? supabase.from("bookmarks").select("post_id").eq("user_id", user.id)
      : Promise.resolve({ data: [] as unknown[] });

    const [{ data: blockedRows }, { data: follows }, { data: bookmarks }] = await Promise.all([
      blockedPromise,
      followsPromise,
      bookmarksPromise,
    ]);

    if (needsFollow && !user) {
      setPosts([]);
      setSerialCards([]);
      setLoading(false);
      return;
    }

    const blockedIds = new Set((blockedRows || []).map((row) => (row as Record<string, unknown>).blocked_user_id as string));

    let query = supabase
      .from("posts")
      .select(postSelect)
      .eq("status", "published");

    let rawArr: Record<string, unknown>[] = [];
    let bookmarkedSeriesNames: string[] = [];

    if (needsFollow) {
      const followingIds = (follows || []).map((f) => (f as Record<string, unknown>).following_id as string);
      followingIds.push(user!.id);
      query = query.in("user_id", followingIds);

      const bookmarkedPostIds = [...new Set((bookmarks || []).map((bm) => (bm as Record<string, unknown>).post_id as string).filter(Boolean))];
      // Batch 2：主 feed 查询与收藏作品解析并行（二者只依赖 Batch 1 结果）
      const bookmarkedPostsPromise = bookmarkedPostIds.length > 0
        ? supabase.from("posts").select("id, series_name, post_type, chapter_number").in("id", bookmarkedPostIds).eq("status", "published")
        : Promise.resolve({ data: [] as unknown[] });

      const [{ data: rawPosts, error: err }, { data: bookmarkedPosts }] = await Promise.all([
        query.order("created_at", { ascending: false }).limit(50),
        bookmarkedPostsPromise,
      ]);
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      rawArr = (rawPosts || []) as unknown as Record<string, unknown>[];
      bookmarkedSeriesNames = [...new Set((bookmarkedPosts || [])
        .filter((p) => (p as Record<string, unknown>).post_type === "serial" && (p as Record<string, unknown>).chapter_number && (p as Record<string, unknown>).series_name)
        .map((p) => (p as Record<string, unknown>).series_name as string))];
    } else {
      const { data: rawPosts, error: err } = await query.order("created_at", { ascending: false }).limit(50);
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      rawArr = (rawPosts || []) as unknown as Record<string, unknown>[];
    }

    // Batch 3：关注里收藏的连载系列补全（依赖 Batch 2 解析出的 series 名）
    if (bookmarkedSeriesNames.length > 0) {
      const { data: bookmarkedSeriesPosts } = await supabase
        .from("posts")
        .select(postSelect)
        .in("series_name", bookmarkedSeriesNames)
        .eq("status", "published");
      const merged = new Map<string, Record<string, unknown>>();
      for (const post of rawArr) merged.set(post.id as string, post);
      for (const post of (bookmarkedSeriesPosts || []) as unknown as Record<string, unknown>[]) merged.set(post.id as string, post);
      rawArr = [...merged.values()];
    }

    // 屏蔽关系对发现页统一生效，避免被屏蔽用户的作品从推荐或关注内容中重新出现。
    rawArr = rawArr.filter((post) => !blockedIds.has(post.user_id as string));

    rawArr.sort((a, b) => new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime());
    const limitedRawArr = rawArr.slice(0, 50);

    if (limitedRawArr.length === 0) {
      setPosts([]);
      setSerialCards([]);
      setLoading(false);
      return;
    }

    const normalPosts: Record<string, unknown>[] = [];
    const serialChapters: Record<string, unknown>[] = [];

    for (const p of limitedRawArr) {
      if (p.post_type === "serial" && p.chapter_number && (p.chapter_number as number) > 0) {
        serialChapters.push(p);
      } else {
        normalPosts.push(p);
      }
    }

    // Batch 4：作品统计与系列元数据并行（互不依赖）
    const allIds = limitedRawArr.map((p) => p.id as string);
    const seriesNames = [...new Set(serialChapters.map((ch) => ch.series_name as string).filter(Boolean))];
    const statsPromise = supabase
      .from("post_stats")
      .select("id, like_count, comment_count, bookmark_count")
      .in("id", allIds);
    const seriesPromise = seriesNames.length > 0
      ? supabase.from("series").select("name, description, cover_url, tags, status, series_type").in("name", seriesNames)
      : Promise.resolve({ data: [] as unknown[] });

    const [{ data: stats }, { data: seriesData }] = await Promise.all([statsPromise, seriesPromise]);
    const statsMap = new Map<string, { like_count: number; comment_count: number; bookmark_count: number }>();
    if (stats) for (const s of stats as Array<Record<string, unknown>>) {
      statsMap.set(s.id as string, {
        like_count: s.like_count as number,
        comment_count: s.comment_count as number,
        bookmark_count: s.bookmark_count as number,
      });
    }

    const formatted: Post[] = normalPosts.map((p) => {
      const ptags = (p.post_tags as Array<{ tags: { name: string } }> | undefined)?.map((pt) => pt.tags?.name) || [];
      const author = p.author as { nickname: string; avatar_url: string | null } | null;
      const content = (p.content as string) || "";
      const st = statsMap.get(p.id as string) || { like_count: 0, comment_count: 0, bookmark_count: 0 };
      const plainText = content
        .replace(/!\[.*?\]\(.*?\)/g, "")
        .replace(/\[([^\]]*)\]\(.*?\)/g, "$1")
        .replace(/[*_~`#>|-]/g, "")
        .replace(/\n+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const imgMatches = content.matchAll(/!\[.*?\]\((.*?)\)/g);
      const extractedImages = [...imgMatches].map((m) => m[1]);

      return {
        id: p.id as string,
        title: (p.title as string) || "无标题",
        content: content,
        cover_url: p.cover_url as string | null,
        word_count: p.word_count as number,
        created_at: p.created_at as string,
        user_id: p.user_id as string,
        series_name: p.series_name as string | null,
        chapter_number: p.chapter_number as number | null,
        tags: ptags,
        author: { nickname: author?.nickname || "匿名用户", avatar_url: author?.avatar_url },
        excerpt: plainText,
        images: extractedImages.length > 0 ? extractedImages : undefined,
        like_count: st.like_count,
        comment_count: st.comment_count,
        bookmark_count: st.bookmark_count,
        time_ago: getTimeAgo(p.created_at as string),
      };
    });

    const seriesMap = new Map<string, Record<string, unknown>[]>();
    for (const ch of serialChapters) {
      const sn = ch.series_name as string;
      if (!sn) continue;
      if (!seriesMap.has(sn)) seriesMap.set(sn, []);
      seriesMap.get(sn)!.push(ch);
    }

    const seriesMeta = new Map<string, Record<string, unknown>>();
    if (seriesData) {
      for (const s of seriesData as Record<string, unknown>[]) {
        seriesMeta.set(s.name as string, s);
      }
    }

    const serialCardList: SerialPostCardData[] = [];
    for (const [sn, chapters] of seriesMap) {
      chapters.sort((a, b) => (b.chapter_number as number) - (a.chapter_number as number));
      const latest = chapters[0];
      const meta = seriesMeta.get(sn) || {};
      const author = latest.author as { nickname: string; avatar_url: string | null } | null;
      const st = statsMap.get(latest.id as string) || { like_count: 0, comment_count: 0, bookmark_count: 0 };

      serialCardList.push({
        chapterId: latest.id as string,
        chapterTitle: (latest.title as string) || "无标题",
        chapterNumber: latest.chapter_number as number,
        content: (latest.content as string) || "",
        seriesName: sn,
        seriesDescription: (meta.description as string) || "",
        seriesCover: (meta.cover_url as string) || null,
        seriesTags: (meta.tags as string[]) || [],
        seriesStatus: (meta.status as string) || "ongoing",
        seriesType: (meta.series_type as string) || "fanfic",
        authorId: latest.user_id as string,
        authorNickname: author?.nickname || "匿名用户",
        authorAvatar: author?.avatar_url || null,
        likeCount: st.like_count,
        commentCount: st.comment_count,
        bookmarkCount: st.bookmark_count,
        createdAt: latest.created_at as string,
      });
    }

    if (tab === "hot24") {
      formatted.sort((a, b) => {
        const heatA = (a.like_count || 0) + (a.comment_count || 0) + (a.bookmark_count || 0);
        const heatB = (b.like_count || 0) + (b.comment_count || 0) + (b.bookmark_count || 0);
        return heatB - heatA;
      });
      serialCardList.sort((a, b) => {
        const heatA = a.likeCount + a.commentCount + a.bookmarkCount;
        const heatB = b.likeCount + b.commentCount + b.bookmarkCount;
        return heatB - heatA;
      });
    }

    setPosts(formatted);
    setSerialCards(serialCardList);
    setHasNewPosts(false);
    setLoading(false);

    if (formatted.length > 0 || serialCardList.length > 0) {
      const times: string[] = [];
      if (formatted.length > 0 && formatted[0].created_at) times.push(formatted[0].created_at);
      if (serialCardList.length > 0 && serialCardList[0].createdAt) times.push(serialCardList[0].createdAt);
      times.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
      if (times.length > 0) latestPostTimeRef.current = times[0];
    }
  };

  const loadFollowedTags = async () => {
    // 切换到“关注标签”时要先进入加载态，避免旧的空数组被误判为空状态。
    setLoading(true);
    setError("");
    if (!user) {
      setLoading(false);
      return;
    }
    const { data: follows } = await supabase.from("tag_follows").select("tag_id").eq("user_id", user.id);
    if (!follows || follows.length === 0) { setFollowedTags([]); setLoading(false); return; }

    const tagIds = [...new Set((follows as Array<Record<string, unknown>>).map((f) => f.tag_id as string))];
    // tags 与 post_tags 都只依赖 tagIds，可并行，避免跨区串行多耗一轮 ~1s
    const [{ data: tagsData }, { data: rawCounts }] = await Promise.all([
      supabase.from("tags").select("id, name").in("id", tagIds),
      supabase.from("post_tags").select("tag_id, post_id").in("tag_id", tagIds),
    ]);
    const tagNames = (tagsData || []).map((t: Record<string, unknown>) => t.name as string);

    const postIds = [...new Set((rawCounts || []).map((r: Record<string, unknown>) => r.post_id as string))];
    let validPostIds = new Set<string>();
    if (postIds.length > 0) {
      const { data: posts } = await supabase
        .from("posts")
        .select("id, post_type, chapter_number")
        .in("id", postIds)
        .eq("status", "published");
      validPostIds = new Set((posts || []).filter((p: Record<string, unknown>) => {
        return !(p.post_type === "serial" && p.chapter_number && (p.chapter_number as number) > 0);
      }).map((p: Record<string, unknown>) => p.id as string));
    }

    const countMap = new Map<string, number>();
    for (const r of (rawCounts || []) as Array<Record<string, unknown>>) {
      const pid = r.post_id as string;
      if (!validPostIds.has(pid)) continue;
      const tid = r.tag_id as string;
      const tagName = tagsData?.find((t: Record<string, unknown>) => t.id === tid)?.name as string;
      if (tagName) countMap.set(tagName, (countMap.get(tagName) || 0) + 1);
    }

    const items: TagItem[] = tagNames.map((n) => ({
      name: n,
      post_count: countMap.get(n) || 0,
    }));
    setFollowedTags(items);
    setLoading(false);
  };

  const loadMore = () => {
    setHasMore(false);
  };

  const tabs: { key: TabType; label: string }[] = [
    { key: "following", label: "关注" },
    { key: "myTags", label: "标签" },
    { key: "hot24", label: "发现" },
  ];

  const hasContent = posts.length > 0 || serialCards.length > 0;
  const waitingForFeed = authLoading || loading;
  const feedLoading = waitingForFeed && !requestTimedOut;
  useEffect(() => {
    if (!waitingForFeed) return;
    const timeoutId = window.setTimeout(() => {
      setRequestTimedOut(true);
      setLoading(false);
      setError("数据服务连接超时，请检查 Supabase 配置或网络后重试。");
    }, 8000);
    return () => window.clearTimeout(timeoutId);
  }, [waitingForFeed]);
  const sortedFeedItems = [
    ...serialCards.map((card) => ({ type: "serial" as const, createdAt: card.createdAt, card })),
    ...posts.map((post) => ({ type: "post" as const, createdAt: post.created_at || "", post })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="min-h-screen bg-paper pb-20 lg:pb-0">
      {/* V2: main container with sidebar + content */}
      <div className="main-container">
        {/* V2: sidebar on left */}
        <HomeSidebar />

        {/* V2: content area */}
        <div className="content-area">
          {/* V2: sticky tabs inside content area */}
          <div className="tabs-wrapper">
            <div className="tabs-inner">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  className={`tab-btn ${tab === t.key ? "active" : ""}`}
                  onClick={() => setTab(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* 关注作品 Feed */}
          <div className="feed" id="feed-works" style={{ display: tab === "following" ? undefined : "none" }}>
            {authLoading ? (
              <SkeletonHome />
            ) : !user ? (
              <div className="feed-empty-state">
                <div className="feed-empty-illustration">
                  <div className="feed-empty-tag-ring">
                    <div className="feed-empty-ring-outer"></div>
                    <div className="feed-empty-ring-inner">
                      <i className="fa-solid fa-feather-pointed"></i>
                    </div>
                  </div>
                </div>
                <h2 className="feed-empty-title">登录后查看关注作品</h2>
                <p className="feed-empty-desc">登录后关注你喜欢的创作者，这里将显示他们的最新作品</p>
                <Link href="/login" className="feed-empty-action">登录</Link>
                <Link href="/register" className="feed-empty-register">还没有账号？立即注册 →</Link>
              </div>
            ) : (
              <>
                {hasNewPosts && (
                  <button
                    onClick={handleRefresh}
                    className="w-full py-2.5 px-4 rounded-xl bg-accent/10 border border-accent/30 text-accent text-sm font-medium hover:bg-accent/20 transition-colors flex items-center justify-center gap-2"
                  >
                    <i className="fa-solid fa-arrow-rotate-right" />
                    有新作品发布，点击查看
                  </button>
                )}
                {feedLoading ? (
                  <SkeletonFeed />
                ) : hasContent ? (
                  <>
                    {sortedFeedItems.map((item) => item.type === "serial" ? (
                      <SerialPostCard key={item.card.chapterId} data={item.card} />
                    ) : (
                      <PostCard key={item.post.id} post={item.post} />
                    ))}
                  </>
                ) : (
                  <EmptyState
                    icon={error ? "fa-triangle-exclamation" : "fa-feather-pointed"}
                    title={error ? `数据加载失败: ${error}` : "还没有关注任何作品"}
                    description={error ? undefined : "关注你喜欢的创作者，这里将显示他们的最新作品"}
                    actionLabel={error ? undefined : "去发现创作者"}
                    actionHref={error ? undefined : "/search"}
                  />
                )}
                {hasMore ? (
                  <div className="text-center py-6">
                    <button className="btn-ghost text-sm" onClick={loadMore}>
                      <i className="fa-solid fa-chevron-down mr-1" />
                      加载更多
                    </button>
                  </div>
                ) : hasContent ? (
                  <div className="feed-end">已经到达最底端</div>
                ) : null}
              </>
            )}
          </div>

          {/* 关注标签 Feed */}
          <div className="feed" id="feed-tags" style={{ display: tab === "myTags" ? undefined : "none" }}>
            {authLoading ? (
              <SkeletonHome />
            ) : !user ? (
              <div className="feed-empty-state">
                <div className="feed-empty-illustration">
                  <div className="feed-empty-tag-ring">
                    <div className="feed-empty-ring-outer"></div>
                    <div className="feed-empty-ring-inner">
                      <i className="fa-solid fa-tag"></i>
                    </div>
                  </div>
                </div>
                <h2 className="feed-empty-title">登录后查看关注标签</h2>
                <p className="feed-empty-desc">登录后关注你感兴趣的标签，这里将展示相关的最新作品动态</p>
                <Link href="/login" className="feed-empty-action">登录</Link>
                <Link href="/register" className="feed-empty-register">还没有账号？立即注册 →</Link>
              </div>
            ) : (
              <>
                {feedLoading ? (
                  <SkeletonFeed />
                ) : followedTags.length === 0 ? (
                  <EmptyState
                    icon="fa-tags"
                    title="还没有关注任何标签"
                    description="关注你感兴趣的标签，这里将展示相关的最新作品动态"
                    actionLabel="去发现标签"
                    actionHref="/search"
                  />
                ) : (
                  <div className="tags-grid">
                    {followedTags.map((tag) => (
                      <a
                        key={tag.name}
                        href={`/tag/${encodeURIComponent(tag.name)}`}
                        className="tag-card-item"
                      >
                        <span className="tag-icon"><i className="fa-solid fa-tag"></i></span>
                        <span className="tag-name">{tag.name}</span>
                        <span className="tag-count">{tag.post_count} 篇作品</span>
                      </a>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* 发现作品 Feed */}
          <div className="feed" id="feed-hot" style={{ display: tab === "hot24" ? undefined : "none" }}>
            {feedLoading ? (
              <SkeletonFeed />
            ) : hasContent ? (
              <>
                {serialCards.map((card) => (
                  <SerialPostCard key={card.chapterId} data={card} />
                ))}
                {posts.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </>
            ) : (
              <EmptyState
                icon={error ? "fa-triangle-exclamation" : "fa-feather-pointed"}
                title={error ? `数据加载失败: ${error}` : "还没有任何作品"}
                description={error ? undefined : "创建你的第一个作品，开始创作之旅"}
                actionLabel={error ? undefined : "创建作品"}
                actionHref={error ? undefined : "/studio"}
              />
            )}
            {hasMore ? (
              <div className="text-center py-6">
                <button className="btn-ghost text-sm" onClick={loadMore}>
                  <i className="fa-solid fa-chevron-down mr-1" />
                  加载更多
                </button>
              </div>
            ) : hasContent ? (
              <div className="feed-end">已经到达最底端</div>
            ) : null}
          </div>
        </div>
      </div>

      </div>
  );
}

function getTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)} 天前`;
  return new Date(dateStr).toLocaleDateString("zh-CN");
}
