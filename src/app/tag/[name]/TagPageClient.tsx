"use client";
import SiteIcon from "@/components/SiteIcon";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { SkeletonTagPage } from "@/components/Skeleton";
import EmptyState from "@/components/EmptyState";
import { useAuth } from "@/components/AuthProvider";
import ProfileFilterSelect from "@/components/ProfileFilterSelect";
import TagHistoryCard from "@/components/TagHistoryCard";
import ProfileWorkCard from "@/components/ProfileWorkCard";
import type { Post } from "@/lib/types";
import { slimContent } from "@/lib/feed";
import { includeTestDataForProfile, withTestDataVisibility } from "@/lib/test-data-visibility";

type SortFilter = "published" | "hot";
type TimeFilter = "all" | "day" | "week" | "month";
type TypeFilter = "all" | "single" | "image" | "series";

interface TagInfo {
  id: string;
  post_count: number;
}

interface TagFilters {
  sort: SortFilter;
  time: TimeFilter;
  type: TypeFilter;
}

const timeFilterLabels: Record<TimeFilter, string> = {
  all: "全部时间",
  day: "近一日",
  week: "近一周",
  month: "近一月",
};

function readTagFiltersFromUrl(): TagFilters {
  const params = new URLSearchParams(window.location.search);
  const sort = params.get("sort") === "hot" ? "hot" : "published";
  const requestedTime = params.get("time");
  const time: TimeFilter = sort === "hot" && (requestedTime === "day" || requestedTime === "week" || requestedTime === "month")
    ? requestedTime
    : "all";
  const requestedType = params.get("type");
  const type: TypeFilter = requestedType === "single" || requestedType === "image" || requestedType === "series"
    ? requestedType
    : "all";
  return { sort, time, type };
}

function writeTagFiltersToUrl(filters: TagFilters) {
  const params = new URLSearchParams(window.location.search);
  params.delete("sort");
  params.delete("time");
  params.delete("type");
  if (filters.sort !== "published") params.set("sort", filters.sort);
  if (filters.sort === "hot" && filters.time !== "all") params.set("time", filters.time);
  if (filters.type !== "all") params.set("type", filters.type);
  const query = params.toString();
  const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextUrl !== currentUrl) window.history.pushState(null, "", nextUrl);
}

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

export default function TagPageClient({ decodedName, initialTagInfo }: { decodedName: string; initialTagInfo: TagInfo | null }) {
  const supabase = createClient();
  const { user, profile } = useAuth();
  const [standalonePosts, setStandalonePosts] = useState<Post[]>([]);
  const [seriesList, setSeriesList] = useState<SeriesEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [contentLoaded, setContentLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [tagNotFound, setTagNotFound] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [tagInfo, setTagInfo] = useState<TagInfo | null>(initialTagInfo);
  const [sortFilter, setSortFilter] = useState<SortFilter>("published");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [mobileCardLayout, setMobileCardLayout] = useState<"full" | "square">("full");
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [mobileDraftFilters, setMobileDraftFilters] = useState<TagFilters>({ sort: "published", time: "all", type: "all" });
  const [participantCount, setParticipantCount] = useState(0);
  const [interactionCount, setInteractionCount] = useState(0);
  const [isFollowingTag, setIsFollowingTag] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [followStateLoading, setFollowStateLoading] = useState(true);
  const [followStateError, setFollowStateError] = useState(false);

  useEffect(() => {
    const syncFromUrl = () => {
      const filters = readTagFiltersFromUrl();
      setSortFilter(filters.sort);
      setTimeFilter(filters.time);
      setTypeFilter(filters.type);
    };
    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, []);

  const updateFilters = (filters: TagFilters) => {
    writeTagFiltersToUrl(filters);
    setSortFilter(filters.sort);
    setTimeFilter(filters.time);
    setTypeFilter(filters.type);
  };

  useEffect(() => {
    if (!mobileFilterOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileFilterOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileFilterOpen]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setContentLoaded(false);
      setLoadError(false);
      setTagNotFound(false);
      try {
        const includeTestData = includeTestDataForProfile(profile);
        let tag: TagInfo | null = initialTagInfo ? { ...initialTagInfo } : null;
        if (!tag) {
          const tagResult = await supabase
            .from("tags")
            .select("id, post_count")
            .eq("name", decodedName)
            .maybeSingle();
          if (tagResult.error) throw tagResult.error;
          if (!tagResult.data) {
            if (active) setTagNotFound(true);
            return;
          }
          tag = tagResult.data as TagInfo;
          if (active) setTagInfo(tag);
        }

        const tagId = tag.id;

        // 帖子关联和 series.tags 关联互不依赖，合并成同一波请求。
        const [{ data: ptData, error: postTagsError }, { data: seriesByTag, error: seriesByTagError }] = await Promise.all([
        supabase.from("post_tags").select("post_id").eq("tag_id", tagId),
        withTestDataVisibility(
          supabase.from("series").select("name").contains("tags", [decodedName]),
          includeTestData,
        ),
      ]);
        if (postTagsError) throw postTagsError;
        if (seriesByTagError) throw seriesByTagError;

        let allPosts: Post[] = [];
        let standalonePostsList: Post[] = [];
        const chapterSeriesNames: Set<string> = new Set();

        if (ptData && ptData.length > 0) {
        const postIds = ptData.map((p: Record<string, unknown>) => p.post_id as string);
        const postsPromise = withTestDataVisibility(
          supabase
            .from("posts")
            .select("id, title, content, word_count, post_type, chapter_number, series_name, created_at, published_at, cover_url, user_id, author:profiles!posts_user_id_fkey(nickname, avatar_url), post_tags(tags(name))")
            .in("id", postIds)
            .eq("status", "published"),
          includeTestData,
        );
        const statsPromise = supabase
          .from("post_stats")
          .select("id, like_count, comment_count, bookmark_count")
          .in("id", postIds);
        const [{ data: postsData, error: postsError }, { data: stats, error: statsError }] = await Promise.all([postsPromise, statsPromise]);
        if (postsError) throw postsError;
        if (statsError) throw statsError;

        if (postsData) {
          for (const p of postsData as Array<Record<string, unknown>>) {
            // 只有真正的 serial 章节才合并为长篇连载；图片作品加入合集时也可能有 series_name，不能误合并。
            if (p.post_type === "serial" && p.series_name) {
              chapterSeriesNames.add(p.series_name as string);
            }
          }

          const statsMap: Record<string, { like_count: number; comment_count: number; bookmark_count: number }> = {};
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
              word_count: p.word_count as number, created_at: p.created_at as string, published_at: p.published_at as string | null,
              user_id: p.user_id as string,
              author: { nickname: a?.nickname || "匿名用户", avatar_url: a?.avatar_url },
              like_count: s.like_count, comment_count: s.comment_count, bookmark_count: s.bookmark_count,
              tags: tagNames,
            } as Post;
          });

          // 图片正文和封面可能存的是私有存储标记，列表也需要像阅读页一样签名后才能预览。
          const privateMarker = /private:\/\/private-post-images\/([A-Za-z0-9/_\-.]+)/g;
          const privatePaths = new Set<string>();
          for (const post of allPosts) {
            for (const source of [post.content || "", post.cover_url || ""]) {
              for (const match of source.matchAll(privateMarker)) privatePaths.add(match[1]);
            }
          }
          const signedUrls = new Map<string, string>();
          await Promise.all([...privatePaths].map(async (path) => {
            const { data } = await supabase.storage.from("private-post-images").createSignedUrl(path, 3600);
            if (data?.signedUrl) signedUrls.set(`private://private-post-images/${path}`, data.signedUrl);
          }));
          allPosts = allPosts.map((post) => ({
            ...post,
            content: (post.content || "").replace(privateMarker, (marker) => signedUrls.get(marker) || marker),
            cover_url: post.cover_url?.replace(privateMarker, (marker) => signedUrls.get(marker) || marker) || null,
          }));

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
        const { data: seriesData, error: seriesDataError } = await withTestDataVisibility(
          supabase
            .from("series")
            .select("id, name, cover_url, description, tags, status, series_type, created_at, user_id")
            .in("name", [...allSeriesNames]),
          includeTestData,
        );
        if (seriesDataError) throw seriesDataError;

        if (seriesData && seriesData.length > 0) {
          const rawSeries = seriesData as unknown as SeriesEntry[];

          const userIds = [...new Set(rawSeries.map((s) => s.user_id))];
          const chapterRowsPromise = withTestDataVisibility(
            supabase
              .from("posts")
              .select("id, series_name, chapter_number, created_at")
              .in("series_name", [...allSeriesNames])
              .eq("post_type", "serial")
              .eq("status", "published"),
            includeTestData,
          );
          const profilesPromise = userIds.length > 0
            ? supabase.from("profiles").select("id, nickname, avatar_url").in("id", userIds)
            : Promise.resolve({ data: null, error: null });
          const [{ data: profiles, error: profilesError }, { data: chapterRows, error: chapterRowsError }] = await Promise.all([profilesPromise, chapterRowsPromise]);
          if (profilesError) throw profilesError;
          if (chapterRowsError) throw chapterRowsError;
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
              ? withTestDataVisibility(
                supabase.from("posts").select("id, title, content").in("id", latestIds),
                includeTestData,
              )
              : Promise.resolve({ data: null, error: null }),
            chapterIds.length > 0
              ? supabase.from("post_stats").select("id, like_count, comment_count, bookmark_count").in("id", chapterIds)
              : Promise.resolve({ data: null, error: null }),
          ]);
          if (latestResult.error) throw latestResult.error;
          if (statsResult.error) throw statsResult.error;
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

        if (!active) return;
        setStandalonePosts(standalonePostsList);
        setSeriesList(matchedSeries);
        setContentLoaded(true);

        const totalCount = standalonePostsList.length + matchedSeries.length;
        setTagInfo({ id: tagId, post_count: totalCount });

        // 创作者数：按作品和系列作者去重。
        const authorIds = new Set<string>();
        for (const p of standalonePostsList) {
          if (p.user_id) authorIds.add(p.user_id);
        }
        for (const s of matchedSeries) {
          if (s.user_id) authorIds.add(s.user_id);
        }
        setParticipantCount(authorIds.size);

        // 互动：所有作品的点赞、评论和收藏数之和。
        let totalInteractions = 0;
        for (const p of standalonePostsList) {
          totalInteractions += (p.like_count || 0) + (p.comment_count || 0) + (p.bookmark_count || 0);
        }
        for (const s of matchedSeries) {
          totalInteractions += s.like_count + s.comment_count + s.bookmark_count;
        }
        setInteractionCount(totalInteractions);

        // post_count 是正式空间的共享冗余字段，测试账号的可见数量不能回写进去。
        if (!includeTestData && totalCount !== tag.post_count) {
          supabase.from("tags").update({ post_count: totalCount }).eq("id", tagId).then(({ error }: { error: { message?: string } | null }) => {
            if (error) console.error("更新标签篇数失败:", error);
          });
        }

      } catch (error) {
        if (active) {
          console.error("加载标签内容失败:", error);
          setLoadError(true);
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [decodedName, supabase, profile, initialTagInfo, reloadToken]);

  useEffect(() => {
    let active = true;
    const loadFollowState = async () => {
      if (!tagInfo?.id) return;
      if (!user?.id) {
        setIsFollowingTag(false);
        setFollowStateLoading(false);
        setFollowStateError(false);
        return;
      }
      setFollowStateLoading(true);
      setFollowStateError(false);
      const { data, error } = await supabase
        .from("tag_follows")
        .select("tag_id")
        .eq("tag_id", tagInfo.id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!active) return;
      if (error) {
        setFollowStateError(true);
        setFollowStateLoading(false);
        return;
      }
      setIsFollowingTag(Boolean(data));
      setFollowStateLoading(false);
    };
    void loadFollowState();
    return () => { active = false; };
  }, [supabase, tagInfo?.id, user?.id]);

  const handleTagFollow = async () => {
    if (!user?.id || !tagInfo?.id || followLoading) return;
    setFollowLoading(true);
    const nextFollowing = !isFollowingTag;
    const result = nextFollowing
      ? await supabase.from("tag_follows").insert({ tag_id: tagInfo.id, user_id: user.id })
      : await supabase.from("tag_follows").delete().eq("tag_id", tagInfo.id).eq("user_id", user.id);
    if (!result.error) setIsFollowingTag(nextFollowing);
    setFollowLoading(false);
  };

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

  if (tagNotFound) {
    return (
      <div id="page-tag" className="min-h-screen bg-paper">
        <main className="main-container">
          <EmptyState icon="fa-tag" title="没有找到这个标签" description="请检查标签名称，或返回首页继续浏览。" actionLabel="返回首页" actionHref="/" />
        </main>
      </div>
    );
  }

  if (loading) {
    return (
      <div id="page-tag" className="min-h-screen bg-paper">
        <main className="main-container">
          <SkeletonTagPage />
        </main>
      </div>
    );
  }

  if (loadError && !tagInfo) {
    return (
      <div id="page-tag" className="min-h-screen bg-paper">
        <main className="main-container">
          <EmptyState icon="fa-tag" title="标签内容暂时无法加载" description="请检查网络连接后重试。" actionLabel="重试" actionOnClick={() => setReloadToken((token) => token + 1)} />
        </main>
      </div>
    );
  }

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

  // 最热模式下应用时间筛选；显示数组使用副本，避免筛选操作改写原始查询结果。
  const displayStandalone = (sortFilter === "hot" ? applyTimeFilter([...filteredStandalone]) : [...filteredStandalone]) as Post[];
  const displaySeries = (sortFilter === "hot" ? applyTimeFilter([...filteredSeries]) : [...filteredSeries]) as SeriesEntry[];

  if (sortFilter === "hot") {
    displayStandalone.sort((a, b) =>
      ((b.like_count || 0) + (b.comment_count || 0)) - ((a.like_count || 0) + (a.comment_count || 0))
    );
    displaySeries.sort((a, b) =>
      (b.like_count + b.comment_count * 2 + b.bookmark_count * 3) - (a.like_count + a.comment_count * 2 + a.bookmark_count * 3)
    );
  } else if (sortFilter === "published") {
    displayStandalone.sort((a, b) => new Date(b.published_at || b.created_at || "").getTime() - new Date(a.published_at || a.created_at || "").getTime());
    displaySeries.sort((a, b) => new Date(b.created_at || "").getTime() - new Date(a.created_at || "").getTime());
  } else {
    displayStandalone.sort((a, b) => new Date(b.created_at || "").getTime() - new Date(a.created_at || "").getTime());
    displaySeries.sort((a, b) => new Date(b.created_at || "").getTime() - new Date(a.created_at || "").getTime());
  }

  const formatCount = (n: number) => n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n);
  const displayedCount = displayStandalone.length + displaySeries.length;
  const typeFilteredCount = filteredStandalone.length + filteredSeries.length;
  const hasAnyTagWorks = standalonePosts.length + seriesList.length > 0;
  const followButtonLabel = followStateLoading
    ? "加载中"
    : followStateError
      ? "状态未加载"
      : isFollowingTag
        ? "已关注"
        : "关注";

  return (
    <div id="page-tag" className="min-h-screen bg-paper">
      <main className="main-container">
        {/* ===== Profile Section ===== */}
        <section className="profile-section">
          <div className="profile-avatar">
            <SiteIcon name="fa-tag" variant="solid" />
          </div>
          <div className="profile-info">
            <h1 className="profile-name">{decodedName}</h1>
            <div className="profile-stats">
              <div className="profile-stat">
                <SiteIcon name="fa-tag-works" aria-hidden="true" />
                <span>作品</span>
                <span className="stat-value">{tagInfo ? tagInfo.post_count : 0}</span>
              </div>
              <div className="profile-stat">
                <SiteIcon name="fa-tag-participants" aria-hidden="true" />
                <span>创作者</span>
                <span className="stat-value">{contentLoaded ? formatCount(participantCount) : "—"}</span>
              </div>
              <div className="profile-stat">
                <SiteIcon name="fa-tag-heat" aria-hidden="true" />
                <span>互动</span>
                <span className="stat-value">{contentLoaded ? formatCount(interactionCount) : "—"}</span>
              </div>
            </div>
          </div>
          <div className="profile-actions">
            <button
              type="button"
              className="profile-action-btn profile-action-btn--primary"
              onClick={() => void handleTagFollow()}
              disabled={followLoading || followStateLoading || followStateError}
              aria-label={followStateError ? "关注状态暂时无法读取" : followButtonLabel}
            >
              <SiteIcon name={isFollowingTag ? "fa-check" : "fa-plus"} variant="solid" className="profile-action-icon" aria-hidden="true" />
              <span className="profile-action-label">{followButtonLabel}</span>
            </button>
          </div>
        </section>

        <section className="tag-filter-selectors" aria-label="筛选作品">
          <div className={`tag-filter-selectors__sort${sortFilter === "hot" ? " tag-filter-selectors__sort--with-time" : ""}`}>
            <ProfileFilterSelect
              label="排序"
              id="tag-sort-menu"
              value={sortFilter}
              options={[{ value: "published", label: "最新发布" }, { value: "hot", label: "热度最高" }]}
              onChange={(value) => updateFilters({ sort: value as SortFilter, time: value === "hot" ? timeFilter : "all", type: typeFilter })}
            />
            <div className="tag-hot-time-select">
              <ProfileFilterSelect
                label="热度时间范围"
                id="tag-hot-time-menu"
                value={timeFilter}
                disabled={sortFilter !== "hot"}
                options={[{ value: "all", label: "全部" }, { value: "day", label: "一日" }, { value: "week", label: "一周" }, { value: "month", label: "一月" }]}
                onChange={(value) => updateFilters({ sort: sortFilter, time: value as TimeFilter, type: typeFilter })}
              />
            </div>
            {sortFilter === "hot" && (
              <div className="tag-hot-time-buttons" role="group" aria-label="热度时间范围">
                {[{ value: "all", label: "全部" }, { value: "day", label: "一日" }, { value: "week", label: "一周" }, { value: "month", label: "一月" }].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={timeFilter === option.value ? "is-selected" : ""}
                    onClick={() => updateFilters({ sort: sortFilter, time: option.value as TimeFilter, type: typeFilter })}
                    aria-pressed={timeFilter === option.value}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="tag-filter-selectors__type">
            <ProfileFilterSelect
              label="作品类型"
              id="tag-type-menu"
              value={typeFilter}
              options={[{ value: "all", label: "所有作品" }, { value: "single", label: "单篇" }, { value: "image", label: "图片" }, { value: "series", label: "长篇连载" }]}
              onChange={(value) => updateFilters({ sort: sortFilter, time: timeFilter, type: value as TypeFilter })}
            />
          </div>
        </section>

        {/* ===== Card Grid ===== */}
        {!loadError && <div className="tag-mobile-filter-bar">
          <button type="button" className="profile-mobile-filter-button profile-mobile-icon-button" onClick={() => {
            setMobileDraftFilters({ sort: sortFilter, time: timeFilter, type: typeFilter });
            setMobileFilterOpen(true);
          }} aria-label="打开筛选">
            <SiteIcon name="fa-filter" variant="default" aria-hidden="true" />
          </button>
          {displayedCount > 0 && <button type="button" className="profile-mobile-filter-button profile-mobile-icon-button" onClick={() => setMobileCardLayout((current) => current === "full" ? "square" : "full")} aria-label={mobileCardLayout === "full" ? "切换为三列卡片" : "切换为一列卡片"} aria-pressed={mobileCardLayout === "square"}>
            <SiteIcon name={mobileCardLayout === "full" ? "fa-card-compact" : "fa-list-compact"} variant="default" aria-hidden="true" />
          </button>}
        </div>}
        {mobileFilterOpen && <div className="tag-filter-drawer-backdrop" role="presentation" onClick={() => setMobileFilterOpen(false)}>
          <section className="tag-filter-drawer" role="dialog" aria-modal="true" aria-label="筛选作品" onClick={(event) => event.stopPropagation()}>
            <h2>筛选作品</h2>
            <div className="tag-filter-drawer-section"><strong>排序</strong><div>
              {([{ value: "published", label: "最新发布" }, { value: "hot", label: "热度最高" }] as const).map(({ value, label }) => <button key={value} type="button" className={`tag-filter-control${mobileDraftFilters.sort === value ? " is-active" : ""}`} onClick={() => setMobileDraftFilters((current) => ({ ...current, sort: value, time: value === "hot" ? current.time : "all" }))}>{label}</button>)}
            </div></div>
            {mobileDraftFilters.sort === "hot" && <div className="tag-filter-drawer-section"><strong>热度时间范围</strong><div>
              {([{ value: "all", label: "全部" }, { value: "day", label: "一日" }, { value: "week", label: "一周" }, { value: "month", label: "一月" }] as const).map(({ value, label }) => <button key={value} type="button" className={`tag-filter-control${mobileDraftFilters.time === value ? " is-active" : ""}`} onClick={() => setMobileDraftFilters((current) => ({ ...current, time: value }))}>{label}</button>)}
            </div></div>}
            <div className="tag-filter-drawer-section"><strong>作品类型</strong><div>
              {([{ value: "all", label: "所有作品" }, { value: "single", label: "单篇" }, { value: "image", label: "图片" }, { value: "series", label: "长篇连载" }] as const).map(({ value, label }) => <button key={value} type="button" className={`tag-filter-control${mobileDraftFilters.type === value ? " is-active" : ""}`} onClick={() => setMobileDraftFilters((current) => ({ ...current, type: value }))}>{label}</button>)}
            </div></div>
            <div className="tag-filter-drawer-actions">
              <button type="button" onClick={() => setMobileDraftFilters({ sort: "published", time: "all", type: "all" })}>重置</button>
              <button type="button" className="is-primary" onClick={() => { updateFilters(mobileDraftFilters); setMobileFilterOpen(false); }}>应用筛选</button>
            </div>
          </section>
        </div>}
        {loadError ? (
          <div className="tag-load-error" role="alert">
            <EmptyState icon="fa-tag" title="标签内容暂时无法加载" description="请检查网络连接后重试。" actionLabel="重试" actionOnClick={() => setReloadToken((token) => token + 1)} />
          </div>
        ) : displayedCount === 0 ? (
          <div className="text-center py-12">
            {!hasAnyTagWorks ? (
              <EmptyState icon="fa-tag" title="该标签下暂无作品" description="这个标签还没有公开作品。" />
            ) : typeFilteredCount === 0 ? (
              <EmptyState
                icon="fa-tag"
                title="没有符合此类型的作品"
                description="试试查看该标签下的所有作品。"
                actionLabel="查看所有作品"
                actionOnClick={() => updateFilters({ sort: "published", time: "all", type: "all" })}
              />
            ) : sortFilter === "hot" && timeFilter !== "all" ? (
              <EmptyState
                icon="fa-tag"
                title={`${timeFilterLabels[timeFilter]}暂无作品`}
                description="可以清除时间范围，查看该标签下的全部热度作品。"
                actionLabel="查看全部热度"
                actionOnClick={() => updateFilters({ sort: "hot", time: "all", type: typeFilter })}
              />
            ) : (
              <EmptyState icon="fa-tag" title="没有符合当前筛选条件的作品" description="试试清除筛选条件。" actionLabel="清除筛选" actionOnClick={() => updateFilters({ sort: "published", time: "all", type: "all" })} />
            )}
          </div>
        ) : (
          <>
          <div className={`tag-history-card-grid${mobileCardLayout === "square" ? " is-mobile-square" : ""}`}>
            {displaySeries.map((series) => {
              const postForCard: Post = {
                id: series.id,
                title: series.latestChapterTitle || series.name,
                content: series.description || series.latestChapterContent || "",
                cover_url: series.cover_url,
                user_id: series.user_id,
                author: series.author,
                like_count: series.like_count,
                comment_count: series.comment_count,
                bookmark_count: series.bookmark_count,
                tags: series.tags,
                created_at: series.created_at,
                post_type: "serial",
                series_name: series.name,
                chapter_number: series.latestChapterNumber,
                status: "published",
              };
              return <TagHistoryCard key={`series-${series.id}`} post={postForCard} />;
            })}
            {displayStandalone.map((post) => (
              <TagHistoryCard key={post.id} post={post} />
            ))}
          </div>
          <div className={`profile-card-device profile-card-device--mobile-square tag-square-device${mobileCardLayout === "square" ? " is-active" : ""}`}>
            <div className="card-device__cards">
              {displaySeries.map((series) => <ProfileWorkCard key={`square-series-${series.id}`} series={{ ...series, id: series.name }} mode="mobile-square" />)}
              {displayStandalone.map((post) => <ProfileWorkCard key={`square-post-${post.id}`} post={post} mode="mobile-square" />)}
            </div>
          </div>
          </>
        )}
      </main>
    </div>
  );
}
