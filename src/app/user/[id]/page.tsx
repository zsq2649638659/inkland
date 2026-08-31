"use client";

import { useEffect, useState, use, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { submitReportV1 } from "@/lib/reportContent";
import { useAuth } from "@/components/AuthProvider";
import PostCardGrid from "@/components/PostCardGrid";
import PostTagCard from "@/components/PostTagCard";
import SeriesCardGrid from "@/components/SeriesCardGrid";
import { SkeletonProfile } from "@/components/Skeleton";
import EmptyState from "@/components/EmptyState";
import type { Post } from "@/lib/types";
import { useAppDialog } from "@/components/AppDialogProvider";
import DefaultAvatar from "@/components/DefaultAvatar";
import ModerationReasonModal from "@/components/ModerationReasonModal";
import { assertCanInteract } from "@/lib/userRestrictions";
import { assembleSeriesInfo } from "@/lib/seriesInfo";

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
  latestChapterContent: string | null;
  latestChapterCreatedAt: string | null;
  totalChapters: number;
  like_count: number;
  comment_count: number;
  bookmark_count: number;
}

export default function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const [reportOpen, setReportOpen] = useState(false);
  const { id } = use(params);
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") || "works";
  const supabase = createClient();
  const { user: currentUser } = useAuth();
  const dialog = useAppDialog();
  const [posts, setPosts] = useState<Post[]>([]);
  const [seriesList, setSeriesList] = useState<SeriesInfo[]>([]);
  const [profile, setProfile] = useState<{ nickname: string; avatar_url: string | null; bio: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [filterType, setFilterType] = useState<string>("all");
  const [followers, setFollowers] = useState<FollowUser[]>([]);
  const [following, setFollowing] = useState<FollowUser[]>([]);
  const [tabLoading, setTabLoading] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [blockedRecordId, setBlockedRecordId] = useState<string | null>(null);
  const [blockDialog, setBlockDialog] = useState<"confirm" | "success" | null>(null);
  const [blockDialogMessage, setBlockDialogMessage] = useState("");
  const [blockBusy, setBlockBusy] = useState(false);
  const [blockTargetId, setBlockTargetId] = useState<string | null>(null);

  // 判断帖子是否有图片
  const hasImages = (post: Post): boolean => {
    const cp = post as unknown as Record<string, unknown>;
    if (cp.cover_url && !(cp.cover_url as string).startsWith("private://")) return true;
    const content = (cp.content as string) || "";
    return /!\[.*?\]\((?!private:\/\/).*?\)/g.test(content);
  };

  // Stats
  const [postCount, setPostCount] = useState(0);
  const [likeCount, setLikeCount] = useState(0);
  const [bookmarkCount, setBookmarkCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [followerCount, setFollowerCount] = useState(0);

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

  const loadStats = useCallback(async (userId: string) => {
    // 个人资料统计互不依赖；帖子 ID 同时用于帖子总数和互动汇总，避免重复查一遍 posts。
    const [postIdsResult, followingResult, followerResult] = await Promise.all([
      supabase.from("posts").select("id").eq("user_id", userId).eq("status", "published"),
      supabase.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", userId),
      supabase.from("follows").select("id", { count: "exact", head: true }).eq("following_id", userId),
    ]);
    const postIds = (postIdsResult.data || []) as Array<{ id: string }>;
    setPostCount(postIds.length);
    setFollowingCount(followingResult.count || 0);
    setFollowerCount(followerResult.count || 0);

    if (postIds.length > 0) {
      const { data: stats } = await supabase
        .from("post_stats")
        .select("like_count, bookmark_count")
        .in("id", postIds.map((post) => post.id));
      let totalLikes = 0;
      let totalBookmarks = 0;
      for (const s of (stats || []) as Array<{ like_count: number; bookmark_count: number }>) {
        totalLikes += s.like_count || 0;
        totalBookmarks += s.bookmark_count || 0;
      }
      setLikeCount(totalLikes);
      setBookmarkCount(totalBookmarks);
    } else {
      setLikeCount(0);
      setBookmarkCount(0);
    }
  }, [supabase]);

  useEffect(() => {
    const load = async () => {
      const profilePromise = supabase.from("profiles").select("nickname, avatar_url, bio").eq("id", id).single();
      const postsPromise = supabase
        .from("posts")
        .select("id, title, content, word_count, post_type, created_at, series_name, chapter_number, cover_url, user_id, post_tags(tags(name)), author:profiles!posts_user_id_fkey(nickname, avatar_url)")
        .eq("user_id", id).eq("status", "published")
        .order("created_at", { ascending: false }).limit(50);
      const seriesPromise = supabase
        .from("series")
        .select("id, name, cover_url, description, series_type, tags, status, created_at")
        .eq("user_id", id)
        .order("created_at", { ascending: false });
      void loadStats(id);
      const [{ data: prof }, { data: rawData }, { data: allSeriesData }] = await Promise.all([
        profilePromise,
        postsPromise,
        seriesPromise,
      ]);
      if (prof) setProfile(prof as { nickname: string; avatar_url: string | null; bio: string | null });

      if (rawData) {
        const rawArr = rawData as unknown as Record<string, unknown>[];

        // 分离：普通帖子 vs 连载元数据 vs 连载章节
        const normalPosts: Record<string, unknown>[] = [];
        const serialMetaPosts: Record<string, unknown>[] = [];

        for (const p of rawArr) {
          if (p.post_type === "serial") {
            const cn = p.chapter_number as number | null | undefined;
            if (cn && cn > 0) {
              continue;
            }
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
        // 帖子和个人资料先出屏，系列摘要在后台批量补齐，不阻塞用户查看普通作品。
        setLoading(false);

        // 处理连载：从 series 表加载元数据
        const seriesNames = [...new Set(serialMetaPosts.map((p) => p.series_name as string).filter(Boolean))];

        let matchedSeries: Record<string, unknown>[] = [];
        if (allSeriesData) {
          // 从 posts 中匹配到的 series 优先，同时补充 posts 中不存在的空系列
          const seriesNameSet = new Set(seriesNames);
          const allSeries = allSeriesData as unknown as Record<string, unknown>[];
          // 先取在 posts 中有对应记录的系列
          const fromPosts = allSeries.filter((s) => seriesNameSet.has(s.name as string));
          // 再取 posts 中没有记录的系列（空系列）
          const emptySeries = allSeries.filter((s) => !seriesNameSet.has(s.name as string));
          matchedSeries = [...fromPosts, ...emptySeries];
        }

        if (matchedSeries.length > 0) {
          const seen = new Set<string>();
          const deduped = (matchedSeries as unknown as SeriesInfo[]).filter((s) => {
            if (seen.has(s.name)) return false;
            seen.add(s.name);
            return true;
          });

          const seriesWithChapters = await assembleSeriesInfo(supabase, deduped);

          setSeriesList(seriesWithChapters);
        }
      }

      if (currentUser && !isOwnProfile) {
        const [{ data: followData }, { data: blockedData }] = await Promise.all([
          supabase.from("follows").select("id").eq("follower_id", currentUser.id).eq("following_id", id).maybeSingle(),
          supabase.from("blocked_users").select("id").eq("user_id", currentUser.id).eq("blocked_user_id", id).maybeSingle(),
        ]);
        setIsFollowing(!!followData);
        setBlockedRecordId(blockedData?.id || null);
      }
      setLoading(false);
    };
    load();
  }, [id, supabase, currentUser, isOwnProfile, loadStats]);

  const handleFollow = async () => {
    if (!currentUser) return;
    setFollowLoading(true);
    if (isFollowing) {
      const { error } = await supabase.from("follows").delete().eq("follower_id", currentUser.id).eq("following_id", id);
      if (!error) {
        setIsFollowing(false);
        setFollowerCount((prev) => Math.max(0, prev - 1));
      }
    } else {
      const blocked = await assertCanInteract();
      if (blocked) {
        setFollowLoading(false);
        dialog.toast(blocked, "danger");
        return;
      }
      const { error } = await supabase.from("follows").insert({ follower_id: currentUser.id, following_id: id });
      if (!error) {
        setIsFollowing(true);
        setFollowerCount((prev) => prev + 1);
      }
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
    setMoreOpen(false);
    if (targetUserId === currentUser.id) {
      setBlockDialogMessage("不能屏蔽自己。");
      setBlockDialog("success");
      return;
    }
    setBlockTargetId(targetUserId);
    if (blockedRecordId) {
      setBlockBusy(true);
      const { error } = await supabase.from("blocked_users").delete().eq("id", blockedRecordId);
      setBlockBusy(false);
      if (error) {
        setBlockDialogMessage("取消屏蔽失败，请稍后重试。");
      } else {
        setBlockedRecordId(null);
        setBlockDialogMessage("已取消屏蔽，你可以再次看到对方的作品和互动。");
      }
      setBlockDialog("success");
      return;
    }
    setBlockDialogMessage("");
    setBlockDialog("confirm");
  };

  const confirmBlock = async () => {
    if (!currentUser || !blockTargetId || blockBusy) return;
    setBlockBusy(true);
    const { data: createdBlock, error } = await supabase.from("blocked_users").insert({
      user_id: currentUser.id,
      blocked_user_id: blockTargetId,
    }).select("id").single();
    setBlockBusy(false);
    if (error && !(error as unknown as Record<string, unknown>).code?.toString().includes("23505")) {
      setBlockDialogMessage("屏蔽失败，请稍后重试。");
      setBlockDialog("success");
      return;
    }
    if (blockTargetId === id) setBlockedRecordId(createdBlock?.id || blockedRecordId || "blocked");
    if (activeTab === "following") {
      setFollowing((prev) => prev.filter((u) => u.id !== blockTargetId));
    } else {
      setFollowers((prev) => prev.filter((u) => u.id !== blockTargetId));
    }
    setBlockDialogMessage("已屏蔽该用户，你将不再看到对方的作品和互动。");
    setBlockDialog("success");
  };

  const handleReport = () => {
    setMoreOpen(false);
    setReportOpen(true);
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

  // Close dropdown on outside click
  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".profile-actions-wrapper") && !target.closest(".more-dropdown")) {
        setMoreOpen(false);
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [moreOpen]);

  if (loading) return <div className="min-h-screen bg-paper"><main className="max-w-4xl mx-auto px-4 py-8"><SkeletonProfile /></main></div>;

  return (
    <div id="page-user" className="min-h-screen bg-paper">
      <main className="main-container">
        {/* ─── Profile Section ─── */}
        <section className="profile-section">
          <div className="profile-avatar">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt={displayName} />
            ) : (
              <DefaultAvatar name={displayName} />
            )}
          </div>
          <div className="profile-info">
            <h1 className="profile-name">{displayName}</h1>
            <p className="profile-bio">{profile?.bio || "这个人很懒，什么都没写"}</p>
            <div className="profile-stats">
              <div className="profile-stat">
                <i className="fa-solid fa-book"></i>
                <span>作品数</span>
                <span className="stat-value">{postCount}</span>
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
                <i className="fa-solid fa-user-plus"></i>
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
          {!isOwnProfile && currentUser && (
            <div className="profile-actions">
              <button
                className={`btn-follow ${isFollowing ? "btn-follow-outline" : "btn-follow-primary"}`}
                onClick={handleFollow}
                disabled={followLoading}
              >
                {followLoading ? (
                  <i className="fa-solid fa-spinner fa-spin" />
                ) : isFollowing ? (
                  <><i className="fa-solid fa-check" /> 已关注</>
                ) : (
                  <><i className="fa-solid fa-plus" /> 关注</>
                )}
              </button>
              <div className="profile-actions-wrapper">
                <button
                  className={`btn-more ${moreOpen ? "active" : ""}`}
                  onClick={(e) => { e.stopPropagation(); setMoreOpen(!moreOpen); }}
                  title="更多"
                >
                  <i className="fa-solid fa-ellipsis-vertical" />
                </button>
                {moreOpen && (
                  <div className="more-dropdown" onClick={(e) => e.stopPropagation()}>
                    <button className="more-dropdown-item" onClick={() => void handleBlock(id)}>
                      <i className="fa-solid fa-ban"></i>
                      {blockedRecordId ? "取消屏蔽" : "屏蔽"}
                    </button>
                    <button className="more-dropdown-item danger" onClick={handleReport}>
                      <i className="fa-solid fa-flag"></i>
                      举报
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
          {isOwnProfile && (
            <div className="profile-actions">
              <Link href="/profile/edit" className="btn-edit-profile">
                <i className="fa-solid fa-pen"></i> 编辑资料
              </Link>
            </div>
          )}
        </section>

        {/* ─── Followers / Following Tab ─── */}
        {(activeTab === "followers" || activeTab === "following") && (
          <div>
            {tabLoading ? (
              <p className="text-sm text-muted text-center py-8">加载中...</p>
            ) : (activeTab === "followers" ? followers : following).length === 0 ? (
              <div className="text-center py-12">
                <EmptyState
                  icon={activeTab === "followers" ? "fa-users" : "fa-user-check"}
                  title={activeTab === "followers" ? "还没有粉丝" : "还没有关注任何人"}
                />
              </div>
            ) : (
              <div className="space-y-2">
                {(activeTab === "followers" ? followers : following).map((u) => (
                  <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-rule hover:border-accent transition-colors">
                    <Link href={`/user/${u.id}`} className="flex items-center gap-3 flex-1 min-w-0 no-underline">
                      <span className="w-10 h-10 rounded-full overflow-hidden inline-flex flex-shrink-0">
                        {u.avatar_url ? <img src={u.avatar_url} className="w-full h-full object-cover" alt="" /> : <DefaultAvatar name={u.nickname || "?"} style={{ width:"100%", height:"100%" }} />}
                      </span>
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
        )}

        {/* ─── Works Section ─── */}
        {activeTab !== "followers" && activeTab !== "following" && (
          <>
            <h2 className="section-title">作品列表</h2>

            <div className="type-filters-row">
              <div className="type-filters">
                {["all", "single", "image", "series"].map((f) => (
                  <button
                    key={f}
                    className={`type-filter-pill${filterType === f ? " active" : ""}`}
                    onClick={() => setFilterType(f)}
                  >
                    {f === "all" ? "全部" : f === "single" ? "单篇" : f === "image" ? "图片" : "长篇连载"}
                  </button>
                ))}
              </div>
              
            </div>

            {posts.length === 0 && seriesList.length === 0 ? (
              <div className="text-center py-12">
                <EmptyState icon="fa-feather-pointed" title="暂无作品" />
              </div>
            ) : (
              <div className="card-grid">
                {/* 连载卡片 */}
                {(filterType === "all" || filterType === "series") &&
                  seriesList.map((series) => (
                    <div key={series.id} className="tag-card series" data-type="series">
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
                          <div className="chapter-preview-title">{series.latestChapterTitle || ""}</div>
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
                {(filterType === "all" || filterType === "single" || filterType === "image") &&
                  posts
                    .filter((post) => {
                      if (filterType === "all") return true;
                      if (filterType === "image") return hasImages(post);
                      if (filterType === "single") return !hasImages(post);
                      return true;
                    })
                    .map((post) => (
                      <PostTagCard key={post.id} post={post} />
                    ))}
              </div>
            )}
          </>
        )}
        <div className={`modal-overlay${blockDialog ? " active" : ""}`} onClick={() => { if (!blockBusy) setBlockDialog(null); }}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="profile-block-dialog-title" onClick={(event) => event.stopPropagation()}>
            {blockDialog === "confirm" ? (
              <>
                <div className="modal-title" id="profile-block-dialog-title">确认屏蔽</div>
                <div className="modal-body"><p>屏蔽后，你将不再看到对方的作品、评论和互动。之后也可以在“屏蔽管理”中取消。</p></div>
                <div className="modal-actions">
                  <button className="btn-modal btn-modal-cancel" onClick={() => setBlockDialog(null)} disabled={blockBusy}>取消</button>
                  <button className="btn-modal btn-modal-danger" onClick={() => void confirmBlock()} disabled={blockBusy}>{blockBusy ? "处理中…" : "确认屏蔽"}</button>
                </div>
              </>
            ) : (
              <>
                <div className="modal-title" id="profile-block-dialog-title">{blockDialogMessage.includes("失败") || blockDialogMessage.includes("不能") ? "操作提示" : "操作成功"}</div>
                <div className="modal-body"><p>{blockDialogMessage}</p></div>
                <div className="modal-actions"><button className="btn-modal btn-modal-primary" onClick={() => setBlockDialog(null)}>知道了</button></div>
              </>
            )}
          </div>
        </div>
        <ModerationReasonModal open={reportOpen} mode="report" onClose={() => setReportOpen(false)} onSubmit={async (reason, details) => {
          if (!currentUser) return;
          const result = await submitReportV1(supabase, { targetType: "user", targetId: id, reason, details });
          setReportOpen(false);
          setBlockDialogMessage(result.message);
          setBlockDialog("success");
        }} />
      </main>
    </div>
  );
}
