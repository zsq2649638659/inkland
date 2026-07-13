"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/AuthProvider";
import PostCardGrid from "@/components/PostCardGrid";
import SeriesCardGrid from "@/components/SeriesCardGrid";
import type { Post } from "@/lib/types";

type TagTab = "latest" | "hottest";

interface SeriesEntry {
  id: string;
  name: string;
  cover_url: string | null;
  description: string;
  tags: string[];
  status: string;
  series_type: string;
  created_at: string;
  user_id: string;
  author?: { nickname: string; avatar_url: string | null };
  totalChapters: number;
  latestChapterId: string | null;
  latestChapterNumber: number | null;
  latestChapterTitle: string | null;
  latestChapterCreatedAt: string | null;
}

export default function TagPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params);
  const decodedName = decodeURIComponent(name);
  const supabase = createClient();
  const { user } = useAuth();
  const [standalonePosts, setStandalonePosts] = useState<Post[]>([]);
  const [seriesList, setSeriesList] = useState<SeriesEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tagInfo, setTagInfo] = useState<{ id: string; post_count: number } | null>(null);
  const [tagTab, setTagTab] = useState<TagTab>("latest");
  const [isFollowingTag, setIsFollowingTag] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  useEffect(() => {
    const load = async () => {
      const { data: tag } = await supabase
        .from("tags")
        .select("id, post_count")
        .eq("name", decodedName)
        .single();

      if (!tag) { setLoading(false); return; }

      const tagId = (tag as Record<string, unknown>).id as string;

      // 1. 查询 post_tags 关联的帖子
      const { data: ptData } = await supabase
        .from("post_tags")
        .select("post_id")
        .eq("tag_id", tagId);

      let allPosts: Post[] = [];
      let standalonePostsList: Post[] = [];
      let chapterSeriesNames: Set<string> = new Set();

      if (ptData && ptData.length > 0) {
        const postIds = ptData.map((p: Record<string, unknown>) => p.post_id as string);
        const { data: postsData } = await supabase
          .from("posts")
          .select("id, title, content, word_count, post_type, chapter_number, series_name, created_at, cover_url, user_id, author:profiles!posts_user_id_fkey(nickname, avatar_url), post_tags(tags(name))")
          .in("id", postIds)
          .eq("status", "published");

        if (postsData) {
          // 收集章节帖子所属的系列名
          for (const p of postsData as Array<Record<string, unknown>>) {
            if (p.series_name) {
              chapterSeriesNames.add(p.series_name as string);
            }
          }

          let statsMap: Record<string, { like_count: number; comment_count: number; bookmark_count: number }> = {};
          const ids = postsData.map((p: Record<string, unknown>) => p.id as string);
          const { data: stats } = await supabase
            .from("post_stats")
            .select("id, like_count, comment_count, bookmark_count")
            .in("id", ids);
          if (stats) {
            for (const s of stats as Array<Record<string, unknown>>) {
              statsMap[s.id as string] = {
                like_count: s.like_count as number,
                comment_count: s.comment_count as number,
                bookmark_count: s.bookmark_count as number,
              };
            }
          }

          allPosts = postsData.map((p: Record<string, unknown>) => {
            const a = p.author as { nickname: string; avatar_url: string | null } | null;
            const s = statsMap[p.id as string] || { like_count: 0, comment_count: 0, bookmark_count: 0 };
            const pt = p.post_tags as Array<{ tags: { name: string } }> | null;
            const tagNames = pt ? pt.map((t) => t.tags.name) : [];
            return {
              id: p.id as string, title: (p.title as string) || "无标题",
              content: p.content as string, cover_url: p.cover_url as string | null,
              word_count: p.word_count as number, created_at: p.created_at as string,
              user_id: p.user_id as string,
              author: { nickname: a?.nickname || "匿名用户", avatar_url: a?.avatar_url },
              like_count: s.like_count, comment_count: s.comment_count, bookmark_count: s.bookmark_count,
              tags: tagNames,
            } as Post;
          });

          // 分离：没有 series_name 的是独立帖子，有 series_name 的是连载章节
          standalonePostsList = allPosts.filter((p) => {
            const raw = postsData.find((r: Record<string, unknown>) => r.id === p.id) as Record<string, unknown> | undefined;
            return !raw?.series_name;
          });

          standalonePostsList.sort((a, b) =>
            tagTab === "hottest"
              ? ((b.like_count || 0) + (b.comment_count || 0)) - ((a.like_count || 0) + (a.comment_count || 0))
              : new Date(b.created_at || "").getTime() - new Date(a.created_at || "").getTime()
          );
        }
      }

      // 2. 查询 series 表中 tags 字段包含该标签的系列（补充 chapterSeriesNames）
      const { data: seriesByTag } = await supabase
        .from("series")
        .select("name")
        .contains("tags", [decodedName]);

      const allSeriesNames = new Set(chapterSeriesNames);
      if (seriesByTag) {
        for (const s of seriesByTag as Array<Record<string, unknown>>) {
          allSeriesNames.add(s.name as string);
        }
      }

      // 3. 获取系列详情
      let matchedSeries: SeriesEntry[] = [];
      if (allSeriesNames.size > 0) {
        const { data: seriesData } = await supabase
          .from("series")
          .select("id, name, cover_url, description, tags, status, series_type, created_at, user_id")
          .in("name", [...allSeriesNames]);

        if (seriesData && seriesData.length > 0) {
          const rawSeries = seriesData as unknown as SeriesEntry[];

          const userIds = [...new Set(rawSeries.map((s) => s.user_id))];
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, nickname, avatar_url")
            .in("id", userIds);
          const profileMap: Record<string, { nickname: string; avatar_url: string | null }> = {};
          if (profiles) {
            for (const p of profiles as Array<Record<string, unknown>>) {
              profileMap[p.id as string] = {
                nickname: p.nickname as string,
                avatar_url: p.avatar_url as string | null,
              };
            }
          }

          matchedSeries = await Promise.all(rawSeries.map(async (s) => {
            const { data: chapters, count } = await supabase
              .from("posts")
              .select("id, title, chapter_number, created_at", { count: "exact" })
              .eq("series_name", s.name)
              .eq("post_type", "serial")
              .eq("status", "published")
              .order("chapter_number", { ascending: false })
              .limit(1);

            const latest = chapters && chapters.length > 0 ? chapters[0] as Record<string, unknown> : null;
            return {
              ...s,
              author: profileMap[s.user_id] || { nickname: "匿名用户", avatar_url: null },
              totalChapters: count || 0,
              latestChapterId: latest ? latest.id as string : null,
              latestChapterNumber: latest ? latest.chapter_number as number : null,
              latestChapterTitle: latest ? latest.title as string : null,
              latestChapterCreatedAt: latest ? latest.created_at as string : null,
            };
          }));

          matchedSeries.sort((a, b) =>
            tagTab === "hottest"
              ? b.totalChapters - a.totalChapters
              : new Date(b.created_at || "").getTime() - new Date(a.created_at || "").getTime()
          );
        }
      }

      setStandalonePosts(standalonePostsList);
      setSeriesList(matchedSeries);

      const totalCount = standalonePostsList.length + matchedSeries.length;
      setTagInfo({ id: tagId, post_count: totalCount });

      if (totalCount !== (tag as Record<string, unknown>).post_count) {
        supabase.from("tags").update({ post_count: totalCount }).eq("id", tagId).then(({ error }) => {
          if (error) console.error("更新标签篇数失败:", error);
        });
      }

      if (user) {
        const { data: tf } = await supabase
          .from("tag_follows").select("id").eq("user_id", user.id).eq("tag_id", tagId).single();
        setIsFollowingTag(!!tf);
      }

      setLoading(false);
    };
    load();
  }, [decodedName, supabase, user, tagTab]);

  const handleTagFollow = async () => {
    if (!user || !tagInfo) return;
    setFollowLoading(true);
    if (isFollowingTag) {
      await supabase.from("tag_follows").delete().eq("user_id", user.id).eq("tag_id", tagInfo.id);
      setIsFollowingTag(false);
    } else {
      await supabase.from("tag_follows").insert({ user_id: user.id, tag_id: tagInfo.id });
      setIsFollowingTag(true);
    }
    setFollowLoading(false);
  };

  if (loading) return <div className="min-h-screen bg-paper"><main className="max-w-6xl mx-auto px-4 py-6"><p className="text-sm text-muted text-center py-8">加载中...</p></main></div>;

  const hasContent = standalonePosts.length > 0 || seriesList.length > 0;

  return (
    <div className="min-h-screen bg-paper">
      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-warm"><i className="fa-solid fa-tag mr-2 text-accent" />{decodedName}</h2>
            <p className="text-sm text-muted mt-0.5">{tagInfo ? `${tagInfo.post_count} 篇作品` : "暂无作品"}</p>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            {user && (
              <button
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${isFollowingTag ? "bg-accent-light text-accent border border-accent" : "bg-accent text-white border border-accent"}`}
                onClick={handleTagFollow} disabled={followLoading}
              >
                {followLoading ? <i className="fa-solid fa-spinner animate-spin" /> : isFollowingTag ? <><i className="fa-solid fa-check mr-1" />已关注标签</> : <><i className="fa-solid fa-plus mr-1" />关注标签</>}
              </button>
            )}
            <div className="flex border border-rule rounded-lg overflow-hidden">
              <button className={`px-2 py-1.5 text-xs ${viewMode === "grid" ? "bg-accent text-white" : "text-muted bg-white"}`} onClick={() => setViewMode("grid")}>
                <i className="fa-solid fa-grip" />
              </button>
              <button className={`px-2 py-1.5 text-xs ${viewMode === "list" ? "bg-accent text-white" : "text-muted bg-white"}`} onClick={() => setViewMode("list")}>
                <i className="fa-solid fa-list" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex gap-1 mb-5 border-b border-rule pb-2">
          <button className={`px-4 py-1.5 text-sm rounded-full transition-colors ${tagTab === "latest" ? "bg-accent text-white" : "text-muted hover:text-warm"}`} onClick={() => setTagTab("latest")}>最新</button>
          <button className={`px-4 py-1.5 text-sm rounded-full transition-colors ${tagTab === "hottest" ? "bg-accent text-white" : "text-muted hover:text-warm"}`} onClick={() => setTagTab("hottest")}>最热</button>
        </div>

        {!hasContent ? (
          <div className="text-center py-12"><p className="text-muted">该标签下暂无作品</p></div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {seriesList.map((series) => (
              <SeriesCardGrid key={series.id} series={series} showAuthor />
            ))}
            {standalonePosts.map((post) => (
              <PostCardGrid key={post.id} post={post} showAuthor />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {/* 系列列表卡片 */}
            {seriesList.map((series) => {
              const avatarUrl = series.author?.avatar_url || `https://placehold.co/20x20/f5e6d3/b8752e?text=${encodeURIComponent(series.author?.nickname?.[0] || "?")}`;
              return (
                <div key={series.id} className="flex gap-4 p-4 rounded-xl bg-white border border-rule hover:shadow-md transition-shadow">
                  <Link
                    href={`/series/${encodeURIComponent(series.name)}`}
                    className="flex-shrink-0 w-[140px] self-stretch rounded-lg overflow-hidden bg-accent-light shadow-sm"
                  >
                    {series.cover_url ? (
                      <img src={series.cover_url} alt={series.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-accent-light/60 to-accent-light/20">
                        <i className="fa-solid fa-book-open text-3xl text-accent/30" />
                      </div>
                    )}
                  </Link>
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <Link href={`/series/${encodeURIComponent(series.name)}`} className="no-underline">
                        <h3 className="font-bold text-warm text-base mb-1 hover:text-accent transition-colors">{series.name}</h3>
                      </Link>
                      <p className="text-sm text-muted line-clamp-2 leading-relaxed mb-2">{series.description || "暂无简介"}</p>
                      <div className="flex items-center gap-3 text-xs text-muted flex-wrap mb-1">
                        <span className="inline-block px-1.5 py-0.5 rounded bg-accent-light text-accent text-[0.65rem]">长篇连载</span>
                        <span>{series.series_type === "fanfic" ? "同人" : "原创"}</span>
                        <span className={series.status === "ongoing" ? "text-accent" : "text-green-600"}>
                          {series.status === "ongoing" ? "连载中" : "已完结"}
                        </span>
                        <span>共 {series.totalChapters} 章</span>
                        {series.tags && series.tags.length > 0 && series.tags.map((tag) => (
                          <Link key={tag} href={`/tag/${encodeURIComponent(tag)}`}
                            className="inline-block px-1.5 py-0.5 text-[0.6rem] rounded-full bg-accent-light/40 text-accent/70 hover:bg-accent-light/60 no-underline">
                            {tag}
                          </Link>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted">
                      <Link href={`/user/${series.user_id}`} className="flex items-center gap-1.5 no-underline hover:opacity-80">
                        <img src={avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
                        <span className="text-muted">{series.author?.nickname || "匿名"}</span>
                      </Link>
                      <span className="flex items-center gap-1">
                        <i className="fa-solid fa-heart text-[0.65rem] text-red-400" />
                        0
                      </span>
                      <span className="flex items-center gap-1">
                        <i className="fa-solid fa-comment text-[0.65rem]" />
                        0
                      </span>
                      <span className="flex items-center gap-1">
                        <i className="fa-solid fa-bookmark text-[0.65rem]" />
                        0
                      </span>
                      <span className="ml-auto">{new Date(series.created_at || "").toLocaleDateString("zh-CN")}</span>
                    </div>
                  </div>
                </div>
              );
            })}
            {/* 独立帖子列表卡片 */}
            {standalonePosts.map((post) => {
              const cp = post as unknown as Record<string, unknown>;
              const contentImages = (() => {
                const content = (cp.content as string) || "";
                const matches = content.matchAll(/!\[.*?\]\((.*?)\)/g);
                return [...matches].map((m) => m[1]);
              })();
              const allImages = (cp.cover_url && !contentImages.includes(cp.cover_url as string))
                ? [cp.cover_url as string, ...contentImages]
                : contentImages;
              const hasImage = allImages.length > 0;
              const plainText = (() => {
                const content = (cp.content as string) || "";
                return content
                  .replace(/!\[.*?\]\(.*?\)/g, "")
                  .replace(/\[([^\]]*)\]\(.*?\)/g, "$1")
                  .replace(/[*_~`#>|-]/g, "")
                  .replace(/\n+/g, " ")
                  .replace(/\s+/g, " ")
                  .trim();
              })();
              const author = cp.author as { nickname: string; avatar_url: string | null } | null;
              const avatarUrl = author?.avatar_url || `https://placehold.co/20x20/f5e6d3/b8752e?text=${encodeURIComponent((author?.nickname || "?")[0])}`;
              return (
                <div key={post.id} className="p-4 rounded-xl bg-white border border-rule hover:shadow-md transition-shadow">
                  <Link href={`/read/${post.id}`} className="no-underline">
                    <h3 className="font-semibold text-warm mb-1 hover:text-accent line-clamp-1">
                      {post.title || "无标题"}
                    </h3>
                  </Link>
                  {plainText && (
                    <p className="text-sm text-muted line-clamp-3 mb-2">{plainText.slice(0, 200)}</p>
                  )}
                  {hasImage && (
                    <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 mb-2" style={{ scrollbarWidth: "none" }}>
                      {allImages.map((img, idx) => (
                        <Link key={idx} href={`/read/${post.id}`} className="flex-shrink-0 no-underline">
                          <img src={img} alt="" className="h-40 w-auto rounded-lg object-cover" loading="lazy" />
                        </Link>
                      ))}
                    </div>
                  )}
                  {post.tags && post.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {post.tags.map((tag) => {
                        const tagName = typeof tag === "string" ? tag : tag.name;
                        return (
                          <Link key={tagName} href={`/tag/${encodeURIComponent(tagName)}`}
                            className="inline-block px-1.5 py-0.5 text-[0.6rem] rounded-full bg-accent-light/40 text-accent/70 hover:bg-accent-light/60 no-underline">
                            {tagName}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-xs text-muted">
                    <Link href={`/user/${post.user_id}`} className="flex items-center gap-1.5 no-underline hover:opacity-80">
                      <img src={avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
                      <span className="text-muted">{author?.nickname || "匿名"}</span>
                    </Link>
                    <span className="flex items-center gap-1">
                      <i className="fa-solid fa-heart text-[0.65rem] text-red-400" />
                      {post.like_count || 0}
                    </span>
                    <span className="flex items-center gap-1">
                      <i className="fa-solid fa-comment text-[0.65rem]" />
                      {post.comment_count || 0}
                    </span>
                    <span className="flex items-center gap-1">
                      <i className="fa-solid fa-bookmark text-[0.65rem]" />
                      {post.bookmark_count || 0}
                    </span>
                    <span className="ml-auto">{new Date(post.created_at || "").toLocaleDateString("zh-CN")}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}