"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import PostCard from "@/components/PostCard";
import SerialPostCard from "@/components/SerialPostCard";
import type { SerialPostCardData } from "@/components/SerialPostCard";
import HomeSidebar from "@/components/HomeSidebar";
import { createClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/AuthProvider";
import { SkeletonFeed, SkeletonHome } from "@/components/Skeleton";
import EmptyState from "@/components/EmptyState";
import { loadFeed, type FeedResult } from "@/lib/feed";
import type { Post } from "@/lib/types";

type TabType = "following" | "myTags" | "hot24";

interface TagItem {
  name: string;
  post_count: number;
}

// 信息流客户端缓存：命中即秒开（不闪骨架屏），后台静默刷新。
// 键 = 用户id:tab，避免切换/回切首页时反复重拉。
interface FeedCacheEntry {
  posts: Post[];
  serialCards: SerialPostCardData[];
  at: number;
}
const feedCache = new Map<string, FeedCacheEntry>();

export default function HomePage() {
  const supabase = useMemo(() => createClient(), []);
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
    loadPosts({ force: true });
  };

  // 共享聚合逻辑（浏览器端）：优先走 get_home_feed RPC 单查询（部署后 1 次往返），
  // 否则回落 3 波并行查询。客户端缓存命中时秒开，后台再静默刷新。
  // 优先走 /api/feed 服务端聚合（Vercel 机房内拉取并瘦身，客户端只下载
  // 轻量数据）；本地 dev 或路由异常时安全回落客户端直连。
  const fetchFeed = async (): Promise<FeedResult | null> => {
    try {
      // 未登录时声明匿名，服务端可跳过会话验证往返（匿名数据本就公开，无越权）
      const uParam = user ? "" : "&u=anon";
      const apiResp = await fetch(`/api/feed?tab=${tab}${uParam}`, { credentials: "same-origin" });
      if (apiResp.ok) {
        const json = await apiResp.json();
        if (json && Array.isArray(json.posts)) return json as FeedResult;
      }
    } catch {
      // 本地 dev 的服务端 Supabase TLS 问题等场景：回落直连
    }
    return null;
  };

  const loadPosts = async (opts?: { force?: boolean }) => {
    // 命中缓存：立即秒开（不闪骨架屏），后台照常静默刷新
    const cacheKey = user ? `${user.id}:${tab}` : `anon:${tab}`;
    const hit = !opts?.force ? feedCache.get(cacheKey) : undefined;

    if (hit) {
      setPosts(hit.posts);
      setSerialCards(hit.serialCards);
      setError("");
      setLoading(false);
    } else {
      setLoading(true);
      setError("");
    }

    if (tab === "following" && !user) {
      setPosts([]);
      setSerialCards([]);
      setLoading(false);
      return;
    }

    const res = (await fetchFeed()) ?? (await loadFeed(supabase, { tab, userId: user?.id ?? null }));
    if (res.error) {
      setError(res.error);
      setPosts([]);
      setSerialCards([]);
      setLoading(false);
      return;
    }

    // 后台刷新结果与缓存一致时跳过 setState，避免无谓的全列表重渲染
    const unchanged = hit
      && hit.posts.length === res.posts.length
      && hit.serialCards.length === res.serialCards.length
      && (res.posts.length === 0 || res.posts[0]?.id === hit.posts[0]?.id)
      && (res.serialCards.length === 0 || res.serialCards[0]?.chapterId === hit.serialCards[0]?.chapterId);
    if (!unchanged) {
      setPosts(res.posts);
      setSerialCards(res.serialCards);
    }
    setHasNewPosts(false);
    setLoading(false);
    feedCache.set(cacheKey, { posts: res.posts, serialCards: res.serialCards, at: Date.now() });

    const times: string[] = [];
    if (res.posts.length > 0 && res.posts[0].created_at) times.push(res.posts[0].created_at);
    if (res.serialCards.length > 0 && res.serialCards[0].createdAt) times.push(res.serialCards[0].createdAt);
    times.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    if (times.length > 0) latestPostTimeRef.current = times[0];
  };

  const loadFollowedTags = async () => {
    // 切换到“关注标签”时要先进入加载态，避免旧的空数组被误判为空状态。
    setLoading(true);
    setError("");
    if (!user) {
      setFollowedTags([]);
      setLoading(false);
      return;
    }
    const res = (await fetchFeed()) ?? (await loadFeed(supabase, { tab: "myTags", userId: user.id }));
    if (res.error) {
      setError(res.error);
      setFollowedTags([]);
      setLoading(false);
      return;
    }
    setFollowedTags(res.followedTags);
    setLoading(false);
  };

  const loadMore = () => {
    setHasMore(false);
  };

  // 数据拉取放在挂载/切 tab 的 effect 中，是本项目的常见模式；
  // 初始 loading 态是同步切换，符合交互预期，故关闭该条 react-hooks 规则。
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (tab === "myTags") {
      loadFollowedTags();
    } else {
      loadPosts();
    }
  }, [tab, user]);
  /* eslint-enable react-hooks/set-state-in-effect */

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
                    className="home-refresh-notice"
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
