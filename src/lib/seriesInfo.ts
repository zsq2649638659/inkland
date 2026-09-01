import type { SupabaseClient } from "@supabase/supabase-js";

export interface SeriesInfoSummary {
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

const stripMarkdown = (text: string): string => text
  .replace(/!\[.*?\]\(.*?\)/g, "")
  .replace(/\[([^\]]*)\]\(.*?\)/g, "$1")
  .replace(/[#*_~`>]/g, "")
  .replace(/\n{2,}/g, " ")
  .replace(/\s+/g, " ")
  .trim();

// 系列列表统一批量加载章节、最新章节和互动统计，避免每个系列触发 4 个请求。
export async function assembleSeriesInfo(
  supabase: SupabaseClient,
  series: SeriesInfoSummary[],
  opts: { includeTestData?: boolean } = {},
): Promise<SeriesInfoSummary[]> {
  if (series.length === 0) return [];

  const names = [...new Set(series.map((item) => item.name))];
  let chapterQuery = supabase
    .from("posts")
    .select("id, series_name, chapter_number, created_at")
    .in("series_name", names)
    .eq("post_type", "serial")
    .eq("status", "published");
  if (!opts.includeTestData) chapterQuery = chapterQuery.eq("is_test_data", false);
  const { data: chapterRows } = await chapterQuery;
  const chapters = (chapterRows || []) as Array<{
    id: string;
    series_name: string | null;
    chapter_number: number | null;
    created_at: string | null;
  }>;
  const chaptersBySeries = new Map<string, typeof chapters>();
  for (const chapter of chapters) {
    if (!chapter.series_name) continue;
    const rows = chaptersBySeries.get(chapter.series_name) || [];
    rows.push(chapter);
    chaptersBySeries.set(chapter.series_name, rows);
  }

  const latestBySeries = new Map<string, (typeof chapters)[number]>();
  for (const [name, rows] of chaptersBySeries) {
    const latest = rows.reduce((best, row) => {
      if (!best) return row;
      const bestNumber = best.chapter_number ?? -1;
      const rowNumber = row.chapter_number ?? -1;
      if (rowNumber !== bestNumber) return rowNumber > bestNumber ? row : best;
      return new Date(row.created_at || "").getTime() > new Date(best.created_at || "").getTime() ? row : best;
    }, null as (typeof chapters)[number] | null);
    if (latest) latestBySeries.set(name, latest);
  }

  const chapterIds = chapters.map((chapter) => chapter.id);
  const latestIds = [...latestBySeries.values()].map((chapter) => chapter.id);
  const [latestResult, statsResult] = await Promise.all([
    latestIds.length > 0
      ? (() => {
        let query = supabase.from("posts").select("id, title, content").in("id", latestIds);
        if (!opts.includeTestData) query = query.eq("is_test_data", false);
        return query;
      })()
      : Promise.resolve({ data: null }),
    chapterIds.length > 0
      ? supabase.from("post_stats").select("id, like_count, comment_count, bookmark_count").in("id", chapterIds)
      : Promise.resolve({ data: null }),
  ]);

  const latestDetails = new Map<string, { title: string; content: string }>();
  for (const row of (latestResult.data || []) as Array<Record<string, unknown>>) {
    latestDetails.set(row.id as string, {
      title: (row.title as string) || "",
      content: (row.content as string) || "",
    });
  }

  const statsMap = new Map<string, { like_count: number; comment_count: number; bookmark_count: number }>();
  for (const row of (statsResult.data || []) as Array<Record<string, unknown>>) {
    statsMap.set(row.id as string, {
      like_count: Number(row.like_count) || 0,
      comment_count: Number(row.comment_count) || 0,
      bookmark_count: Number(row.bookmark_count) || 0,
    });
  }
  const sumStats = (rows: typeof chapters) => rows.reduce((total, row) => {
    const stats = statsMap.get(row.id);
    return {
      like_count: total.like_count + (stats?.like_count || 0),
      comment_count: total.comment_count + (stats?.comment_count || 0),
      bookmark_count: total.bookmark_count + (stats?.bookmark_count || 0),
    };
  }, { like_count: 0, comment_count: 0, bookmark_count: 0 });

  return series.map((item) => {
    const latest = latestBySeries.get(item.name);
    const detail = latest ? latestDetails.get(latest.id) : undefined;
    const rows = chaptersBySeries.get(item.name) || [];
    return {
      ...item,
      ...sumStats(rows),
      latestChapterId: latest?.id || null,
      latestChapterNumber: latest?.chapter_number ?? null,
      latestChapterTitle: detail?.title || null,
      latestChapterContent: detail ? stripMarkdown(detail.content) || null : null,
      latestChapterCreatedAt: latest?.created_at || null,
      totalChapters: rows.length,
    };
  });
}
