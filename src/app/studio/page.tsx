"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/AuthProvider";

type FilterType = "all" | "novel" | "illustration" | "serial";
type SortType = "updated" | "created";

interface WorkItem {
  id: string;
  title: string;
  cover_url: string | null;
  post_type: string;
  status: string;
  review_status: string;
  review_reason: string | null;
  word_count: number;
  created_at: string;
  updated_at: string;
  series_name: string | null;
  chapter_number: number | null;
  like_count: number;
  comment_count: number;
  bookmark_count: number;
}

interface SeriesWorkItem {
  id: string;
  name: string;
  cover_url: string | null;
  description: string;
  series_type: string;
  created_at: string;
  updated_at: string | null;
}

export default function StudioPage() {
  const supabase = createClient();
  const { user } = useAuth();
  const [works, setWorks] = useState<WorkItem[]>([]);
  const [seriesList, setSeriesList] = useState<SeriesWorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");
  const [sortType, setSortType] = useState<SortType>("updated");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!user) return;
    loadWorks();
    loadSeries();
  }, [user, filter]);

  const loadWorks = async () => {
    if (!user) return;
    setLoading(true);

    // 长篇连载 filter 只从 series 表加载，不需要查 posts
    if (filter === "serial") {
      setWorks([]);
      setLoading(false);
      return;
    }

    let q = supabase
      .from("posts")
      .select("id, title, cover_url, post_type, status, review_status, review_reason, word_count, created_at, updated_at, series_name, chapter_number")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (filter !== "all") {
      q = q.eq("post_type", filter);
    }

    const { data } = await q.limit(50);
    if (!data) { setLoading(false); return; }

    // 过滤掉所有连载类型的帖子（包括章节和元数据），连载由 series 表统一管理
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

    setWorks(filtered.map((p) => {
      const s = statsMap.get(p.id as string) || { like_count: 0, comment_count: 0, bookmark_count: 0 };
      return { ...p, ...s } as WorkItem;
    }));
    setLoading(false);
  };

  const loadSeries = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("series")
      .select("id, name, cover_url, description, series_type, created_at, updated_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (data) {
      // 按 name 去重（同一连载可能因多次创建在 series 表中有重复条目）
      const seen = new Set<string>();
      const deduped = (data as unknown as SeriesWorkItem[]).filter((s) => {
        if (seen.has(s.name)) return false;
        seen.add(s.name);
        return true;
      });
      setSeriesList(deduped);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除这篇作品吗？此操作不可撤销。")) return;
    const { error } = await supabase.from("posts").delete().eq("id", id);
    if (error) { alert(`删除失败: ${error.message}`); return; }
    setWorks((prev) => prev.filter((w) => w.id !== id));
  };

  const filteredWorks = searchQuery
    ? works.filter((w) => w.title?.toLowerCase().includes(searchQuery.toLowerCase()))
    : works;

  // 将 series 合并到作品列表中（作为 serial 类型）
  const seriesAsWorks: WorkItem[] = seriesList.map((s) => ({
    id: s.id,
    title: s.name,
    cover_url: s.cover_url,
    post_type: "serial",
    status: "published",
    review_status: "approved",
    review_reason: null,
    word_count: 0,
    created_at: s.created_at,
    updated_at: s.updated_at || s.created_at,
    series_name: s.name,
    chapter_number: null,
    like_count: 0,
    comment_count: 0,
    bookmark_count: 0,
  }));

  const seriesFiltered = searchQuery
    ? seriesAsWorks.filter((s) => s.title?.toLowerCase().includes(searchQuery.toLowerCase()))
    : seriesAsWorks;

  // 根据 filter 决定是否显示 series
  const showSeries = filter === "all" || filter === "serial";
  const allWorks = [...filteredWorks, ...(showSeries ? seriesFiltered : [])];

  // 排序
  const sortKey = sortType === "updated" ? "updated_at" : "created_at";
  allWorks.sort((a, b) => {
    const da = new Date(a[sortKey] || a.created_at).getTime();
    const db = new Date(b[sortKey] || b.created_at).getTime();
    return db - da;
  });

  if (!user) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted mb-4">请先登录</p>
          <Link href="/login" className="btn-accent no-underline">去登录</Link>
        </div>
      </div>
    );
  }

  const filters: { key: FilterType; label: string }[] = [
    { key: "all", label: "全部" },
    { key: "novel", label: "单篇" },
    { key: "illustration", label: "图片" },
    { key: "serial", label: "长篇连载" },
  ];

  const publishedCount = allWorks.filter((w) => w.status === "published").length;
  const draftCount = allWorks.filter((w) => w.status === "draft").length;
  const rejectedCount = allWorks.filter((w) => w.review_status === "rejected").length;

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "illustration": return "图片";
      case "serial": return "长篇连载";
      case "novel": return "单篇";
      default: return type;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "illustration": return "fa-image";
      case "serial": return "fa-book";
      default: return "fa-feather-pointed";
    }
  };

  const getStatusBadge = (w: WorkItem) => {
    if (w.review_status === "rejected") {
      return (
        <span className="inline-block px-2 py-0.5 rounded-full text-[0.6rem] bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800" title={w.review_reason || "未过审"}>
          未过审
        </span>
      );
    }
    if (w.status === "published") {
      return <span className="inline-block px-2 py-0.5 rounded-full text-[0.6rem] bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800">已发布</span>;
    }
    return <span className="inline-block px-2 py-0.5 rounded-full text-[0.6rem] bg-orange-50 dark:bg-orange-900/30 text-orange-500 dark:text-orange-400 border border-orange-200 dark:border-orange-800">草稿</span>;
  };

  return (
    <div className="min-h-screen bg-paper">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* 顶部统计 */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-card rounded-xl border border-rule p-4">
            <div className="text-2xl font-bold text-warm">{allWorks.length}</div>
            <div className="text-xs text-muted mt-1">总作品数</div>
          </div>
          <div className="bg-card rounded-xl border border-rule p-4">
            <div className="text-2xl font-bold text-warm">{publishedCount}</div>
            <div className="text-xs text-muted mt-1">已发布</div>
          </div>
          <div className="bg-card rounded-xl border border-rule p-4">
            <div className="text-2xl font-bold text-orange-500">{draftCount}</div>
            <div className="text-xs text-muted mt-1">草稿</div>
          </div>
          <div className="bg-card rounded-xl border border-rule p-4">
            <div className="text-2xl font-bold text-red-500">{rejectedCount}</div>
            <div className="text-xs text-muted mt-1">未过审</div>
          </div>
        </div>

        {/* 工具栏 */}
        <div className="bg-card rounded-xl border border-rule p-4 mb-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Link href="/create" className="btn-accent no-underline text-sm">
                <i className="fa-solid fa-plus mr-1" />新建作品
              </Link>
              <div className="relative">
                <input
                  type="text"
                  placeholder="搜索作品..."
                  className="pl-8 pr-3 py-1.5 text-sm border border-rule rounded-lg bg-paper dark:bg-[#2a2a2a] focus:outline-none focus:border-accent w-48"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <i className="fa-solid fa-magnifying-glass absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted" />
              </div>
            </div>
            <div className="flex gap-1 bg-paper dark:bg-[#2a2a2a] rounded-lg p-0.5">
              {filters.map((f) => (
                <button
                  key={f.key}
                  className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                    filter === f.key ? "bg-accent text-white" : "text-muted hover:text-warm"
                  }`}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="flex gap-1 bg-paper dark:bg-[#2a2a2a] rounded-lg p-0.5">
              <button
                className={`px-3 py-1.5 text-xs rounded-md transition-colors ${sortType === "updated" ? "bg-accent text-white" : "text-muted hover:text-warm"}`}
                onClick={() => setSortType("updated")}
              >
                <i className="fa-solid fa-clock-rotate-left mr-1" />最近更新
              </button>
              <button
                className={`px-3 py-1.5 text-xs rounded-md transition-colors ${sortType === "created" ? "bg-accent text-white" : "text-muted hover:text-warm"}`}
                onClick={() => setSortType("created")}
              >
                <i className="fa-solid fa-calendar-plus mr-1" />最近创建
              </button>
            </div>
          </div>
        </div>

        {/* 作品列表 */}
        {loading ? (
          <div className="bg-card rounded-xl border border-rule p-12 text-center">
            <i className="fa-solid fa-spinner animate-spin text-2xl text-accent/40 mb-3 block" />
            <p className="text-sm text-muted">加载中...</p>
          </div>
        ) : filteredWorks.length === 0 && seriesList.length === 0 ? (
          <div className="bg-card rounded-xl border border-rule p-16 text-center">
            <i className="fa-solid fa-feather-pointed text-5xl text-accent/20 mb-4 block" />
            <p className="text-muted mb-4">
              {searchQuery ? "没有找到匹配的作品" : "还没有作品，开始创作吧"}
            </p>
            {!searchQuery && (
              <Link href="/create" className="btn-accent no-underline">开始创作</Link>
            )}
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-rule overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-rule bg-paper dark:bg-[#2a2a2a]">
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted w-12">#</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted">作品标题</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted w-20">类型</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted w-20">状态</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted w-32">互动数据</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted w-36">更新时间</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted w-36">操作</th>
                </tr>
              </thead>
              <tbody>
                {allWorks.map((w, i) => (
                  <tr key={w.id} className="border-b border-rule last:border-b-0 hover:bg-paper dark:hover:bg-[#333] transition-colors">
                    <td className="px-4 py-3 text-xs text-muted">{i + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-accent-light flex-shrink-0">
                          {w.cover_url ? (
                            <img src={w.cover_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <i className={`fa-solid ${getTypeIcon(w.post_type)} text-accent/40 text-sm`} />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <Link
                            href={w.post_type === "serial" && w.series_name
                              ? `/studio/series/${encodeURIComponent(w.series_name)}`
                              : `/read/${w.id}`}
                            className="text-sm font-medium text-warm hover:text-accent no-underline truncate block"
                          >
                            {w.title || "无标题"}
                          </Link>
                          {w.series_name && (
                            <span className="text-xs text-accent">{w.series_name}</span>
                          )}
                          {w.review_status === "rejected" && w.review_reason && (
                            <p className="text-xs text-red-500 mt-0.5 truncate">
                              <i className="fa-solid fa-circle-exclamation mr-1" />{w.review_reason}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-muted">{getTypeLabel(w.post_type)}</span>
                    </td>
                    <td className="px-4 py-3">
                      {getStatusBadge(w)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 text-xs text-muted">
                        <span className="flex items-center gap-1">
                          <i className="fa-regular fa-heart text-[0.6rem]" />{w.like_count || 0}
                        </span>
                        <span className="flex items-center gap-1">
                          <i className="fa-regular fa-comment text-[0.6rem]" />{w.comment_count || 0}
                        </span>
                        <span className="flex items-center gap-1">
                          <i className="fa-regular fa-bookmark text-[0.6rem]" />{w.bookmark_count || 0}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-muted">
                        {new Date(w.updated_at || w.created_at).toLocaleDateString("zh-CN")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {w.post_type === "serial" && w.series_name ? (
                          <Link
                            href={`/studio/series/${encodeURIComponent(w.series_name)}`}
                            className="text-xs text-accent hover:bg-accent-light px-2 py-1 rounded-md transition-colors no-underline"
                          >
                            <i className="fa-solid fa-pen-to-square mr-1" />管理
                          </Link>
                        ) : (
                          <Link
                            href={`/create?editPost=${w.id}`}
                            className="text-xs text-accent hover:bg-accent-light px-2 py-1 rounded-md transition-colors no-underline"
                          >
                            <i className="fa-solid fa-pen-to-square mr-1" />编辑
                          </Link>
                        )}
                        <button
                          className="text-xs text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 px-2 py-1 rounded-md transition-colors border-none bg-transparent cursor-pointer"
                          onClick={() => handleDelete(w.id)}
                        >
                          <i className="fa-solid fa-trash-can mr-1" />删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}