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
  const [latestResult, likeResult, commentResult, bookmarkResult] = await Promise.all([
    latestIds.length > 0
      ? (() => {
        let query = supabase.from("posts").select("id, title, content").in("id", latestIds);
        if (!opts.includeTestData) query = query.eq("is_test_data", false);
        return query;
      })()
      : Promise.resolve({ data: null }),
    chapterIds.length > 0
      ? supabase.from("likes").select("post_id").in("post_id", chapterIds)
      : Promise.resolve({ data: null }),
    chapterIds.length > 0
      ? supabase.from("comments").select("post_id").in("post_id", chapterIds)
      : Promise.resolve({ data: null }),
    chapterIds.length > 0
      ? supabase.from("bookmarks").select("post_id").in("post_id", chapterIds)
      : Promise.resolve({ data: null }),
  ]);

  const latestDetails = new Map<string, { title: string; content: string }>();
  for (const row of (latestResult.data || []) as Array<Record<string, unknown>>) {
    latestDetails.set(row.id as string, {
      title: (row.title as string) || "",
      content: (row.content as string) || "",
    });
  }

  const countByPost = (rows: unknown): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const row of (rows || []) as Array<{ post_id?: string | null }>) {
      if (row.post_id) counts.set(row.post_id, (counts.get(row.post_id) || 0) + 1);
    }
    return counts;
  };
  const likeCounts = countByPost(likeResult.data);
  const commentCounts = countByPost(commentResult.data);
  const bookmarkCounts = countByPost(bookmarkResult.data);
  const sumCounts = (rows: typeof chapters, counts: Map<string, number>) => rows.reduce((total, row) => total + (counts.get(row.id) || 0), 0);

  return series.map((item) => {
    const latest = latestBySeries.get(item.name);
    const detail = latest ? latestDetails.get(latest.id) : undefined;
    const rows = chaptersBySeries.get(item.name) || [];
    return {
      ...item,
      like_count: sumCounts(rows, likeCounts),
      comment_count: sumCounts(rows, commentCounts),
      bookmark_count: sumCounts(rows, bookmarkCounts),
      latestChapterId: latest?.id || null,
      latestChapterNumber: latest?.chapter_number ?? null,
      latestChapterTitle: detail?.title || null,
      latestChapterContent: detail ? stripMarkdown(detail.content) || null : null,
      latestChapterCreatedAt: latest?.created_at || null,
      totalChapters: rows.length,
    };
  });
}
