"use client";

import { useEffect, useState, use, useCallback } from "react";
import { createClient } from "@/lib/supabase/browser";
import { SkeletonTagPage } from "@/components/Skeleton";
import EmptyState from "@/components/EmptyState";
import { useAuth } from "@/components/AuthProvider";
import PostTagCard from "@/components/PostTagCard";
import type { Post } from "@/lib/types";
import { slimContent } from "@/lib/feed";

type TagTab = "latest" | "hottest";
type TimeFilter = "all" | "day" | "week" | "month";
type TypeFilter = "all" | "single" | "image" | "series";

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
  latestChapterContent: string | null;
  latestChapterCreatedAt: string | null;
  like_count: number;
  comment_count: number;
  bookmark_count: number;
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
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [draftTimeFilter, setDraftTimeFilter] = useState<TimeFilter>("all");
  const [draftTypeFilter, setDraftTypeFilter] = useState<TypeFilter>("all");
  const [isFollowingTag, setIsFollowingTag] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const [viewCount, setViewCount] = useState(0);

  useEffect(() => {
    const load = async () => {
      const { data: tag } = await supabase
        .from("tags")
        .select("id, post_count")
        .eq("name", decodedName)
        .single();

      if (!tag) { setLoading(false); return; }

      const tagId = (tag as Record<string, unknown>).id as string;

      // 帖子关联和 series.tags 关联互不依赖，合并成同一波请求。
      const [{ data: ptData }, { data: seriesByTag }] = await Promise.all([
        supabase.from("post_tags").select("post_id").eq("tag_id", tagId),
        supabase.from("series").select("name").contains("tags", [decodedName]),
      ]);

      let allPosts: Post[] = [];
      let standalonePostsList: Post[] = [];
      let chapterSeriesNames: Set<string> = new Set();

      if (ptData && ptData.length > 0) {
        const postIds = ptData.map((p: Record<string, unknown>) => p.post_id as string);
        const postsPromise = supabase
          .from("posts")
          .select("id, title, content, word_count, post_type, chapter_number, series_name, created_at, cover_url, user_id, author:profiles!posts_user_id_fkey(nickname, avatar_url), post_tags(tags(name))")
          .in("id", postIds)
          .eq("status", "published");
        const statsPromise = supabase
          .from("post_stats")
          .select("id, like_count, comment_count, bookmark_count")
          .in("id", postIds);
        const [{ data: postsData }, { data: stats }] = await Promise.all([postsPromise, statsPromise]);

        if (postsData) {
          for (const p of postsData as Array<Record<string, unknown>>) {
            // 只有真正的 serial 章节才合并为长篇连载；图片作品加入合集时也可能有 series_name，不能误合并。
            if (p.post_type === "serial" && p.series_name) {
              chapterSeriesNames.add(p.series_name as string);
            }
          }

          let statsMap: Record<string, { like_count: number; comment_count: number; bookmark_count: number }> = {};
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
              content: slimContent((p.content as string) || ""), cover_url: p.cover_url as string | null,
              post_type: p.post_type as Post["post_type"],
              series_name: p.series_name as string | null,
              chapter_number: p.chapter_number as number | null,
              word_count: p.word_count as number, created_at: p.created_at as string,
              user_id: p.user_id as string,
              author: { nickname: a?.nickname || "匿名用户", avatar_url: a?.avatar_url },
              like_count: s.like_count, comment_count: s.comment_count, bookmark_count: s.bookmark_count,
              tags: tagNames,
            } as Post;
          });

          standalonePostsList = allPosts.filter((p) => {
            const raw = postsData.find((r: Record<string, unknown>) => r.id === p.id) as Record<string, unknown> | undefined;
            return !(raw?.post_type === "serial" && raw?.series_name);
          });

          standalonePostsList.sort((a, b) => new Date(b.created_at || "").getTime() - new Date(a.created_at || "").getTime());
        }
      }

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
          const chapterRowsPromise = supabase
            .from("posts")
            .select("id, series_name, chapter_number, created_at")
            .in("series_name", [...allSeriesNames])
            .eq("post_type", "serial")
            .eq("status", "published");
          const profilesPromise = userIds.length > 0
            ? supabase.from("profiles").select("id, nickname, avatar_url").in("id", userIds)
            : Promise.resolve({ data: null });
          const [{ data: profiles }, { data: chapterRows }] = await Promise.all([profilesPromise, chapterRowsPromise]);
          const profileMap: Record<string, { nickname: string; avatar_url: string | null }> = {};
          for (const p of (profiles || []) as Array<Record<string, unknown>>) {
            profileMap[p.id as string] = {
              nickname: p.nickname as string,
              avatar_url: p.avatar_url as string | null,
            };
          }

          const chapters = (chapterRows || []) as Array<{
            id: string;
            series_name: string | null;
            chapter_number: number | null;
            created_at: string | null;
          }>;
          const chaptersBySeries = new Map<string, typeof chapters>();
          for (const chapter of chapters) {
            if (!chapter.series_name) continue;
            const current = chaptersBySeries.get(chapter.series_name) || [];
            current.push(chapter);
            chaptersBySeries.set(chapter.series_name, current);
          }
          const latestBySeries = new Map<string, (typeof chapters)[number]>();
          for (const [seriesName, rows] of chaptersBySeries) {
            const latest = rows.reduce((best, row) => {
              if (!best) return row;
              const bestNumber = best.chapter_number ?? -1;
              const rowNumber = row.chapter_number ?? -1;
              if (rowNumber !== bestNumber) return rowNumber > bestNumber ? row : best;
              return new Date(row.created_at || "").getTime() > new Date(best.created_at || "").getTime() ? row : best;
            }, null as (typeof chapters)[number] | null);
            if (latest) latestBySeries.set(seriesName, latest);
          }

          const chapterIds = chapters.map((chapter) => chapter.id);
          const latestIds = [...latestBySeries.values()].map((chapter) => chapter.id);
          const [latestResult, statsResult] = await Promise.all([
            latestIds.length > 0
              ? supabase.from("posts").select("id, title, content").in("id", latestIds)
              : Promise.resolve({ data: null }),
            chapterIds.length > 0
              ? supabase.from("post_stats").select("id, like_count, comment_count, bookmark_count").in("id", chapterIds)
              : Promise.resolve({ data: null }),
          ]);
          const latestDetails = new Map<string, { title: string; content: string }>();
          for (const row of (latestResult.data || []) as Array<Record<string, unknown>>) {
            latestDetails.set(row.id as string, {
              title: (row.title as string) || "",
              content: slimContent((row.content as string) || ""),
            });
          }
          const statsMap = new Map<string, { like_count: number; comment_count: number; bookmark_count: number }>();
          for (const row of (statsResult.data || []) as Array<Record<string, unknown>>) {
            statsMap.set(row.id as string, {
              like_count: (row.like_count as number) || 0,
              comment_count: (row.comment_count as number) || 0,
              bookmark_count: (row.bookmark_count as number) || 0,
            });
          }

          matchedSeries = rawSeries.map((s) => {
            const rows = chaptersBySeries.get(s.name) || [];
            const latest = latestBySeries.get(s.name);
            const detail = latest ? latestDetails.get(latest.id) : undefined;
            const totals = rows.reduce((sum, row) => {
              const stats = statsMap.get(row.id);
              return {
                like_count: sum.like_count + (stats?.like_count || 0),
                comment_count: sum.comment_count + (stats?.comment_count || 0),
                bookmark_count: sum.bookmark_count + (stats?.bookmark_count || 0),
              };
            }, { like_count: 0, comment_count: 0, bookmark_count: 0 });
            return {
              ...s,
              author: profileMap[s.user_id] || { nickname: "匿名用户", avatar_url: null },
              totalChapters: rows.length,
              latestChapterId: latest?.id || null,
              latestChapterNumber: latest?.chapter_number ?? null,
              latestChapterTitle: detail?.title || null,
              latestChapterContent: detail?.content || null,
              latestChapterCreatedAt: latest?.created_at || null,
              ...totals,
            };
          });

          matchedSeries.sort((a, b) => new Date(b.created_at || "").getTime() - new Date(a.created_at || "").getTime());
        }
      }

      setStandalonePosts(standalonePostsList);
      setSeriesList(matchedSeries);

      const totalCount = standalonePostsList.length + matchedSeries.length;
      setTagInfo({ id: tagId, post_count: totalCount });

      // 参与用户数：去重作者数
      const authorIds = new Set<string>();
      for (const p of standalonePostsList) {
        if (p.user_id) authorIds.add(p.user_id);
      }
      for (const s of matchedSeries) {
        if (s.user_id) authorIds.add(s.user_id);
      }
      setParticipantCount(authorIds.size);

      // 浏览：所有作品的互动总数
      let totalInteractions = 0;
      for (const p of standalonePostsList) {
        totalInteractions += (p.like_count || 0) + (p.comment_count || 0) + (p.bookmark_count || 0);
      }
      for (const s of matchedSeries) {
        totalInteractions += s.like_count + s.comment_count + s.bookmark_count;
      }
      setViewCount(totalInteractions);

      if (totalCount !== (tag as Record<string, unknown>).post_count) {
        supabase.from("tags").update({ post_count: totalCount }).eq("id", tagId).then(({ error }: { error: { message?: string } | null }) => {
          if (error) console.error("更新标签篇数失败:", error);
        });
      }

      setLoading(false);
    };
    load();
  }, [decodedName, supabase]);

  // 登录状态只影响关注按钮，不应让整张标签页重新查询帖子和系列。
  useEffect(() => {
    if (!user || !tagInfo?.id) {
      setIsFollowingTag(false);
      return;
    }
    let active = true;
    void supabase
      .from("tag_follows")
      .select("id")
      .eq("user_id", user.id)
      .eq("tag_id", tagInfo.id)
      .maybeSingle()
      .then((result: { data: unknown }) => { if (active) setIsFollowingTag(!!result.data); });
    return () => { active = false; };
  }, [supabase, user?.id, tagInfo?.id]);

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

  const handleShare = useCallback(() => {
    if (typeof window !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href).catch(() => {});
    }
  }, []);

  const openFilterModal = () => {
    setDraftTimeFilter(timeFilter);
    setDraftTypeFilter(typeFilter);
    setIsFilterModalOpen(true);
  };

  const applyMobileFilters = () => {
    setTimeFilter(draftTimeFilter);
    setTypeFilter(draftTypeFilter);
    setIsFilterModalOpen(false);
  };

  useEffect(() => {
    if (!isFilterModalOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsFilterModalOpen(false);
    };
    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [isFilterModalOpen]);

  // 时间筛选
  const applyTimeFilter = (items: Array<Post | SeriesEntry>): Array<Post | SeriesEntry> => {
    if (timeFilter === "all") return items;
    const now = new Date();
    const ranges: Record<Exclude<TimeFilter, "all">, number> = { day: 1, week: 7, month: 30 };
    const cutoff = new Date(now.getTime() - ranges[timeFilter] * 24 * 60 * 60 * 1000);
    return items.filter((item) => {
      const date = "created_at" in item ? item.created_at : "";
      return date && new Date(date) >= cutoff;
    });
  };

  if (loading) {
    return (
      <div id="page-tag" className="min-h-screen bg-paper">
        <main className="main-container">
          <SkeletonTagPage />
        </main>
      </div>
    );
  }

  const hasContent = standalonePosts.length > 0 || seriesList.length > 0;

  // 类型筛选
  const isImagePost = (post: Post) => post.post_type === "illustration" || post.post_type === "comic" || post.post_type === "cosplay";
  const filteredStandalone = typeFilter === "series"
    ? []
    : typeFilter === "image"
      ? standalonePosts.filter(isImagePost)
      : typeFilter === "single"
        ? standalonePosts.filter((post) => !isImagePost(post))
        : standalonePosts;

  const filteredSeries = typeFilter === "single" || typeFilter === "image" ? [] : seriesList;

  // 最热模式下应用时间筛选
  const displayStandalone = tagTab === "hottest" ? applyTimeFilter(filteredStandalone) as Post[] : filteredStandalone;
  const displaySeries = tagTab === "hottest" ? applyTimeFilter(filteredSeries) as SeriesEntry[] : filteredSeries;

  // 最热排序
  if (tagTab === "hottest") {
    displayStandalone.sort((a, b) =>
      ((b.like_count || 0) + (b.comment_count || 0)) - ((a.like_count || 0) + (a.comment_count || 0))
    );
    displaySeries.sort((a, b) =>
      (b.like_count + b.comment_count * 2 + b.bookmark_count * 3) - (a.like_count + a.comment_count * 2 + a.bookmark_count * 3)
    );
  }

  const formatCount = (n: number) => n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n);

  return (
    <div id="page-tag" className="min-h-screen bg-paper">
      <main className="main-container">
        {/* ===== Profile Section ===== */}
        <section className="profile-section">
          <div className="profile-avatar">
            <i className="fa-solid fa-hashtag"></i>
          </div>
          <div className="profile-info">
            <h1 className="profile-name">{decodedName}</h1>
            <p className="profile-bio">浏览标签下的所有作品，发现更多精彩内容</p>
            <div className="profile-stats">
              <div className="profile-stat">
                <i className="fa-solid fa-book"></i>
                <span>作品</span>
                <span className="stat-value">{tagInfo ? tagInfo.post_count : 0}</span>
              </div>
              <div className="profile-stat">
                <i className="fa-solid fa-users"></i>
                <span>参与</span>
                <span className="stat-value">{formatCount(participantCount)}</span>
              </div>
              <div className="profile-stat">
                <i className="fa-solid fa-eye"></i>
                <span>浏览</span>
                <span className="stat-value">{formatCount(viewCount)}</span>
              </div>
            </div>
          </div>
          <div className="profile-actions">
            {user && (
              <button
                type="button"
                className={`profile-action-btn${isFollowingTag ? " saved" : ""}`}
                onClick={handleTagFollow}
                disabled={followLoading}
              >
                {followLoading ? (
                  <i className="fa-solid fa-spinner fa-spin" />
                ) : isFollowingTag ? (
                  <><i className="fa-solid fa-bookmark" /> 已关注</>
                ) : (
                  <><i className="fa-solid fa-bookmark" /> 关注标签</>
                )}
              </button>
            )}
            <button type="button" className="profile-action-btn" onClick={handleShare}>
              <i className="fa-solid fa-share-nodes" /> 分享
            </button>
          </div>
        </section>

        {/* ===== Segmented Tabs ===== */}
        <div className="segmented-tabs">
          <div className="segmented-tabs-left">
            <button
              className={`segmented-tab${tagTab === "latest" ? " active" : ""}`}
              onClick={() => setTagTab("latest")}
            >最新</button>
            <button
              className={`segmented-tab${tagTab === "hottest" ? " active" : ""}`}
              onClick={() => setTagTab("hottest")}
            >最热</button>
          </div>
          {tagTab === "hottest" && (
            <div className="segmented-tabs-right">
              <button
                className={`segmented-tab${timeFilter === "all" ? " active" : ""}`}
                onClick={() => setTimeFilter("all")}
              >全部</button>
              <button
                className={`segmented-tab${timeFilter === "day" ? " active" : ""}`}
                onClick={() => setTimeFilter("day")}
              >一日</button>
              <button
                className={`segmented-tab${timeFilter === "week" ? " active" : ""}`}
                onClick={() => setTimeFilter("week")}
              >一周</button>
              <button
                className={`segmented-tab${timeFilter === "month" ? " active" : ""}`}
                onClick={() => setTimeFilter("month")}
              >一月</button>
            </div>
          )}
        </div>

        {/* ===== Type Filters Row ===== */}
        <div className="type-filters-row">
          <div className="type-filters">
            <button
              className={`type-filter-pill${typeFilter === "all" ? " active" : ""}`}
              onClick={() => setTypeFilter("all")}
            >全部</button>
            <button
              className={`type-filter-pill${typeFilter === "single" ? " active" : ""}`}
              onClick={() => setTypeFilter("single")}
            >单篇</button>
            <button
              className={`type-filter-pill${typeFilter === "image" ? " active" : ""}`}
              onClick={() => setTypeFilter("image")}
            >图片</button>
            <button
              className={`type-filter-pill${typeFilter === "series" ? " active" : ""}`}
              onClick={() => setTypeFilter("series")}
            >长篇连载</button>
          </div>
        </div>

        {/* 移动端筛选入口：选项在弹窗中确认后才应用 */}
        <button
          type="button"
          className="tag-mobile-filter-trigger"
          onClick={openFilterModal}
          aria-haspopup="dialog"
          aria-expanded={isFilterModalOpen}
        >
          <i className="fa-solid fa-sliders" aria-hidden="true" />
          <span>筛选</span>
          {(timeFilter !== "all" || typeFilter !== "all") && <i className="fa-solid fa-circle-check tag-mobile-filter-active" aria-label="已有筛选" />}
        </button>

        {isFilterModalOpen && (
          <div className="tag-filter-modal" role="dialog" aria-modal="true" aria-label="筛选作品">
            <button
              type="button"
              className="tag-filter-modal-backdrop"
              onClick={() => setIsFilterModalOpen(false)}
              aria-label="关闭筛选弹窗"
            />
            <div className="tag-filter-modal-panel">
              <div className="tag-filter-modal-header">
                <h2>筛选作品</h2>
                <button
                  type="button"
                  className="tag-filter-modal-close"
                  onClick={() => setIsFilterModalOpen(false)}
                  aria-label="关闭筛选弹窗"
                >
                  <i className="fa-solid fa-xmark" aria-hidden="true" />
                </button>
              </div>

              {tagTab === "hottest" && (
                <fieldset className="tag-filter-group">
                  <legend>时间范围</legend>
                  <div className="tag-filter-options">
                    {([
                      ["all", "全部"],
                      ["day", "一日"],
                      ["week", "一周"],
                      ["month", "一月"],
                    ] as Array<[TimeFilter, string]>).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        className={`tag-filter-option${draftTimeFilter === value ? " selected" : ""}`}
                        onClick={() => setDraftTimeFilter(value)}
                      >
                        <span>{label}</span>
                        {draftTimeFilter === value && <i className="fa-solid fa-check" aria-hidden="true" />}
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}

              <fieldset className="tag-filter-group">
                <legend>内容类型</legend>
                <div className="tag-filter-options">
                  {([
                    ["all", "全部"],
                    ["single", "单篇"],
                    ["image", "图片"],
                    ["series", "连载"],
                  ] as Array<[TypeFilter, string]>).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={`tag-filter-option${draftTypeFilter === value ? " selected" : ""}`}
                      onClick={() => setDraftTypeFilter(value)}
                    >
                      <span>{label}</span>
                      {draftTypeFilter === value && <i className="fa-solid fa-check" aria-hidden="true" />}
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="tag-filter-modal-actions">
                <button type="button" className="tag-filter-reset" onClick={() => { setDraftTimeFilter("all"); setDraftTypeFilter("all"); }}>
                  重置
                </button>
                <button type="button" className="tag-filter-apply" onClick={applyMobileFilters}>
                  筛选
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ===== Card Grid ===== */}
        {displayStandalone.length === 0 && displaySeries.length === 0 ? (
          <div className="text-center py-12">
            <EmptyState icon="fa-tag" title="该标签下暂无作品" />
          </div>
        ) : (
          <div className="card-grid">
            {displaySeries.map((series) => {
              const postForCard: Post = {
                id: series.id,
                title: series.name,
                content: series.description,
                cover_url: series.cover_url,
                user_id: series.user_id,
                author: series.author,
                like_count: series.like_count,
                comment_count: series.comment_count,
                bookmark_count: series.bookmark_count,
                tags: series.tags,
                created_at: series.created_at,
                series_name: series.name,
                status: "published",
              };
              return <PostTagCard key={`series-${series.id}`} post={postForCard} showAuthorAvatar />;
            })}
            {displayStandalone.map((post) => (
              <PostTagCard key={post.id} post={post} showAuthorAvatar />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
