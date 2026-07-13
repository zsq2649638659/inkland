"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/AuthProvider";
import PostCardGrid from "@/components/PostCardGrid";
import SeriesCardGrid from "@/components/SeriesCardGrid";
import type { Post } from "@/lib/types";

type FilterType = "all" | "novel" | "illustration" | "serial";

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
  latestChapterCreatedAt: string | null;
  totalChapters: number;
}

export default function ProfilePage() {
  const supabase = createClient();
  const { user, profile } = useAuth();
  const [allPosts, setAllPosts] = useState<Post[]>([]);
  const [displayPosts, setDisplayPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [tab, setTab] = useState<"works" | "likes" | "bookmarks">("works");
  const [filter, setFilter] = useState<FilterType>("all");
  const [likedPosts, setLikedPosts] = useState<Post[]>([]);
  const [bookmarkedPosts, setBookmarkedPosts] = useState<Post[]>([]);
  const [seriesList, setSeriesList] = useState<SeriesInfo[]>([]);
  const [likeFilter, setLikeFilter] = useState<FilterType>("all");
  const [bookmarkFilter, setBookmarkFilter] = useState<FilterType>("all");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab");
    if (t === "likes") setTab("likes");
    else if (t === "bookmarks") setTab("bookmarks");
    else setTab("works");
  }, []);

  const loadPosts = async () => {
    if (!user) return;
    setLoading(true);
    setError("");

    let q = supabase
      .from("posts")
      .select("id, title, content, cover_url, post_type, created_at, series_name, chapter_number, status, user_id, post_tags(tags(name))")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (filter !== "all") q = q.eq("post_type", filter);

    const { data, error: err } = await q;
    if (err) { setError(`加载失败: ${err.message}`); setLoading(false); return; }

    const raw = data as unknown as Post[];
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

  const loadLikes = async () => {
    if (!user) return;
    setLoading(true);
    const { data: likes } = await supabase.from("likes").select("post_id").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
    if (likes && likes.length > 0) {
      const postIds = likes.map((l: Record<string, unknown>) => l.post_id as string);
      const { data: posts } = await supabase.from("posts").select("id, title, content, cover_url, post_type, created_at, user_id, author:profiles!posts_user_id_fkey(nickname, avatar_url)").in("id", postIds).eq("status", "published");
      if (posts) setLikedPosts(posts as unknown as Post[]);
    }
    setLoading(false);
  };

  const loadBookmarks = async () => {
    if (!user) return;
    setLoading(true);
    const { data: bms } = await supabase.from("bookmarks").select("post_id").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
    if (bms && bms.length > 0) {
      const postIds = bms.map((b: Record<string, unknown>) => b.post_id as string);
      const { data: posts } = await supabase.from("posts").select("id, title, content, cover_url, post_type, created_at, user_id, author:profiles!posts_user_id_fkey(nickname, avatar_url)").in("id", postIds).eq("status", "published");
      if (posts) setBookmarkedPosts(posts as unknown as Post[]);
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
      // 去重
      const seen = new Set<string>();
      const deduped = raw.filter((s) => {
        if (seen.has(s.name)) return false;
        seen.add(s.name);
        return true;
      });

      // 为每个 series 获取最新章节信息
      const seriesWithChapters = await Promise.all(deduped.map(async (s) => {
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
          latestChapterId: latest ? latest.id as string : null,
          latestChapterNumber: latest ? latest.chapter_number as number : null,
          latestChapterTitle: latest ? latest.title as string : null,
          latestChapterCreatedAt: latest ? latest.created_at as string : null,
          totalChapters: count || 0,
        };
      }));

      setSeriesList(seriesWithChapters);
    }
  };

  useEffect(() => {
    if (tab === "works") { loadPosts(); loadSeries(); }
    else if (tab === "likes") loadLikes();
    else if (tab === "bookmarks") loadBookmarks();
  }, [user, tab, filter]);

  if (!user) {
    return <div className="min-h-screen bg-paper flex items-center justify-center"><div className="text-center"><p className="text-muted mb-4">请先登录</p><Link href="/login" className="btn-accent no-underline">去登录</Link></div></div>;
  }

  const displayName = profile?.nickname || user.email?.split("@")[0] || "用户";
  const avatarChar = profile?.nickname?.[0] || user.email?.[0] || "?";

  const workCount = allPosts.filter((p) => {
    const cp = p as unknown as Record<string, unknown>;
    if (cp.post_type !== "serial") return true;
    const cn = cp.chapter_number as number | null | undefined;
    return cn === null || cn === undefined;
  }).length;

  const filters: { key: FilterType; label: string }[] = [
    { key: "all", label: "全部" },
    { key: "novel", label: "单篇" },
    { key: "illustration", label: "图片" },
    { key: "serial", label: "长篇连载" },
  ];

  return (
    <div className="min-h-screen bg-paper">
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white border border-rule rounded-xl p-6 mb-6">
          <div className="flex items-center gap-4">
            <img src={profile?.avatar_url || `https://placehold.co/64x64/f5e6d3/b8752e?text=${encodeURIComponent(avatarChar)}`} className="w-16 h-16 rounded-full object-cover" alt="avatar" />
            <div>
              <h1 className="text-xl font-bold text-warm">{displayName}</h1>
              <p className="text-sm text-muted mt-0.5">{profile?.bio || "这个人很懒，什么都没写"}</p>
            </div>
            <Link href="/profile/edit" className="btn-ghost ml-auto text-sm no-underline"><i className="fa-solid fa-pen mr-1" />编辑资料</Link>
          </div>
        </div>

        <div className="flex gap-1 mb-5 border-b border-rule pb-2">
          <button className={`px-4 py-1.5 text-sm rounded-full transition-colors ${tab === "works" ? "bg-accent text-white" : "text-muted hover:text-warm"}`} onClick={() => setTab("works")}>
            <i className="fa-solid fa-book mr-1" />我的作品</button>
          <button className={`px-4 py-1.5 text-sm rounded-full transition-colors ${tab === "likes" ? "bg-accent text-white" : "text-muted hover:text-warm"}`} onClick={() => setTab("likes")}>
            <i className="fa-solid fa-heart mr-1" />我的喜欢</button>
          <button className={`px-4 py-1.5 text-sm rounded-full transition-colors ${tab === "bookmarks" ? "bg-accent text-white" : "text-muted hover:text-warm"}`} onClick={() => setTab("bookmarks")}>
            <i className="fa-solid fa-bookmark mr-1" />我的收藏</button>
        </div>

        {tab === "works" && (
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-1 bg-white rounded-full border border-rule p-0.5">
              {filters.map((f) => (
                <button key={f.key} className={`px-3 py-1 text-xs rounded-full transition-colors ${filter === f.key ? "bg-accent text-white" : "text-muted hover:text-warm"}`}
                  onClick={() => setFilter(f.key)}>{f.label}</button>
              ))}
            </div>
            <div className="flex border border-rule rounded-lg overflow-hidden">
              <button className={`px-2 py-1.5 text-xs ${viewMode === "grid" ? "bg-accent text-white" : "text-muted bg-white"}`} onClick={() => setViewMode("grid")}><i className="fa-solid fa-grip" /></button>
              <button className={`px-2 py-1.5 text-xs ${viewMode === "list" ? "bg-accent text-white" : "text-muted bg-white"}`} onClick={() => setViewMode("list")}><i className="fa-solid fa-list" /></button>
            </div>
          </div>
        )}
        {tab === "likes" && (
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-1 bg-white rounded-full border border-rule p-0.5">
              {filters.map((f) => (
                <button key={f.key} className={`px-3 py-1 text-xs rounded-full transition-colors ${likeFilter === f.key ? "bg-accent text-white" : "text-muted hover:text-warm"}`}
                  onClick={() => setLikeFilter(f.key)}>{f.label}</button>
              ))}
            </div>
            <div className="flex border border-rule rounded-lg overflow-hidden">
              <button className={`px-2 py-1.5 text-xs ${viewMode === "grid" ? "bg-accent text-white" : "text-muted bg-white"}`} onClick={() => setViewMode("grid")}><i className="fa-solid fa-grip" /></button>
              <button className={`px-2 py-1.5 text-xs ${viewMode === "list" ? "bg-accent text-white" : "text-muted bg-white"}`} onClick={() => setViewMode("list")}><i className="fa-solid fa-list" /></button>
            </div>
          </div>
        )}
        {tab === "bookmarks" && (
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-1 bg-white rounded-full border border-rule p-0.5">
              {filters.map((f) => (
                <button key={f.key} className={`px-3 py-1 text-xs rounded-full transition-colors ${bookmarkFilter === f.key ? "bg-accent text-white" : "text-muted hover:text-warm"}`}
                  onClick={() => setBookmarkFilter(f.key)}>{f.label}</button>
              ))}
            </div>
            <div className="flex border border-rule rounded-lg overflow-hidden">
              <button className={`px-2 py-1.5 text-xs ${viewMode === "grid" ? "bg-accent text-white" : "text-muted bg-white"}`} onClick={() => setViewMode("grid")}><i className="fa-solid fa-grip" /></button>
              <button className={`px-2 py-1.5 text-xs ${viewMode === "list" ? "bg-accent text-white" : "text-muted bg-white"}`} onClick={() => setViewMode("list")}><i className="fa-solid fa-list" /></button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted text-center py-8">加载中...</p>
        ) : error ? (
          <div className="text-center py-8"><p className="text-sm text-red-500 mb-2">{error}</p></div>
        ) : tab === "works" ? (
          displayPosts.length === 0 && seriesList.length === 0 ? (
            <div className="text-center py-12"><p className="text-muted mb-4">还没有发布过作品</p><Link href="/create" className="submit-btn no-underline"><i className="fa-solid fa-pen-to-square mr-1" />去创作</Link></div>
          ) : displayPosts.length === 0 && seriesList.length > 0 ? (
            <div className="space-y-4">
              {(filter === "all" || filter === "serial") && seriesList.map((series) => (
                <div key={series.id} className="flex gap-4 p-4 rounded-xl bg-white border border-rule hover:shadow-md transition-shadow">
                  {/* 封面 - 起点风格竖版 */}
                  <Link
                    href={`/series/${encodeURIComponent(series.name)}`}
                    className="flex-shrink-0 w-[100px] self-stretch rounded-lg overflow-hidden bg-accent-light shadow-sm"
                  >
                    {series.cover_url ? (
                      <img src={series.cover_url} alt={series.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-accent-light/60 to-accent-light/20">
                        <i className="fa-solid fa-book-open text-3xl text-accent/30" />
                      </div>
                    )}
                  </Link>
                  {/* 信息区 */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <Link href={`/series/${encodeURIComponent(series.name)}`} className="no-underline">
                        <h3 className="font-bold text-warm text-base mb-1 hover:text-accent transition-colors">{series.name}</h3>
                      </Link>
                      <p className="text-sm text-muted line-clamp-2 leading-relaxed mb-2">{series.description || "暂无简介"}</p>
                      {/* 标签 */}
                      {series.tags && series.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {series.tags.map((tag) => (
                            <span key={tag} className="inline-block px-2 py-0.5 text-[0.65rem] rounded-full bg-accent-light/40 text-accent/80">{tag}</span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-3 text-xs text-muted">
                        <span className="inline-block px-1.5 py-0.5 rounded bg-accent-light text-accent text-[0.65rem]">长篇连载</span>
                        <span>{series.series_type === "fanfic" ? "同人" : "原创"}</span>
                        <span className={series.status === "ongoing" ? "text-accent" : "text-green-600"}>
                          {series.status === "ongoing" ? "连载中" : "已完结"}
                        </span>
                        <span>共 {series.totalChapters} 章</span>
                      </div>
                    </div>
                    {/* 最新章节 */}
                    {series.latestChapterId && (
                      <Link
                        href={`/read/${series.latestChapterId}`}
                        className="mt-2 pt-2 border-t border-rule/50 flex items-center gap-2 text-xs no-underline hover:text-accent transition-colors group"
                      >
                        <i className="fa-solid fa-clock text-[0.65rem] text-muted group-hover:text-accent" />
                        <span className="text-muted">最新章节:</span>
                        <span className="text-warm font-medium">
                          第{series.latestChapterNumber}章 {series.latestChapterTitle || "无标题"}
                        </span>
                        {series.latestChapterCreatedAt && (
                          <span className="text-muted ml-auto">
                            {new Date(series.latestChapterCreatedAt).toLocaleDateString("zh-CN")}
                          </span>
                        )}
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayPosts.map((post) => (
                <PostCardGrid key={post.id} post={post} showAuthor={false} />
              ))}
              {(filter === "all" || filter === "serial") && seriesList.map((series) => (
                <SeriesCardGrid key={series.id} series={series} />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {displayPosts.map((post) => {
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
                return (
                  <div key={post.id} className="p-4 rounded-xl bg-white border border-rule hover:shadow-md transition-shadow">
                    <Link href={`/read/${post.id}`} className="no-underline">
                      <h3 className="font-semibold text-warm mb-1 hover:text-accent line-clamp-1">
                        {cp.series_name && cp.chapter_number ? (
                          <span className="text-xs text-accent mr-1">[{cp.series_name as string}·第{cp.chapter_number as number}章]</span>
                        ) : null}
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
                    {/* 标签行 */}
                    {post.tags && post.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {post.tags.map((tag) => {
                          const tagName = typeof tag === "string" ? tag : tag.name;
                          return (
                            <Link
                              key={tagName}
                              href={`/tag/${encodeURIComponent(tagName)}`}
                              className="inline-block px-1.5 py-0.5 text-[0.6rem] rounded-full bg-accent-light/40 text-accent/70 hover:bg-accent-light/60 no-underline"
                            >
                              {tagName}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                      <div className="flex items-center gap-3 text-xs text-muted">
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
              {(filter === "all" || filter === "serial") && seriesList.map((series) => (
                <div key={series.id} className="flex gap-4 p-4 rounded-xl bg-white border border-rule hover:shadow-md transition-shadow">
                  <Link
                    href={`/series/${encodeURIComponent(series.name)}`}
                    className="flex-shrink-0 w-[100px] self-stretch rounded-lg overflow-hidden bg-accent-light shadow-sm"
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
                      {series.tags && series.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {series.tags.map((tag) => (
                            <span key={tag} className="inline-block px-2 py-0.5 text-[0.65rem] rounded-full bg-accent-light/40 text-accent/80">{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    {series.latestChapterId && (
                      <Link
                        href={`/read/${series.latestChapterId}`}
                        className="mt-2 pt-2 border-t border-rule/50 flex items-center gap-2 text-xs no-underline hover:text-accent transition-colors group"
                      >
                        <i className="fa-solid fa-clock text-[0.65rem] text-muted group-hover:text-accent" />
                        <span className="text-muted">最新章节:</span>
                        <span className="text-warm font-medium">
                          第{series.latestChapterNumber}章 {series.latestChapterTitle || "无标题"}
                        </span>
                        {series.latestChapterCreatedAt && (
                          <span className="text-muted ml-auto">
                            {new Date(series.latestChapterCreatedAt).toLocaleDateString("zh-CN")}
                          </span>
                        )}
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : tab === "likes" ? (
          (() => {
            const filteredLikes = likeFilter === "all"
              ? likedPosts
              : likedPosts.filter((p) => {
                  const cp = p as unknown as Record<string, unknown>;
                  return cp.post_type === likeFilter;
                });
            return filteredLikes.length === 0 ? (
            <div className="text-center py-12"><p className="text-muted">还没有喜欢过的作品</p></div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{filteredLikes.map((post) => <PostCardGrid key={post.id} post={post} />)}</div>
          ) : (
            <div className="space-y-3">{filteredLikes.map((post) => {
              const author = (post as unknown as Record<string, unknown>).author as { nickname: string; avatar_url: string | null } | null;
              const contentImages = (() => {
                const content = (post.content as string) || "";
                const matches = content.matchAll(/!\[.*?\]\((.*?)\)/g);
                return [...matches].map((m) => m[1]);
              })();
              const coverUrl = (post as unknown as Record<string, unknown>).cover_url as string;
              const allImages = (coverUrl && !contentImages.includes(coverUrl))
                ? [coverUrl, ...contentImages]
                : contentImages;
              const hasImage = allImages.length > 0;
              const plainText = (() => {
                const content = (post.content as string) || "";
                return content
                  .replace(/!\[.*?\]\(.*?\)/g, "")
                  .replace(/\[([^\]]*)\]\(.*?\)/g, "$1")
                  .replace(/[*_~`#>|-]/g, "")
                  .replace(/\n+/g, " ")
                  .replace(/\s+/g, " ")
                  .trim();
              })();
              return (
                <div key={post.id} className="p-4 rounded-xl bg-white border border-rule hover:shadow-md transition-shadow">
                  <Link href={`/read/${post.id}`} className="no-underline"><h3 className="font-semibold text-warm mb-1 hover:text-accent">{post.title}</h3></Link>
                  {plainText && <p className="text-sm text-muted line-clamp-3 mb-2">{plainText.slice(0, 200)}</p>}
                  {hasImage && (
                    <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 mb-2" style={{ scrollbarWidth: "none" }}>
                      {allImages.map((img, idx) => (
                        <Link key={idx} href={`/read/${post.id}`} className="flex-shrink-0 no-underline">
                          <img src={img} alt="" className="h-40 w-auto rounded-lg object-cover" loading="lazy" />
                        </Link>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-xs text-muted">
                    <span>{author?.nickname || "匿名"}</span>
                    <span>{post.created_at ? new Date(post.created_at).toLocaleDateString("zh-CN") : ""}</span>
                  </div>
                </div>
              );
            })}</div>
          )
          })()
        ) : (
          (() => {
            const filteredBookmarks = bookmarkFilter === "all"
              ? bookmarkedPosts
              : bookmarkedPosts.filter((p) => {
                  const cp = p as unknown as Record<string, unknown>;
                  return cp.post_type === bookmarkFilter;
                });
            return filteredBookmarks.length === 0 ? (
            <div className="text-center py-12"><p className="text-muted">还没有收藏的作品</p></div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{filteredBookmarks.map((post) => <PostCardGrid key={post.id} post={post} />)}</div>
          ) : (
            <div className="space-y-3">{filteredBookmarks.map((post) => {
              const author = (post as unknown as Record<string, unknown>).author as { nickname: string; avatar_url: string | null } | null;
              const contentImages = (() => {
                const content = (post.content as string) || "";
                const matches = content.matchAll(/!\[.*?\]\((.*?)\)/g);
                return [...matches].map((m) => m[1]);
              })();
              const coverUrl = (post as unknown as Record<string, unknown>).cover_url as string;
              const allImages = (coverUrl && !contentImages.includes(coverUrl))
                ? [coverUrl, ...contentImages]
                : contentImages;
              const hasImage = allImages.length > 0;
              const plainText = (() => {
                const content = (post.content as string) || "";
                return content
                  .replace(/!\[.*?\]\(.*?\)/g, "")
                  .replace(/\[([^\]]*)\]\(.*?\)/g, "$1")
                  .replace(/[*_~`#>|-]/g, "")
                  .replace(/\n+/g, " ")
                  .replace(/\s+/g, " ")
                  .trim();
              })();
              return (
                <div key={post.id} className="p-4 rounded-xl bg-white border border-rule hover:shadow-md transition-shadow">
                  <Link href={`/read/${post.id}`} className="no-underline"><h3 className="font-semibold text-warm mb-1 hover:text-accent">{post.title}</h3></Link>
                  {plainText && <p className="text-sm text-muted line-clamp-3 mb-2">{plainText.slice(0, 200)}</p>}
                  {hasImage && (
                    <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 mb-2" style={{ scrollbarWidth: "none" }}>
                      {allImages.map((img, idx) => (
                        <Link key={idx} href={`/read/${post.id}`} className="flex-shrink-0 no-underline">
                          <img src={img} alt="" className="h-40 w-auto rounded-lg object-cover" loading="lazy" />
                        </Link>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-xs text-muted">
                    <span>{author?.nickname || "匿名"}</span>
                    <span>{post.created_at ? new Date(post.created_at).toLocaleDateString("zh-CN") : ""}</span>
                  </div>
                </div>
              );
            })}</div>
          )
          })()
        )}
      </main>
    </div>
  );
}