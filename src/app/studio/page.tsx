"use client";
import SiteIcon from "@/components/SiteIcon";
import type { InklandIconName } from "@/components/inkland/iconRegistry";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import HomeSidebar from "@/components/HomeSidebar";
import ProfileFilterSelect from "@/components/ProfileFilterSelect";
import { createClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/AuthProvider";
import { getThumbnailUrl } from "@/lib/image";
import { slimContent } from "@/lib/feed";
import { SkeletonStudio } from "@/components/Skeleton";
import { useAppDialog } from "@/components/AppDialogProvider";
import { assertCanPublish } from "@/lib/userRestrictions";
import { getOrCreateClientCache, invalidateClientCache } from "@/lib/client-cache";

type FilterType = "all" | "novel" | "illustration" | "serial";
type StatusFilter = "all" | "published" | "draft" | "rejected";
type SortType = "updated" | "created" | "popular";

interface WorkItem {
  id: string;
  title: string;
  content: string | null;
  cover_url: string | null;
  post_type: string;
  status: string;
  review_status: string;
  review_reason: string | null;
  word_count: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  series_name: string | null;
  chapter_number: number | null;
  like_count: number;
  comment_count: number;
  bookmark_count: number;
  series_chapter_count?: number;
  tags?: string[];
}

interface SeriesWorkItem {
  id: string;
  name: string;
  description: string;
  series_type: string;
  created_at: string;
  updated_at: string | null;
  chapter_count: number;
  tags: string[];
}

interface StudioWorksResponse {
  data: Record<string, unknown>[];
  stats: Array<Record<string, unknown>>;
}

export default function StudioPage() {
  const supabase = createClient();
  const { user, loading: authLoading } = useAuth();
  const dialog = useAppDialog();
  const [works, setWorks] = useState<WorkItem[]>([]);
  const [seriesList, setSeriesList] = useState<SeriesWorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvedImageUrls, setResolvedImageUrls] = useState<Record<string, string[]>>({});
  const [filter, setFilter] = useState<FilterType>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortType, setSortType] = useState<SortType>("updated");
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [mobileDraftFilter, setMobileDraftFilter] = useState<FilterType>("all");
  const [mobileDraftStatus, setMobileDraftStatus] = useState<StatusFilter>("all");
  const [mobileDraftSort, setMobileDraftSort] = useState<SortType>("updated");
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [shownWorks, setShownWorks] = useState(12);
  const workLoadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setShownWorks(12);
  }, [filter, statusFilter, searchQuery, sortType]);

  useEffect(() => {
    if (!user) return;
    loadWorks();
    loadSeries();
  }, [user]);

  const loadWorks = async () => {
    if (!user) return;
    setLoading(true);

    // 优先走服务端聚合路由（机房内拉取 posts+stats 并瘦身，客户端只下载轻量数据）；
    // 本地 dev 或路由异常时回落客户端直连。
    let data: Record<string, unknown>[] | null = null;
    let statsRows: Array<Record<string, unknown>> | null = null;
    try {
      const cached = await getOrCreateClientCache<StudioWorksResponse>(
        `studio-works:${user.id}`,
        async () => {
          const apiResp = await fetch("/api/studio-works", { credentials: "same-origin" });
          if (!apiResp.ok) throw new Error(`studio works request failed: ${apiResp.status}`);
          const json = await apiResp.json();
          if (!json || !Array.isArray(json.data)) throw new Error("studio works response invalid");
          return {
            data: json.data as Record<string, unknown>[],
            stats: Array.isArray(json.stats) ? json.stats as Array<Record<string, unknown>> : [],
          };
        },
        { ttlMs: 30_000, persist: true },
      );
      data = cached.data;
      statsRows = cached.stats;
    } catch {
      // 回落直连
    }

    let statsPromise: Promise<{ data: unknown }> | null = null;
    if (data === null) {
      const q = supabase
        .from("posts")
        .select("id, title, content, cover_url, post_type, status, review_status, review_reason, word_count, created_at, updated_at, published_at, series_name, chapter_number, post_tags(tags(name))")
        .eq("user_id", user.id)
        // 连载章节不在作品列表展示（由系列区承载），服务端直接排除，
        // 避免批量导入的章节把 limit(50) 挤占并白拉回大量正文。
        .neq("post_type", "serial")
        .order("updated_at", { ascending: false });
      const res = await q.limit(50);
      if (!res.data) { setLoading(false); return; }
      // 直连回落路径同样瘦身：卡片只消费摘要+图片，超长全文交给编辑器
      data = (res.data as unknown as Record<string, unknown>[]).map((p) => ({
        ...p,
        content: slimContent((p.content as string) || ""),
      }));
      const ids = (data as Record<string, unknown>[]).map((p) => p.id as string);
      statsPromise = ids.length > 0
        ? Promise.resolve(
            supabase
              .from("post_stats")
              .select("id, like_count, comment_count, bookmark_count")
              .in("id", ids)
              .then((r: { data: unknown }) => ({ data: r.data }))
          )
        : null;
    }

    const filtered = (data as Record<string, unknown>[]).filter((p) => {
      return p.post_type !== "serial";
    });

    // 解析私有图片的 signed URL
    const imageTypes = new Set(["illustration", "comic", "cosplay"]);
    const privateMarker = /private:\/\/private-post-images\/([A-Za-z0-9/_\-.]+)/g;
    const urlMap: Record<string, string[]> = {};
    const resolveTasks = filtered
      .filter((w) => imageTypes.has(w.post_type as string) && (w.content as string | null)?.includes("private://"))
      .map(async (w) => {
        const content = (w.content as string) || "";
        const paths = [...content.matchAll(privateMarker)].map((m) => m[1]);
        const results = await Promise.all(
          paths.map(async (path) => {
            const { data } = await supabase.storage.from("private-post-images").createSignedUrl(path, 3600);
            return { marker: `private://private-post-images/${path}`, signedUrl: data?.signedUrl || null };
          })
        );
        let resolved = content;
        for (const { marker, signedUrl } of results) {
          if (signedUrl) resolved = resolved.split(marker).join(signedUrl);
        }
        urlMap[w.id as string] = [...resolved.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]);
      });
    const resolveAll = resolveTasks.length > 0 ? Promise.all(resolveTasks) : Promise.resolve([]);

    let stats: Array<Record<string, unknown>> | null = statsRows;
    if (statsPromise) {
      const r = await statsPromise;
      stats = r.data as Array<Record<string, unknown>> | null;
    }
    const statsMap = new Map<string, { like_count: number; comment_count: number; bookmark_count: number }>();
    if (stats) for (const s of stats) {
      statsMap.set(s.id as string, {
        like_count: s.like_count as number,
        comment_count: s.comment_count as number,
        bookmark_count: s.bookmark_count as number,
      });
    }

    const workList = filtered.map((p) => {
      const s = statsMap.get(p.id as string) || { like_count: 0, comment_count: 0, bookmark_count: 0 };
      const postTags = (p.post_tags as Array<{ tags?: { name?: string } | null }> | undefined) || [];
      return { ...p, ...s, tags: postTags.map((item) => item.tags?.name).filter((name): name is string => Boolean(name)) } as WorkItem;
    });
    setWorks(workList);
    setLoading(false);

    if (resolveTasks.length > 0) {
      await resolveAll;
      setResolvedImageUrls((prev) => ({ ...prev, ...urlMap }));
    }
  };

  const loadSeries = async () => {
    if (!user) return;
    // 系列元数据与「我的全部连载章节行」互不依赖，并行取回（原实现串行两轮）。
    // 章节行只取 series_name 用于计数，不拉正文；按 user_id 圈定比按 series_name
    // 更精确，避免同名系列的其他作者章节被误计入。
    const { data, chapterRows } = await getOrCreateClientCache<{
      data: unknown[] | null;
      chapterRows: unknown[] | null;
    }>(
      `studio-series:${user.id}`,
      async () => {
        const [{ data }, { data: chapterRows }] = await Promise.all([
          supabase
            .from("series")
            .select("id, name, description, tags, series_type, created_at, updated_at")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false }),
          supabase
            .from("posts")
            .select("series_name")
            .eq("user_id", user.id)
            .eq("post_type", "serial"),
        ]);
        return { data, chapterRows };
      },
      { ttlMs: 30_000, persist: true },
    );

    if (data) {
      const seen = new Set<string>();
      const deduped = (data as unknown as SeriesWorkItem[]).filter((s) => {
        if (seen.has(s.name)) return false;
        seen.add(s.name);
        return true;
      });
      const chapterCountMap = new Map<string, number>();
      for (const row of (chapterRows || []) as Array<{ series_name: string | null }>) {
        if (row.series_name) chapterCountMap.set(row.series_name, (chapterCountMap.get(row.series_name) || 0) + 1);
      }
      setSeriesList(deduped.map((s) => ({ ...s, chapter_count: chapterCountMap.get(s.name) || 0 })));
    }
  };

  const handleDelete = async (work: WorkItem) => {
    if (!await dialog.confirm({ title:"删除作品", message:`确定要删除《${work.title || "未命名作品"}》吗？删除后无法恢复。`, confirmLabel:"删除作品", variant:"danger" })) return;
    if (work.post_type === "serial" && work.series_name) {
      const { error: postsError } = await supabase
        .from("posts")
        .delete()
        .eq("user_id", user?.id)
        .eq("series_name", work.series_name);
      if (postsError) { await dialog.alert({ title:"删除失败", message:`删除连载章节失败：${postsError.message}`, variant:"danger" }); return; }
      const { error: seriesError } = await supabase
        .from("series")
        .delete()
        .eq("id", work.id)
        .eq("user_id", user?.id);
      if (seriesError) { await dialog.alert({ title:"删除失败", message:`删除合集失败：${seriesError.message}`, variant:"danger" }); return; }
      setSeriesList((prev) => prev.filter((s) => s.id !== work.id));
    } else {
      const { error } = await supabase.from("posts").delete().eq("id", work.id).eq("user_id", user?.id);
      if (error) { await dialog.alert({ title:"删除失败", message:error.message, variant:"danger" }); return; }
    }
    setWorks((prev) => prev.filter((w) => w.id !== work.id));
    invalidateClientCache(`studio-works:${user?.id || ""}`);
    invalidateClientCache(`studio-series:${user?.id || ""}`);
    window.dispatchEvent(new Event("inkland:stats-changed"));
  };

  // Filter by type
  const typeFilteredWorks = filter === "all"
    ? works
    : works.filter((w) => w.post_type === filter);
  const filteredWorks = searchQuery
    ? typeFilteredWorks.filter((w) => w.title?.toLowerCase().includes(searchQuery.toLowerCase()))
    : typeFilteredWorks;

  // Series as works
  const seriesAsWorks: WorkItem[] = seriesList.map((s) => ({
    id: s.id,
    title: s.name,
    content: s.description || null,
    // 创作中心不读取连载封面，避免封面字段影响连载作品的识别。
    cover_url: null,
    post_type: "serial",
    status: "published",
    review_status: "approved",
    review_reason: null,
    word_count: 0,
    published_at: null,
    created_at: s.created_at,
    updated_at: s.updated_at || s.created_at,
    series_name: s.name,
    chapter_number: null,
    like_count: 0,
    comment_count: 0,
    bookmark_count: 0,
    series_chapter_count: s.chapter_count,
    tags: s.tags || [],
  }));

  const seriesFiltered = searchQuery
    ? seriesAsWorks.filter((s) => s.title?.toLowerCase().includes(searchQuery.toLowerCase()))
    : seriesAsWorks;

  const showSeries = filter === "all" || filter === "serial";
  let allWorks = [...filteredWorks, ...(showSeries ? seriesFiltered : [])];

  // Filter by status
  if (statusFilter !== "all") {
    allWorks = allWorks.filter((w) => {
      if (statusFilter === "rejected") return w.review_status === "rejected";
      if (statusFilter === "published") return w.status === "published" && w.review_status !== "rejected";
      if (statusFilter === "draft") return w.status === "draft" && w.review_status !== "rejected";
      return true;
    });
  }

  // Sort
  const sortKey = sortType === "updated" ? "updated_at" : "created_at";
  if (sortType === "popular") {
    allWorks.sort((a, b) => (b.like_count + b.comment_count + b.bookmark_count) - (a.like_count + a.comment_count + a.bookmark_count));
  } else {
    allWorks.sort((a, b) => {
      const da = new Date(a[sortKey] || a.created_at).getTime();
      const db = new Date(b[sortKey] || b.created_at).getTime();
      return db - da;
    });
  }

  useEffect(() => {
    const el = workLoadMoreRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setShownWorks((count) => count + 12);
      },
      { rootMargin: "240px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [allWorks.length, filter, statusFilter, searchQuery, sortType]);

  // Stats (from unfiltered data, not affected by type filter)
  const allPostsForStats = works.filter((w) => w.post_type !== "serial");
  const publishedCount = allPostsForStats.filter((w) => w.status === "published" && w.review_status !== "rejected").length + seriesList.length;
  const draftCount = allPostsForStats.filter((w) => w.status === "draft" && w.review_status !== "rejected").length;
  const rejectedCount = allPostsForStats.filter((w) => w.review_status === "rejected").length;

  const typeFilters: { key: FilterType; label: string }[] = [
    { key: "all", label: "全部作品" },
    { key: "novel", label: "单篇" },
    { key: "illustration", label: "图片" },
    { key: "serial", label: "长篇连载" },
  ];

  const statusFilters: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "全部状态" },
    { key: "published", label: "已发布" },
    { key: "draft", label: "草稿" },
    { key: "rejected", label: "未过审" },
  ];

  const sortOptions: { key: SortType; label: string }[] = [
    { key: "updated", label: "最近更新" },
    { key: "created", label: "最近创建" },
    { key: "popular", label: "热度最高" },
  ];

  const openMobileFilter = () => {
    setMobileDraftFilter(filter);
    setMobileDraftStatus(statusFilter);
    setMobileDraftSort(sortType);
    setMobileFilterOpen(true);
  };

  const applyMobileFilter = () => {
    setFilter(mobileDraftFilter);
    setStatusFilter(mobileDraftStatus);
    setSortType(mobileDraftSort);
    setMobileFilterOpen(false);
  };

  const typeFilterOptions = typeFilters.map((item) => ({ value: item.key, label: item.label }));
  const statusFilterOptions = statusFilters.map((item) => ({ value: item.key, label: item.label }));
  const sortFilterOptions = sortOptions.map((item) => ({ value: item.key, label: item.label }));
  const renderFilterSelectors = (prefix: string) => (
    <>
      <ProfileFilterSelect label="作品类型" id={`${prefix}-type-menu`} value={filter} options={typeFilterOptions} onChange={(value) => setFilter(value as FilterType)} />
      <ProfileFilterSelect label="发布状态" id={`${prefix}-status-menu`} value={statusFilter} options={statusFilterOptions} onChange={(value) => setStatusFilter(value as StatusFilter)} />
      <ProfileFilterSelect label="排序" id={`${prefix}-sort-menu`} value={sortType} options={sortFilterOptions} onChange={(value) => setSortType(value as SortType)} />
    </>
  );

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "illustration":
      case "comic":
      case "cosplay": return "图片";
      case "serial": return "长篇连载";
      case "novel": return "单篇";
      default: return type;
    }
  };

  const getTypeIcon = (type: string): InklandIconName => {
    switch (type) {
      case "illustration":
      case "comic":
      case "cosplay": return "fa-image";
      case "serial": return "fa-book";
      default: return "fa-feather-pointed";
    }
  };

  const getImageUrls = (content?: string | null) => {
    if (!content) return [];
    return [...content.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]);
  };

  const getExcerpt = (content?: string | null) => {
    if (!content) return "";
    return content
      .replace(/!\[[^\]]*\]\(([^)]+)\)/g, "")
      .replace(/[#>*_`~-]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  };

  const handleTagDragStart = (event: React.MouseEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    const startX = event.clientX;
    const startScrollLeft = element.scrollLeft;
    const handleMove = (moveEvent: MouseEvent) => {
      element.scrollLeft = startScrollLeft - (moveEvent.clientX - startX);
    };
    const handleUp = () => {
      element.classList.remove("is-dragging");
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };
    element.classList.add("is-dragging");
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
  };

  useEffect(() => {
    const tagRows = Array.from(document.querySelectorAll<HTMLElement>(".studio-card-tags"));
    const updateOverflow = (element: HTMLElement) => {
      element.classList.toggle("has-overflow", element.scrollWidth > element.clientWidth + 1);
    };
    const observers = tagRows.map((element) => {
      updateOverflow(element);
      const observer = new ResizeObserver(() => updateOverflow(element));
      observer.observe(element);
      return observer;
    });
    return () => observers.forEach((observer) => observer.disconnect());
  }, [allWorks.length, filter, statusFilter, searchQuery]);

  const getStatusClass = (w: WorkItem) => {
    if (w.review_status === "rejected") return "status-rejected";
    if (w.status === "published") return "status-published";
    return "status-draft";
  };

  const isScheduled = (w: WorkItem) => w.status === "draft" && w.published_at && new Date(w.published_at).getTime() > Date.now();

  const getStatusLabel = (w: WorkItem) => {
    if (w.review_status === "rejected") return "未过审";
    if (w.review_status === "pending" && w.status === "published") return "已发布";
    if (w.review_status === "pending") return "审核中";
    if (w.status === "published") return "已发布";
    if (isScheduled(w)) return "定时发布";
    return "草稿";
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === allWorks.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allWorks.map((w) => w.id)));
    }
  };

  const batchPublish = async () => {
    if (selectedIds.size === 0) return;
    if (!user) return;
    const blocked = await assertCanPublish();
    if (blocked) { await dialog.alert({ title:"批量发布失败", message:blocked, variant:"danger" }); return; }
    const { error } = await supabase.from("posts").update({ status: "published", published_at: new Date().toISOString() }).in("id", Array.from(selectedIds));
    if (error) { await dialog.alert({ title:"批量发布失败", message:error.message, variant:"danger" }); return; }
    setWorks((prev) => prev.map((w) => selectedIds.has(w.id) ? { ...w, status: "published" } : w));
    setBatchMode(false);
    setSelectedIds(new Set());
    invalidateClientCache(`studio-works:${user.id}`);
    window.dispatchEvent(new Event("inkland:stats-changed"));
  };

  const batchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!user) return;
    if (!await dialog.confirm({ title:"批量删除作品", message:`即将删除选中的 ${selectedIds.size} 篇作品，删除后无法恢复。`, confirmLabel:`删除 ${selectedIds.size} 篇作品`, variant:"danger" })) return;
    const selectedWorks = allWorks.filter((w) => selectedIds.has(w.id));
    const selectedSeries = selectedWorks.filter((w) => w.post_type === "serial" && w.series_name);
    const selectedPosts = selectedWorks.filter((w) => w.post_type !== "serial");
    if (selectedPosts.length > 0) {
      const { error } = await supabase.from("posts").delete().in("id", selectedPosts.map((w) => w.id)).eq("user_id", user.id);
      if (error) { await dialog.alert({ title:"批量删除失败", message:error.message, variant:"danger" }); return; }
    }
    for (const seriesWork of selectedSeries) {
      const { error: postsError } = await supabase.from("posts").delete().eq("user_id", user.id).eq("series_name", seriesWork.series_name);
      if (postsError) { await dialog.alert({ title:"批量删除失败", message:`删除连载章节失败：${postsError.message}`, variant:"danger" }); return; }
    }
    if (selectedSeries.length > 0) {
      const { error } = await supabase.from("series").delete().in("id", selectedSeries.map((w) => w.id)).eq("user_id", user.id);
      if (error) { await dialog.alert({ title:"批量删除失败", message:`删除合集失败：${error.message}`, variant:"danger" }); return; }
      setSeriesList((prev) => prev.filter((s) => !selectedSeries.some((w) => w.id === s.id)));
    }
    setWorks((prev) => prev.filter((w) => !selectedIds.has(w.id)));
    setBatchMode(false);
    setSelectedIds(new Set());
    invalidateClientCache(`studio-works:${user.id}`);
    invalidateClientCache(`studio-series:${user.id}`);
    window.dispatchEvent(new Event("inkland:stats-changed"));
  };

  if (authLoading) {
    return <div className="min-h-screen bg-paper pb-20 lg:pb-0"><div className="main-container"><HomeSidebar /><div className="content-area"><SkeletonStudio /></div></div></div>;
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
                    <SiteIcon name="fa-pen-to-square" variant="solid" />
                  </div>
                </div>
              </div>
              <h2 className="feed-empty-title">登录后管理你的创作</h2>
              <p className="feed-empty-desc">登录后即可发布作品、管理草稿和查看数据</p>
              <Link href="/login" className="feed-empty-action">登录</Link>
              <Link href="/register" className="feed-empty-register">还没有账号？立即注册 →</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper pb-20 lg:pb-0" id="page-studio">
      <div className="main-container">
        <HomeSidebar />
        <div className="content-area">
          {loading ? (
            <SkeletonStudio />
          ) : (
            <>
          {/* 页面头部 */}
          <div className="page-header">
            <h1 className="page-title">创作中心</h1>
            <p className="page-subtitle">管理你的所有作品，追踪创作进度与互动数据</p>
          </div>

          {/* 统计卡片（使用未筛选数据，不受 type/status 筛选影响） */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-card-icon stat-card-icon--total">
                <SiteIcon name="fa-layer-group" variant="solid" />
              </div>
              <div className="stat-card-number">{works.length + seriesList.length}</div>
              <div className="stat-card-label">总作品数</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-icon stat-card-icon--published">
                <SiteIcon name="fa-circle-check" variant="solid" />
              </div>
              <div className="stat-card-number">{publishedCount}</div>
              <div className="stat-card-label">已发布</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-icon stat-card-icon--draft">
                <SiteIcon name="fa-pencil" variant="solid" />
              </div>
              <div className="stat-card-number">{draftCount}</div>
              <div className="stat-card-label">草稿</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-icon stat-card-icon--rejected">
                <SiteIcon name="fa-circle-exclamation" variant="solid" />
              </div>
              <div className="stat-card-number">{rejectedCount}</div>
              <div className="stat-card-label">未过审</div>
            </div>
          </div>

          {/* 移动端工具栏 */}
          <div className="toolbar toolbar-mobile">
            <div className="studio-mobile-filter-bar">
              <button type="button" className="studio-mobile-filter-button" onClick={openMobileFilter} aria-label="打开筛选">
                <SiteIcon name="fa-filter" variant="solid" aria-hidden="true" />
                <span>筛选</span>
              </button>
              <button
                type="button"
                className="studio-mobile-filter-button"
                onClick={() => { setBatchMode((current) => !current); setSelectedIds(new Set()); }}
                aria-pressed={batchMode}
              >
                <SiteIcon name="fa-list-check" variant="solid" aria-hidden="true" />
                <span>批量操作</span>
              </button>
            </div>
            {mobileFilterOpen && (
              <div className="studio-filter-drawer-backdrop" role="presentation" onClick={() => setMobileFilterOpen(false)}>
                <section className="studio-filter-drawer" role="dialog" aria-modal="true" aria-label="筛选作品" onClick={(event) => event.stopPropagation()}>
                  <h2>筛选作品</h2>
                  <div className="studio-filter-drawer-section"><strong>作品类型</strong><div>{typeFilterOptions.map((item) => <button key={item.value} type="button" className={`studio-filter-control${mobileDraftFilter === item.value ? " is-active" : ""}`} onClick={() => setMobileDraftFilter(item.value as FilterType)}>{item.label}</button>)}</div></div>
                  <div className="studio-filter-drawer-section"><strong>发布状态</strong><div>{statusFilterOptions.map((item) => <button key={item.value} type="button" className={`studio-filter-control${mobileDraftStatus === item.value ? " is-active" : ""}`} onClick={() => setMobileDraftStatus(item.value as StatusFilter)}>{item.label}</button>)}</div></div>
                  <div className="studio-filter-drawer-section"><strong>排序</strong><div>{sortFilterOptions.map((item) => <button key={item.value} type="button" className={`studio-filter-control${mobileDraftSort === item.value ? " is-active" : ""}`} onClick={() => setMobileDraftSort(item.value as SortType)}>{item.label}</button>)}</div></div>
                  <div className="studio-filter-drawer-actions">
                    <button type="button" onClick={() => { setMobileDraftFilter("all"); setMobileDraftStatus("all"); setMobileDraftSort("updated"); }}>重置</button>
                    <button type="button" className="is-primary" onClick={applyMobileFilter}>应用筛选</button>
                  </div>
                </section>
              </div>
            )}
            <div className="studio-mobile-content">
              {!batchMode && (
                <div className="filter-system-field filter-system-field--query">
                  <div className="profile-filter-search-shell">
                    <SiteIcon name="fa-magnifying-glass" variant="solid" aria-hidden="true" />
                    <input className="form-control" type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="搜索作品标题…" aria-label="创作中心搜索" />
                    <button type="button" className="profile-filter-search-clear" aria-label="清除搜索作品" onClick={() => setSearchQuery("")}>
                      <SiteIcon name="fa-xmark" variant="solid" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )}
              {batchMode && (
                <div className="studio-batch-row studio-batch-row--mobile">
                  <span className="studio-batch-count">已选 {selectedIds.size} 项</span>
                  <button type="button" className="studio-toolbar-action" onClick={selectAll}>全选</button>
                  <button type="button" className="studio-toolbar-action" onClick={batchPublish}><SiteIcon name="fa-cloud-arrow-up" variant="solid" /> 批量发布</button>
                  <button type="button" className="studio-toolbar-action" onClick={batchDelete}><SiteIcon name="fa-trash-can" variant="solid" /> 批量删除</button>
                  <button type="button" className="studio-toolbar-action" onClick={() => { setBatchMode(false); setSelectedIds(new Set()); }}><SiteIcon name="fa-xmark" variant="solid" /> 取消选择</button>
                </div>
              )}
            </div>
          </div>

          {/* PC 工具栏 */}
          <div className="toolbar toolbar-pc">
            <div className="toolbar-pc-normal">
              <div className="studio-filter-composition" data-composition-contract="filter.toolbar@0.1" data-composition-dependencies="Input Select">
                <div className="filter-system-composition-row">{renderFilterSelectors("studio")}</div>
                {!batchMode ? (
                  <div className="studio-filter-search-row">
                    <div className="filter-system-field filter-system-field--query">
                      <div className="profile-filter-search-shell">
                        <SiteIcon name="fa-magnifying-glass" variant="solid" aria-hidden="true" />
                        <input className="form-control" type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="搜索作品标题…" aria-label="创作中心搜索" />
                        <button type="button" className="profile-filter-search-clear" aria-label="清除搜索作品" onClick={() => setSearchQuery("")}>
                          <SiteIcon name="fa-xmark" variant="solid" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    <div className="toolbar-spacer"></div>
                    <button type="button" className="studio-toolbar-action studio-toolbar-action--batch-toggle" onClick={() => { setBatchMode(true); setSelectedIds(new Set()); }}>
                      <SiteIcon name="fa-list-check" variant="solid" /> 批量操作
                    </button>
                  </div>
                ) : (
                  <div className="studio-batch-row">
                    <span className="studio-batch-count">已选 {selectedIds.size} 项</span>
                    <button type="button" className="studio-toolbar-action" onClick={selectAll}>全选</button>
                    <button type="button" className="studio-toolbar-action" onClick={batchPublish}><SiteIcon name="fa-cloud-arrow-up" variant="solid" /> 批量发布</button>
                    <button type="button" className="studio-toolbar-action" onClick={batchDelete}><SiteIcon name="fa-trash-can" variant="solid" /> 批量删除</button>
                    <button type="button" className="studio-toolbar-action" onClick={() => { setBatchMode(false); setSelectedIds(new Set()); }}><SiteIcon name="fa-xmark" variant="solid" /> 取消选择</button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 作品列表 */}
          {allWorks.length === 0 ? (
            <div className="empty-state">
              <div className="empty-illustration">
                <div className="empty-tag-ring">
                  <div className="tag-ring-outer"></div>
                  <div className="tag-ring-inner">
                    <SiteIcon name="fa-feather-pointed" variant="solid" />
                  </div>
                </div>
              </div>
              <h2 className="empty-title">{searchQuery ? "没有找到匹配的作品" : "还没有任何作品"}</h2>
              <p className="empty-desc">{searchQuery ? "换个关键词试试吧" : "创建你的第一个作品，开始创作之旅"}</p>
              {!searchQuery && (
                <Link href="/create" className="empty-action">
                  <SiteIcon name="fa-plus" variant="solid" style={{ marginRight: 6 }} />创建作品
                </Link>
              )}
            </div>
          ) : (
            <div className="works-card-grid">
              {allWorks.slice(0, shownWorks).map((w) => (
                <div
                  key={w.id}
                  className={`work-card ${batchMode ? "batch-mode" : ""} ${selectedIds.has(w.id) ? "selected" : ""}`}
                  onClick={() => batchMode && toggleSelect(w.id)}
                >
                  <input
                    type="checkbox"
                    className="card-check"
                    checked={selectedIds.has(w.id)}
                    onChange={() => toggleSelect(w.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="card-body">
                    {(() => {
                      const imageUrls = resolvedImageUrls[w.id] || getImageUrls(w.content);
                      const isImage = ["illustration", "comic", "cosplay"].includes(w.post_type);
                      const isSeries = w.post_type === "serial";
                      const isPlaceholderTitle = isImage && ["图片分享", "Image Title"].includes(w.title?.trim());
                      const displayTitle = isPlaceholderTitle ? "" : w.title?.trim();
                      return <>
                    <div className="card-meta">
                      <span className="card-type-label">
                        <SiteIcon name={getTypeIcon(w.post_type)} variant="solid" />
                        {getTypeLabel(w.post_type)}
                      </span>
                      <span className={`card-status ${getStatusClass(w)}`}>
                        {getStatusLabel(w)}
                      </span>
                    </div>
                    {isImage && imageUrls[0] && (
                      <div className="studio-work-preview">
                        <img src={getThumbnailUrl(imageUrls[0], { width: 400, height: 300, resize: "cover" })} alt="" loading="lazy" />
                        <span className="studio-image-count">{imageUrls.length} 张图片</span>
                      </div>
                    )}
                    {!isImage && displayTitle ? <div className="card-title">{displayTitle}</div> : (
                      !isImage && <div className="card-title card-title-placeholder">{getExcerpt(w.content) || "无标题"}</div>
                    )}
                    {!isImage && <div className="studio-card-description">{getExcerpt(w.content) || (isSeries ? "暂无系列简介，进入管理页面查看章节内容" : "暂无正文摘要")}</div>}
                    {(w.tags || []).length > 0 && (
                      <div className="studio-card-tags" onMouseDown={handleTagDragStart} title="拖动查看全部标签">
                        {(w.tags || []).map((tag) => <span key={tag} className="studio-card-tag">{tag}</span>)}
                      </div>
                    )}
                    <div className="card-actions">
                      {w.post_type === "serial" && w.series_name ? (
                        <Link
                          href={`/studio/series/${encodeURIComponent(w.series_name)}`}
                          className="card-btn card-btn-edit"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <SiteIcon name="fa-pen-to-square" variant="solid" /> 管理
                        </Link>
                      ) : (
                        <Link
                          href={`/create?editPost=${w.id}`}
                          className="card-btn card-btn-edit"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <SiteIcon name="fa-pen-to-square" variant="solid" /> {w.review_status === "rejected" ? "查看问题并修改" : "编辑"}
                        </Link>
                      )}
                      <button
                        className="card-btn card-btn-delete"
                        onClick={(e) => { e.stopPropagation(); handleDelete(w); }}
                      >
                        <SiteIcon name="fa-trash-can" variant="solid" /> 删除
                      </button>
                    </div>
                      </>;
                    })()}
                  </div>
                </div>
              ))}
            </div>
          )}
          {allWorks.length > 12 && (
            <div className="card-load-more" ref={workLoadMoreRef}>
              {shownWorks < allWorks.length ? (
                <button type="button" className="btn-load-more" onClick={() => setShownWorks((count) => count + 12)}>
                  <SiteIcon name="fa-angles-down" variant="solid" aria-hidden="true" /> 加载更多
                </button>
              ) : (
                <span className="load-more-end">已加载全部 {allWorks.length} 项作品</span>
              )}
            </div>
          )}

          <div className="page-footer">&copy; 2026 inkland. All rights reserved.</div>
          </>
          )}
        </div>
      </div>

      {/* 批量操作底部栏（移动端） */}
      <div className={`batch-bar ${batchMode ? "show" : ""}`}>
        <span className="batch-bar-count">已选 {selectedIds.size} 项</span>
        <div className="batch-bar-actions">
          <button className="batch-bar-btn batch-bar-btn--publish" onClick={batchPublish}>
            <SiteIcon name="fa-cloud-arrow-up" variant="solid" /> 发布
          </button>
          <button className="batch-bar-btn batch-bar-btn--delete" onClick={batchDelete}>
            <SiteIcon name="fa-trash-can" variant="solid" /> 删除
          </button>
          <button className="batch-bar-btn batch-bar-btn--cancel" onClick={() => { setBatchMode(false); setSelectedIds(new Set()); }}>
            <SiteIcon name="fa-xmark" variant="solid" /> 取消
          </button>
        </div>
      </div>
    </div>
  );
}
