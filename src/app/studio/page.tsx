"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import HomeSidebar from "@/components/HomeSidebar";
import { createClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/AuthProvider";
import { getThumbnailUrl } from "@/lib/image";
import { SkeletonStudio } from "@/components/Skeleton";

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

export default function StudioPage() {
  const supabase = createClient();
  const { user, loading: authLoading } = useAuth();
  const [works, setWorks] = useState<WorkItem[]>([]);
  const [seriesList, setSeriesList] = useState<SeriesWorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvedImageUrls, setResolvedImageUrls] = useState<Record<string, string[]>>({});
  const [filter, setFilter] = useState<FilterType>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortType, setSortType] = useState<SortType>("updated");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOpen, setSortOpen] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    loadWorks();
    loadSeries();
  }, [user]);

  const loadWorks = async () => {
    if (!user) return;
    setLoading(true);

    let q = supabase
      .from("posts")
      .select("id, title, content, cover_url, post_type, status, review_status, review_reason, word_count, created_at, updated_at, published_at, series_name, chapter_number, post_tags(tags(name))")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    const { data } = await q.limit(50);
    if (!data) { setLoading(false); return; }

    const filtered = (data as unknown as Record<string, unknown>[]).filter((p) => {
      return p.post_type !== "serial";
    });

    const ids = filtered.map((p) => p.id as string);
    const { data: stats } = await supabase
      .from("post_stats")
      .select("id, like_count, comment_count, bookmark_count")
      .in("id", ids);
    const statsMap = new Map<string, { like_count: number; comment_count: number; bookmark_count: number }>();
    if (stats) for (const s of stats as Array<Record<string, unknown>>) {
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

    // 解析私有图片的 signed URL
    const imageTypes = new Set(["illustration", "comic", "cosplay"]);
    const privateMarker = /private:\/\/private-post-images\/([A-Za-z0-9/_\-.]+)/g;
    const urlMap: Record<string, string[]> = {};
    const resolveTasks = workList
      .filter((w) => imageTypes.has(w.post_type) && w.content?.includes("private://"))
      .map(async (w) => {
        const content = w.content || "";
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
        urlMap[w.id] = [...resolved.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]);
      });
    if (resolveTasks.length > 0) {
      await Promise.all(resolveTasks);
      setResolvedImageUrls((prev) => ({ ...prev, ...urlMap }));
    }
  };

  const loadSeries = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("series")
      .select("id, name, description, tags, series_type, created_at, updated_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (data) {
      const seen = new Set<string>();
      const deduped = (data as unknown as SeriesWorkItem[]).filter((s) => {
        if (seen.has(s.name)) return false;
        seen.add(s.name);
        return true;
      });
      const names = deduped.map((s) => s.name);
      const chapterCountMap = new Map<string, number>();
      if (names.length > 0) {
        const { data: chapterRows } = await supabase
          .from("posts")
          .select("series_name")
          .in("series_name", names)
          .eq("post_type", "serial");
        for (const row of (chapterRows || []) as Array<{ series_name: string | null }>) {
          if (row.series_name) chapterCountMap.set(row.series_name, (chapterCountMap.get(row.series_name) || 0) + 1);
        }
      }
      setSeriesList(deduped.map((s) => ({ ...s, chapter_count: chapterCountMap.get(s.name) || 0 })));
    }
  };

  const handleDelete = async (work: WorkItem) => {
    if (!confirm("确定要删除这篇作品吗？此操作不可撤销。")) return;
    if (work.post_type === "serial" && work.series_name) {
      const { error: postsError } = await supabase
        .from("posts")
        .delete()
        .eq("user_id", user?.id)
        .eq("series_name", work.series_name);
      if (postsError) { alert(`删除连载章节失败: ${postsError.message}`); return; }
      const { error: seriesError } = await supabase
        .from("series")
        .delete()
        .eq("id", work.id)
        .eq("user_id", user?.id);
      if (seriesError) { alert(`删除合集失败: ${seriesError.message}`); return; }
      setSeriesList((prev) => prev.filter((s) => s.id !== work.id));
    } else {
      const { error } = await supabase.from("posts").delete().eq("id", work.id).eq("user_id", user?.id);
      if (error) { alert(`删除失败: ${error.message}`); return; }
    }
    setWorks((prev) => prev.filter((w) => w.id !== work.id));
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

  // Stats (from unfiltered data, not affected by type filter)
  const allPostsForStats = works.filter((w) => w.post_type !== "serial");
  const publishedCount = allPostsForStats.filter((w) => w.status === "published" && w.review_status !== "rejected").length + seriesList.length;
  const draftCount = allPostsForStats.filter((w) => w.status === "draft" && w.review_status !== "rejected").length;
  const rejectedCount = allPostsForStats.filter((w) => w.review_status === "rejected").length;

  const typeFilters: { key: FilterType; label: string }[] = [
    { key: "all", label: "全部" },
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

  const getTypeIcon = (type: string) => {
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
      .trim()
      .slice(0, 48);
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
    const { error } = await supabase.from("posts").update({ status: "published", published_at: new Date().toISOString() }).in("id", Array.from(selectedIds));
    if (error) { alert(`批量发布失败: ${error.message}`); return; }
    setWorks((prev) => prev.map((w) => selectedIds.has(w.id) ? { ...w, status: "published" } : w));
    setBatchMode(false);
    setSelectedIds(new Set());
    window.dispatchEvent(new Event("inkland:stats-changed"));
  };

  const batchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!user) return;
    if (!confirm(`确定要删除选中的 ${selectedIds.size} 篇作品吗？此操作不可撤销。`)) return;
    const selectedWorks = allWorks.filter((w) => selectedIds.has(w.id));
    const selectedSeries = selectedWorks.filter((w) => w.post_type === "serial" && w.series_name);
    const selectedPosts = selectedWorks.filter((w) => w.post_type !== "serial");
    if (selectedPosts.length > 0) {
      const { error } = await supabase.from("posts").delete().in("id", selectedPosts.map((w) => w.id)).eq("user_id", user.id);
      if (error) { alert(`批量删除失败: ${error.message}`); return; }
    }
    for (const seriesWork of selectedSeries) {
      const { error: postsError } = await supabase.from("posts").delete().eq("user_id", user.id).eq("series_name", seriesWork.series_name);
      if (postsError) { alert(`批量删除连载章节失败: ${postsError.message}`); return; }
    }
    if (selectedSeries.length > 0) {
      const { error } = await supabase.from("series").delete().in("id", selectedSeries.map((w) => w.id)).eq("user_id", user.id);
      if (error) { alert(`批量删除合集失败: ${error.message}`); return; }
      setSeriesList((prev) => prev.filter((s) => !selectedSeries.some((w) => w.id === s.id)));
    }
    setWorks((prev) => prev.filter((w) => !selectedIds.has(w.id)));
    setBatchMode(false);
    setSelectedIds(new Set());
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
                    <i className="fa-solid fa-pen-to-square"></i>
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
    <div className="min-h-screen bg-paper pb-20 lg:pb-0">
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
                <i className="fa-solid fa-layer-group"></i>
              </div>
              <div className="stat-card-number">{works.length + seriesList.length}</div>
              <div className="stat-card-label">总作品数</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-icon stat-card-icon--published">
                <i className="fa-solid fa-circle-check"></i>
              </div>
              <div className="stat-card-number">{publishedCount}</div>
              <div className="stat-card-label">已发布</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-icon stat-card-icon--draft">
                <i className="fa-solid fa-pencil"></i>
              </div>
              <div className="stat-card-number">{draftCount}</div>
              <div className="stat-card-label">草稿</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-icon stat-card-icon--rejected">
                <i className="fa-solid fa-circle-exclamation"></i>
              </div>
              <div className="stat-card-number">{rejectedCount}</div>
              <div className="stat-card-label">未过审</div>
            </div>
          </div>

          {/* 移动端工具栏 */}
          <div className="toolbar toolbar-mobile">
            <div className="segmented-tabs">
              <div className="segmented-tabs-left">
                {typeFilters.map((f) => (
                  <button
                    key={f.key}
                    className={`segmented-tab ${filter === f.key ? "active" : ""}`}
                    onClick={() => setFilter(f.key)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="segmented-tabs-right">
                {statusFilters.map((f) => (
                  <button
                    key={f.key}
                    className={`segmented-tab ${statusFilter === f.key ? "active" : ""}`}
                    onClick={() => setStatusFilter(f.key)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="search-wrap">
              <i className="fa-solid fa-magnifying-glass search-icon"></i>
              <input
                type="text"
                placeholder="搜索作品标题..."
                aria-label="创作中心搜索"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="toolbar-row" style={{ justifyContent: "space-between" }}>
              <div className="sort-wrap">
                <button className="btn-sort" onClick={() => setSortOpen(!sortOpen)}>
                  <i className="fa-solid fa-arrow-down-wide-short"></i>
                  <span>{sortOptions.find((s) => s.key === sortType)?.label || "最近更新"}</span>
                </button>
                {sortOpen && (
                  <>
                    <div className="sort-overlay show" onClick={() => setSortOpen(false)}></div>
                    <div className="sort-popup show">
                      <div className="sort-popup-header">
                        <span className="sort-popup-title">排序方式</span>
                        <button className="sort-popup-close" onClick={() => setSortOpen(false)}>
                          <i className="fa-solid fa-xmark"></i>
                        </button>
                      </div>
                      {sortOptions.map((opt) => (
                        <button
                          key={opt.key}
                          className={`sort-option ${sortType === opt.key ? "active" : ""}`}
                          onClick={() => { setSortType(opt.key); setSortOpen(false); }}
                        >
                          <span>{opt.label}</span>
                          <i className="fa-solid fa-check"></i>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <button
                className="btn-batch"
                onClick={() => { setBatchMode(!batchMode); setSelectedIds(new Set()); }}
              >
                <i className="fa-solid fa-list-check"></i> 批量操作
              </button>
            </div>
          </div>

          {/* PC 工具栏 */}
          <div className="toolbar toolbar-pc">
            {!batchMode ? (
              <div className="toolbar-pc-normal">
                <div className="segmented-tabs">
                  <div className="segmented-tabs-left">
                    {typeFilters.map((f) => (
                      <button
                        key={f.key}
                        className={`segmented-tab ${filter === f.key ? "active" : ""}`}
                        onClick={() => setFilter(f.key)}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <div className="segmented-tabs-right">
                    {statusFilters.map((f) => (
                      <button
                        key={f.key}
                        className={`segmented-tab ${statusFilter === f.key ? "active" : ""}`}
                        onClick={() => setStatusFilter(f.key)}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="studio-toolbar-row2">
                  <div className="search-wrap">
                    <i className="fa-solid fa-magnifying-glass search-icon"></i>
                    <input
                      type="text"
                      placeholder="搜索作品标题..."
                      aria-label="创作中心搜索"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <div className="toolbar-spacer"></div>
                  <div className="toolbar-pc-right">
                    <div className="sort-wrap">
                      <button
                        className={`sort-select ${sortOpen ? "open" : ""}`}
                        onClick={() => setSortOpen(!sortOpen)}
                      >
                        <span>{sortOptions.find((s) => s.key === sortType)?.label || "最近更新"}</span>
                        <i className="fa-solid fa-chevron-down sort-arrow"></i>
                      </button>
                      <div className={`sort-dropdown ${sortOpen ? "show" : ""}`}>
                        {sortOptions.map((opt) => (
                          <button
                            key={opt.key}
                            className={`sort-option ${sortType === opt.key ? "active" : ""}`}
                            onClick={() => { setSortType(opt.key); setSortOpen(false); }}
                          >
                            <i className="fa-solid fa-check"></i> {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button className="btn-batch-toggle" onClick={() => setBatchMode(true)}>
                      <i className="fa-solid fa-list-check"></i> 批量操作
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="toolbar-pc-batch active">
                <span className="batch-count">已选 {selectedIds.size} 项</span>
                <button className="batch-chip" onClick={selectAll}>全选</button>
                <div className="toolbar-divider"></div>
                <button className="batch-action" onClick={batchPublish}>
                  <i className="fa-solid fa-cloud-arrow-up"></i> 批量发布
                </button>
                <button className="batch-action batch-action--danger" onClick={batchDelete}>
                  <i className="fa-solid fa-trash-can"></i> 批量删除
                </button>
                <div className="toolbar-spacer"></div>
                <button className="batch-action batch-action--cancel" onClick={() => { setBatchMode(false); setSelectedIds(new Set()); }}>
                  <i className="fa-solid fa-xmark"></i> 取消选择
                </button>
              </div>
            )}
          </div>

          {/* 作品列表 */}
          {allWorks.length === 0 ? (
            <div className="empty-state">
              <div className="empty-illustration">
                <div className="empty-tag-ring">
                  <div className="tag-ring-outer"></div>
                  <div className="tag-ring-inner">
                    <i className="fa-solid fa-feather-pointed"></i>
                  </div>
                </div>
              </div>
              <h2 className="empty-title">{searchQuery ? "没有找到匹配的作品" : "还没有任何作品"}</h2>
              <p className="empty-desc">{searchQuery ? "换个关键词试试吧" : "创建你的第一个作品，开始创作之旅"}</p>
              {!searchQuery && (
                <Link href="/create" className="empty-action">
                  <i className="fa-solid fa-plus" style={{ marginRight: 6 }}></i>创建作品
                </Link>
              )}
            </div>
          ) : (
            <div className="works-card-grid">
              {allWorks.map((w) => (
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
                    {!isImage && <div className="card-meta">
                      <span className="card-type-label">
                        <i className={`fa-solid ${getTypeIcon(w.post_type)}`}></i>
                        {getTypeLabel(w.post_type)}
                      </span>
                      <span className={`card-status ${getStatusClass(w)}`}>
                        <span className="status-dot"></span>
                        {getStatusLabel(w)}
                      </span>
                    </div>}
                    {isImage && imageUrls[0] && (
                      <div className="studio-work-preview">
                        <img src={getThumbnailUrl(imageUrls[0], { width: 400, height: 300, resize: "cover" })} alt="" loading="lazy" />
                        <div className="card-meta studio-preview-meta">
                          <span className="card-type-label">
                            <i className={`fa-solid ${getTypeIcon(w.post_type)}`}></i>
                            {getTypeLabel(w.post_type)}
                          </span>
                          <span className={`card-status ${getStatusClass(w)}`}>
                            <span className="status-dot"></span>
                            {getStatusLabel(w)}
                          </span>
                        </div>
                        <span className="studio-image-count">{imageUrls.length} 张图片</span>
                      </div>
                    )}
                    {isImage && !imageUrls[0] && <div className="card-meta">
                      <span className="card-type-label"><i className={`fa-solid ${getTypeIcon(w.post_type)}`}></i>{getTypeLabel(w.post_type)}</span>
                      <span className={`card-status ${getStatusClass(w)}`}><span className="status-dot"></span>{getStatusLabel(w)}</span>
                    </div>}
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
                          <i className="fa-solid fa-pen-to-square"></i> 管理
                        </Link>
                      ) : (
                        <Link
                          href={`/create?editPost=${w.id}`}
                          className="card-btn card-btn-edit"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <i className="fa-solid fa-pen-to-square"></i> 编辑
                        </Link>
                      )}
                      <button
                        className="card-btn card-btn-delete"
                        onClick={(e) => { e.stopPropagation(); handleDelete(w); }}
                      >
                        <i className="fa-solid fa-trash-can"></i> 删除
                      </button>
                    </div>
                      </>;
                    })()}
                  </div>
                </div>
              ))}
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
            <i className="fa-solid fa-cloud-arrow-up"></i> 发布
          </button>
          <button className="batch-bar-btn batch-bar-btn--delete" onClick={batchDelete}>
            <i className="fa-solid fa-trash-can"></i> 删除
          </button>
          <button className="batch-bar-btn batch-bar-btn--cancel" onClick={() => { setBatchMode(false); setSelectedIds(new Set()); }}>
            <i className="fa-solid fa-xmark"></i> 取消
          </button>
        </div>
      </div>
    </div>
  );
}
