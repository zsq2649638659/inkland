"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import PostCard from "@/components/PostCard";
import SerialPostCard from "@/components/SerialPostCard";
import type { SerialPostCardData } from "@/components/SerialPostCard";
import HomeSidebar from "@/components/HomeSidebar";
import MobileNav from "@/components/MobileNav";
import { createClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/AuthProvider";
import { SkeletonCardList } from "@/components/Skeleton";
import EmptyState from "@/components/EmptyState";
import type { Post } from "@/lib/types";

type TabType = "following" | "myTags" | "hot24";

interface TagItem {
  name: string;
  post_count: number;
}

export default function HomePage() {
  const supabase = createClient();
  const { user } = useAuth();
  const [tab, setTab] = useState<TabType>("following");
  const [posts, setPosts] = useState<Post[]>([]);
  const [serialCards, setSerialCards] = useState<SerialPostCardData[]>([]);
  const [followedTags, setFollowedTags] = useState<TagItem[]>([]);
  const [tagsViewMode, setTagsViewMode] = useState<"grid" | "list">("grid");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(true);
  const [hasNewPosts, setHasNewPosts] = useState(false);
  const latestPostTimeRef = useRef<string>("");
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkNewPosts = useCallback(async () => {
    if (!latestPostTimeRef.current) return;
    let query = supabase
      .from("posts")
      .select("id, created_at")
      .eq("status", "published")
      .gt("created_at", latestPostTimeRef.current);

    if (tab === "following" && user) {
      const { data: follows } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", user.id);
      const followingIds = [user.id];
      if (follows) {
        for (const f of follows) {
          followingIds.push((f as Record<string, unknown>).following_id as string);
        }
      }
      query = query.in("user_id", followingIds);
    }

    const { data: newPosts } = await query.limit(1);
    if (newPosts && newPosts.length > 0) {
      setHasNewPosts(true);
    }
  }, [supabase, tab, user, latestPostTimeRef]);

  useEffect(() => {
    if (tab === "myTags") {
      loadFollowedTags();
    } else {
      loadPosts();
    }
  }, [tab, user]);

  // 轮询新作品
  useEffect(() => {
    if (tab === "myTags") return;
    // 清除旧轮询
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

    let query = supabase
      .from("posts")
      .select(
        `id, title, content, cover_url, word_count, post_type, created_at, series_name, chapter_number,
         user_id,
         author:profiles!posts_user_id_fkey(nickname, avatar_url),
         post_tags(tags(name))`
      )
      .eq("status", "published");

    if (tab === "following") {
      if (user) {
        const { data: follows } = await supabase
          .from("follows")
          .select("following_id")
          .eq("follower_id", user.id);
        const followingIds = [user.id];
        if (follows) {
          for (const f of follows) {
            followingIds.push((f as Record<string, unknown>).following_id as string);
          }
        }
        query = query.in("user_id", followingIds);
      } else {
        setPosts([]);
        setSerialCards([]);
        setLoading(false);
        return;
      }
      query = query.order("created_at", { ascending: false });
    } else if (tab === "hot24") {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      query = query.gte("created_at", since).order("created_at", { ascending: false });
    }

    query = query.limit(50);

    const { data: rawPosts, error: err } = await query;

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    if (!rawPosts || rawPosts.length === 0) {
      setPosts([]);
      setSerialCards([]);
      setLoading(false);
      return;
    }

    const rawArr = rawPosts as unknown as Record<string, unknown>[];

    // 分离：普通帖子 vs 连载章节
    const normalPosts: Record<string, unknown>[] = [];
    const serialChapters: Record<string, unknown>[] = [];

    for (const p of rawArr) {
      if (p.post_type === "serial" && p.chapter_number && (p.chapter_number as number) > 0) {
        serialChapters.push(p);
      } else {
        normalPosts.push(p);
      }
    }

    // 统计数据
    const allIds = rawArr.map((p) => p.id as string);
    const { data: stats } = await supabase
      .from("post_stats")
      .select("id, like_count, comment_count, bookmark_count")
      .in("id", allIds);
    const statsMap = new Map<string, { like_count: number; comment_count: number; bookmark_count: number }>();
    if (stats) for (const s of stats as Array<Record<string, unknown>>) {
      statsMap.set(s.id as string, {
        like_count: s.like_count as number,
        comment_count: s.comment_count as number,
        bookmark_count: s.bookmark_count as number,
      });
    }

    // 格式化普通帖子
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
        excerpt: plainText.length > 150 ? plainText.slice(0, 150) + "..." : plainText,
        images: extractedImages.length > 0 ? extractedImages : undefined,
        like_count: st.like_count,
        comment_count: st.comment_count,
        bookmark_count: st.bookmark_count,
        time_ago: getTimeAgo(p.created_at as string),
      };
    });

    // 格式化连载卡片：按 series_name 分组，取每个系列的最新章节
    const seriesMap = new Map<string, Record<string, unknown>[]>();
    for (const ch of serialChapters) {
      const sn = ch.series_name as string;
      if (!sn) continue;
      if (!seriesMap.has(sn)) seriesMap.set(sn, []);
      seriesMap.get(sn)!.push(ch);
    }

    // 加载 series 元数据
    const seriesNames = [...seriesMap.keys()];
    const { data: seriesData } = await supabase
      .from("series")
      .select("name, description, cover_url, tags, status, series_type")
      .in("name", seriesNames);

    const seriesMeta = new Map<string, Record<string, unknown>>();
    if (seriesData) {
      for (const s of seriesData as Record<string, unknown>[]) {
        seriesMeta.set(s.name as string, s);
      }
    }

    const serialCardList: SerialPostCardData[] = [];
    for (const [sn, chapters] of seriesMap) {
      // 取最新章节（按 chapter_number 降序）
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

    // 记录最新作品时间
    if (formatted.length > 0 || serialCardList.length > 0) {
      const times: string[] = [];
      if (formatted.length > 0 && formatted[0].created_at) times.push(formatted[0].created_at);
      if (serialCardList.length > 0 && serialCardList[0].createdAt) times.push(serialCardList[0].createdAt);
      times.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
      if (times.length > 0) latestPostTimeRef.current = times[0];
    }
  };

  const loadFollowedTags = async () => {
    if (!user) return;
    const { data: follows } = await supabase.from("tag_follows").select("tag_id").eq("user_id", user.id);
    if (!follows || follows.length === 0) { setFollowedTags([]); setLoading(false); return; }

    const tagIds = [...new Set((follows as Array<Record<string, unknown>>).map((f) => f.tag_id as string))];
    const { data: tagsData } = await supabase.from("tags").select("id, name").in("id", tagIds);
    const tagNames = (tagsData || []).map((t: Record<string, unknown>) => t.name as string);
    const { data: rawCounts } = await supabase
      .from("post_tags")
      .select("tag_id, post_id")
      .in("tag_id", tagIds);

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
    { key: "following", label: "关注作品" },
    { key: "myTags", label: "关注标签" },
    { key: "hot24", label: "24小时热榜" },
  ];

  const hasContent = posts.length > 0 || serialCards.length > 0;

  return (
    <div className="min-h-screen bg-paper">
      <div className="max-w-6xl mx-auto px-4 pt-4 pb-2 flex items-center border-b border-rule">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`tab-link ${tab === t.key ? "active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <main className="max-w-6xl mx-auto px-4 pt-12 pb-8">
        <div className="flex gap-6">
          {tab === "myTags" ? (
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-warm">我关注的标签</h2>
                <div className="flex border border-rule rounded-lg overflow-hidden">
                  <button
                    className={`px-2 py-1.5 text-xs ${tagsViewMode === "grid" ? "bg-accent text-white" : "text-muted bg-white"}`}
                    onClick={() => setTagsViewMode("grid")}
                  >
                    <i className="fa-solid fa-grip" />
                  </button>
                  <button
                    className={`px-2 py-1.5 text-xs ${tagsViewMode === "list" ? "bg-accent text-white" : "text-muted bg-white"}`}
                    onClick={() => setTagsViewMode("list")}
                  >
                    <i className="fa-solid fa-list" />
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <SkeletonCardList key={i} />
                  ))}
                </div>
              ) : followedTags.length === 0 ? (
                <EmptyState
                  icon="fa-tags"
                  title="还没有关注任何标签"
                  description="去标签详情页关注感兴趣的标签吧，关注后首页会推送相关作品"
                />
              ) : tagsViewMode === "grid" ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {followedTags.map((tag) => (
                    <a
                      key={tag.name}
                      href={`/tag/${encodeURIComponent(tag.name)}`}
                      className="block p-4 rounded-xl bg-white border border-rule no-underline hover:border-accent hover:shadow-sm transition-all text-center"
                    >
                      <i className="fa-solid fa-tag text-accent text-xl mb-2 block" />
                      <div className="font-semibold text-sm text-warm truncate">{tag.name}</div>
                      <div className="text-xs text-muted mt-1">{tag.post_count} 篇作品</div>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {followedTags.map((tag) => (
                    <a
                      key={tag.name}
                      href={`/tag/${encodeURIComponent(tag.name)}`}
                      className="flex items-center gap-3 p-3 rounded-xl bg-white border border-rule no-underline hover:border-accent transition-colors"
                    >
                      <i className="fa-solid fa-tag text-accent" />
                      <span className="text-sm font-medium text-warm flex-1">{tag.name}</span>
                      <span className="text-xs text-muted">{tag.post_count} 篇</span>
                      <i className="fa-solid fa-chevron-right text-xs text-muted" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 min-w-0 space-y-4">
              {hasNewPosts && (
                <button
                  onClick={handleRefresh}
                  className="w-full py-2.5 px-4 rounded-xl bg-accent/10 border border-accent/30 text-accent text-sm font-medium hover:bg-accent/20 transition-colors flex items-center justify-center gap-2"
                >
                  <i className="fa-solid fa-arrow-rotate-right" />
                  有新作品发布，点击查看
                </button>
              )}
              {loading ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <SkeletonCardList key={i} />
                  ))}
                </div>
              ) : hasContent ? (
                <>
                  {/* 连载章节卡片 */}
                  {serialCards.map((card) => (
                    <SerialPostCard key={card.chapterId} data={card} />
                  ))}
                  {/* 普通帖子 */}
                  {posts.map((post) => (
                    <PostCard key={post.id} post={post} />
                  ))}
                </>
              ) : (
                <EmptyState
                  icon={error ? "fa-triangle-exclamation" : "fa-feather-pointed"}
                  title={error ? `数据加载失败: ${error}` : tab === "following" ? "还没有关注任何作者" : "暂无作品"}
                  description={error ? undefined : tab === "following" ? "关注一些作者后，他们的新作品会出现在这里" : "成为第一个发布作品的人吧"}
                  actionLabel={error ? undefined : "开始创作"}
                  actionHref={error ? undefined : "/create"}
                />
              )}
              {hasMore ? (
                <div className="text-center py-6">
                  <button className="btn-ghost text-sm" onClick={loadMore}>
                    <i className="fa-solid fa-chevron-down mr-1" />
                    加载更多
                  </button>
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="text-sm text-muted">已经到达最底端</p>
                </div>
              )}
            </div>
          )}

          <HomeSidebar />
        </div>
      </main>

      <MobileNav />
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