"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/AuthProvider";
import PostCardGrid from "@/components/PostCardGrid";
import SeriesCardGrid from "@/components/SeriesCardGrid";
import { SkeletonProfile } from "@/components/Skeleton";
import EmptyState from "@/components/EmptyState";
import type { Post } from "@/lib/types";

interface FollowUser {
  id: string;
  nickname: string;
  avatar_url: string | null;
  bio: string | null;
}

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

export default function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") || "works";
  const supabase = createClient();
  const { user: currentUser } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [seriesList, setSeriesList] = useState<SeriesInfo[]>([]);
  const [profile, setProfile] = useState<{ nickname: string; avatar_url: string | null; bio: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [followers, setFollowers] = useState<FollowUser[]>([]);
  const [following, setFollowing] = useState<FollowUser[]>([]);
  const [tabLoading, setTabLoading] = useState(false);

  const isOwnProfile = currentUser?.id === id;

  useEffect(() => {
    if (activeTab === "followers") loadFollowers();
    else if (activeTab === "following") loadFollowing();
  }, [activeTab, id]);

  const loadFollowers = async () => {
    setTabLoading(true);
    const { data: fData } = await supabase
      .from("follows")
      .select("follower_id, profiles!follows_follower_id_fkey(id, nickname, avatar_url, bio)")
      .eq("following_id", id)
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
    }
    setTabLoading(false);
  };

  const loadFollowing = async () => {
    setTabLoading(true);
    const { data: fData } = await supabase
      .from("follows")
      .select("following_id, profiles!follows_following_id_fkey(id, nickname, avatar_url, bio)")
      .eq("follower_id", id)
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
    }
    setTabLoading(false);
  };

  useEffect(() => {
    const load = async () => {
      const { data: prof } = await supabase.from("profiles").select("nickname, avatar_url, bio").eq("id", id).single();
      if (prof) setProfile(prof as { nickname: string; avatar_url: string | null; bio: string | null });

      const { data: rawData } = await supabase
        .from("posts")
        .select("id, title, content, word_count, post_type, created_at, series_name, chapter_number, cover_url, user_id, post_tags(tags(name)), author:profiles!posts_user_id_fkey(nickname, avatar_url)")
        .eq("user_id", id).eq("status", "published")
        .order("created_at", { ascending: false }).limit(50);

      if (rawData) {
        const rawArr = rawData as unknown as Record<string, unknown>[];

        // 分离：普通帖子 vs 连载元数据 vs 连载章节
        const normalPosts: Record<string, unknown>[] = [];
        const serialMetaPosts: Record<string, unknown>[] = []; // chapter_number === 0 or null

        for (const p of rawArr) {
          if (p.post_type === "serial") {
            const cn = p.chapter_number as number | null | undefined;
            if (cn && cn > 0) {
              // 连载章节，跳过（由 series 卡片统一展示）
              continue;
            }
            // 连载元数据
            serialMetaPosts.push(p);
          } else {
            normalPosts.push(p);
          }
        }

        // 加载热度数据
        const allIds = [...normalPosts, ...serialMetaPosts].map((p) => p.id as string);
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
          const st = statsMap.get(p.id as string) || { like_count: 0, comment_count: 0, bookmark_count: 0 };

          return {
            id: p.id as string,
            title: (p.title as string) || "无标题",
            content: (p.content as string) || "",
            cover_url: p.cover_url as string | null,
            word_count: p.word_count as number,
            created_at: p.created_at as string,
            user_id: p.user_id as string,
            series_name: p.series_name as string | null,
            chapter_number: p.chapter_number as number | null,
            post_type: p.post_type as Post["post_type"],
            tags: ptags,
            author: { nickname: author?.nickname || "匿名用户", avatar_url: author?.avatar_url },
            like_count: st.like_count,
            comment_count: st.comment_count,
            bookmark_count: st.bookmark_count,
          } as Post;
        });

        setPosts(formatted);

        // 处理连载：从 series 表加载元数据
        const seriesNames = [...new Set(serialMetaPosts.map((p) => p.series_name as string).filter(Boolean))];
        if (seriesNames.length > 0) {
          const { data: seriesData } = await supabase
            .from("series")
            .select("id, name, cover_url, description, series_type, tags, status, created_at")
            .eq("user_id", id)
            .in("name", seriesNames)
            .order("created_at", { ascending: false });

          if (seriesData) {
            const seen = new Set<string>();
            const deduped = (seriesData as unknown as SeriesInfo[]).filter((s) => {
              if (seen.has(s.name)) return false;
              seen.add(s.name);
              return true;
            });

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
        }
      }

      if (currentUser && !isOwnProfile) {
        const { data: followData } = await supabase.from("follows").select("id").eq("follower_id", currentUser.id).eq("following_id", id).single();
        setIsFollowing(!!followData);
      }
      setLoading(false);
    };
    load();
  }, [id, supabase, currentUser, isOwnProfile]);

  const handleFollow = async () => {
    if (!currentUser) return;
    setFollowLoading(true);
    if (isFollowing) {
      const { error } = await supabase.from("follows").delete().eq("follower_id", currentUser.id).eq("following_id", id);
      if (!error) setIsFollowing(false);
    } else {
      const { error } = await supabase.from("follows").insert({ follower_id: currentUser.id, following_id: id });
      if (!error) setIsFollowing(true);
    }
    setFollowLoading(false);
  };

  const handleUnfollow = async (targetUserId: string) => {
    if (!currentUser) return;
    const { error } = await supabase.from("follows").delete().eq("follower_id", currentUser.id).eq("following_id", targetUserId);
    if (!error) {
      setFollowing((prev) => prev.filter((u) => u.id !== targetUserId));
    }
  };

  const handleBlock = async (targetUserId: string) => {
    if (!currentUser) return;
    if (!confirm("确定要拉黑该用户吗？")) return;
    const { error } = await supabase.from("blocked_users").insert({
      user_id: currentUser.id,
      blocked_user_id: targetUserId,
    });
    if (error && !(error as unknown as Record<string, unknown>).code?.toString().includes("23505")) {
      alert("操作失败: " + error.message);
      return;
    }
    if (activeTab === "following") {
      setFollowing((prev) => prev.filter((u) => u.id !== targetUserId));
    } else {
      setFollowers((prev) => prev.filter((u) => u.id !== targetUserId));
    }
  };

  const handleRemoveFollower = async (targetUserId: string) => {
    if (!currentUser) return;
    const { error } = await supabase.from("follows").delete().eq("follower_id", targetUserId).eq("following_id", currentUser.id);
    if (!error) {
      setFollowers((prev) => prev.filter((u) => u.id !== targetUserId));
    }
  };

  const displayName = profile?.nickname || "匿名用户";
  const avatarChar = profile?.nickname?.[0] || "?";

  if (loading) return <div className="min-h-screen bg-paper"><main className="max-w-4xl mx-auto px-4 py-8"><SkeletonProfile /></main></div>;

  return (
    <div className="min-h-screen bg-paper">
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white border border-rule rounded-xl p-6 mb-6">
          <div className="flex items-center gap-4">
            <img src={profile?.avatar_url || `https://placehold.co/64x64/f5e6d3/b8752e?text=${encodeURIComponent(avatarChar)}`} className="w-16 h-16 rounded-full object-cover" alt="avatar" />
            <div className="flex-1">
              <h1 className="text-xl font-bold text-warm">{displayName}</h1>
              <p className="text-sm text-muted mt-0.5">{profile?.bio || "这个人很懒，什么都没写"}</p>
            </div>
            {!isOwnProfile && currentUser && (
              <button className={`px-5 py-2 rounded-full text-sm font-medium transition-colors ${isFollowing ? "bg-accent-light text-accent border border-accent" : "bg-accent text-white border border-accent"}`} onClick={handleFollow} disabled={followLoading}>
                {followLoading ? <i className="fa-solid fa-spinner animate-spin" /> : isFollowing ? <><i className="fa-solid fa-check mr-1" />已关注</> : <><i className="fa-solid fa-plus mr-1" />关注</>}
              </button>
            )}
          </div>
        </div>

        {(activeTab === "followers" || activeTab === "following") ? (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-warm">
                <i className={`fa-solid fa-${activeTab === "followers" ? "users" : "user-group"} mr-2 text-accent`} />
                {activeTab === "followers" ? "TA 的粉丝" : "TA 的关注"}
              </h2>
            </div>
            {tabLoading ? (
              <p className="text-sm text-muted text-center py-8">加载中...</p>
            ) : (activeTab === "followers" ? followers : following).length === 0 ? (
              <div className="text-center py-12"><EmptyState icon={activeTab === "followers" ? "fa-users" : "fa-user-check"} title={activeTab === "followers" ? "还没有粉丝" : "还没有关注任何人"} /></div>
            ) : (
              <div className="space-y-2">
                {(activeTab === "followers" ? followers : following).map((u) => (
                  <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl bg-white border border-rule hover:border-accent transition-colors">
                    <Link href={`/user/${u.id}`} className="flex items-center gap-3 flex-1 min-w-0 no-underline">
                      <img src={u.avatar_url || `https://placehold.co/40x40/f5e6d3/b8752e?text=${encodeURIComponent(u.nickname?.[0] || "?")}`} className="w-10 h-10 rounded-full object-cover" alt="" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-warm">{u.nickname}</div>
                        {u.bio && <div className="text-xs text-muted truncate">{u.bio}</div>}
                      </div>
                      <i className="fa-solid fa-chevron-right text-xs text-muted" />
                    </Link>
                    {isOwnProfile && (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {activeTab === "following" ? (
                          <button
                            className="px-2.5 py-1 text-xs rounded-full border border-red-300 text-red-500 bg-transparent cursor-pointer hover:bg-red-50 transition-colors"
                            onClick={(e) => { e.preventDefault(); handleUnfollow(u.id); }}
                          >
                            取消关注
                          </button>
                        ) : (
                          <button
                            className="px-2.5 py-1 text-xs rounded-full border border-red-300 text-red-500 bg-transparent cursor-pointer hover:bg-red-50 transition-colors"
                            onClick={(e) => { e.preventDefault(); handleRemoveFollower(u.id); }}
                          >
                            移除粉丝
                          </button>
                        )}
                        <button
                          className="px-2.5 py-1 text-xs rounded-full border border-red-300 text-red-500 bg-transparent cursor-pointer hover:bg-red-50 transition-colors"
                          onClick={(e) => { e.preventDefault(); handleBlock(u.id); }}
                        >
                          拉黑
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-warm">TA 的作品</h2>
              <div className="flex border border-rule rounded-lg overflow-hidden">
                <button className={`px-2 py-1.5 text-xs ${viewMode === "grid" ? "bg-accent text-white" : "text-muted bg-white"}`} onClick={() => setViewMode("grid")}>
                  <i className="fa-solid fa-grip" />
                </button>
                <button className={`px-2 py-1.5 text-xs ${viewMode === "list" ? "bg-accent text-white" : "text-muted bg-white"}`} onClick={() => setViewMode("list")}>
                  <i className="fa-solid fa-list" />
                </button>
              </div>
            </div>

            {posts.length === 0 && seriesList.length === 0 ? (
              <div className="text-center py-12"><EmptyState icon="fa-feather-pointed" title="暂无作品" /></div>
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {seriesList.map((series) => (
                  <SeriesCardGrid key={series.id} series={series} />
                ))}
                {posts.map((post) => <PostCardGrid key={post.id} post={post} showAuthor={false} />)}
              </div>
            ) : (
              <div className="space-y-3">
                {/* 连载卡片 - list 视图 */}
                {seriesList.map((series) => (
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

                {/* 普通作品卡片 - list 视图 */}
                {posts.map((post) => {
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
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}