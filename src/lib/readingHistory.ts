import type { SupabaseClient } from "@supabase/supabase-js";

export interface ReadingHistoryPostSnapshot {
  id: string;
  title?: string | null;
  content?: string | null;
  post_type?: string | null;
  series_name?: string | null;
  chapter_number?: number | null;
  word_count?: number | null;
  cover_url?: string | null;
  user_id?: string | null;
  author?: { nickname?: string | null; avatar_url?: string | null } | null;
  tags?: string[] | null;
  status?: string | null;
  series_description?: string | null;
  series_tags?: string[] | null;
  series_status?: string | null;
  like_count?: number | null;
}

export interface ReadingHistoryRecord {
  id?: string;
  user_id: string;
  post_id: string;
  progress_ratio: number;
  paragraph_index: number | null;
  position_label: string | null;
  chapter_number: number | null;
  last_read_at: string;
  post?: ReadingHistoryPostSnapshot | null;
}

const MAX_HISTORY_ITEMS = 100;
const HISTORY_QUERY_TIMEOUT_MS = 8000;
const HISTORY_METADATA_TIMEOUT_MS = 5000;
const localKey = (userId: string) => `inkland-reading-history:${userId}`;

function withTimeout<T>(request: PromiseLike<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    Promise.resolve(request),
    new Promise<T>((_, reject) => {
      globalThis.setTimeout(() => reject(new Error("reading-history-query-timeout")), timeoutMs);
    }),
  ]);
}

function readLocal(userId: string): ReadingHistoryRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(localStorage.getItem(localKey(userId)) || "[]") as ReadingHistoryRecord[];
    return Array.isArray(value) ? value.filter((record) => record?.post_id) : [];
  } catch {
    return [];
  }
}

function writeLocal(userId: string, records: ReadingHistoryRecord[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(localKey(userId), JSON.stringify(records.slice(0, MAX_HISTORY_ITEMS)));
  } catch {
    // 私有浏览器可能禁用存储；数据库同步仍会继续尝试。
  }
}

export function saveLocalReadingHistory(record: ReadingHistoryRecord) {
  const next = [record, ...readLocal(record.user_id).filter((item) => item.post_id !== record.post_id)];
  writeLocal(record.user_id, next);
}

export function getLocalReadingHistory(userId: string) {
  return readLocal(userId);
}

export function mergeReadingHistoryRecords(remote: ReadingHistoryRecord[], local: ReadingHistoryRecord[]) {
  const byPost = new Map<string, ReadingHistoryRecord>();
  for (const record of [...remote, ...local]) {
    const previous = byPost.get(record.post_id);
    if (!previous || new Date(record.last_read_at).getTime() >= new Date(previous.last_read_at).getTime()) {
      byPost.set(record.post_id, { ...record, post: record.post || previous?.post || null });
    } else if (!previous.post && record.post) {
      byPost.set(record.post_id, { ...previous, post: record.post });
    }
  }
  return [...byPost.values()]
    .sort((a, b) => new Date(b.last_read_at).getTime() - new Date(a.last_read_at).getTime())
    .slice(0, MAX_HISTORY_ITEMS);
}

export async function saveReadingHistory(
  supabase: SupabaseClient,
  record: Omit<ReadingHistoryRecord, "last_read_at"> & { last_read_at?: string },
) {
  const next: ReadingHistoryRecord = {
    ...record,
    progress_ratio: Math.min(1, Math.max(0, record.progress_ratio)),
    last_read_at: record.last_read_at || new Date().toISOString(),
  };

  // 先同步本地，让离开阅读页时即使网络请求尚未完成也不会丢失记录。
  saveLocalReadingHistory(next);

  try {
    const { error } = await supabase.from("reading_history").upsert(
      {
        user_id: next.user_id,
        post_id: next.post_id,
        progress_ratio: next.progress_ratio,
        paragraph_index: next.paragraph_index,
        position_label: next.position_label,
        chapter_number: next.chapter_number,
        last_read_at: next.last_read_at,
        updated_at: next.last_read_at,
      },
      { onConflict: "user_id,post_id" },
    );
    return { ...next, error };
  } catch (error) {
    return { ...next, error };
  }
}

export async function loadReadingHistory(
  supabase: SupabaseClient,
  userId: string,
  seedRecords: ReadingHistoryRecord[] = [],
) {
  const local = mergeReadingHistoryRecords(getLocalReadingHistory(userId), seedRecords);

  try {
    const { data, error } = await withTimeout(
      supabase
        .from("reading_history")
        .select("*")
        .eq("user_id", userId)
        .order("last_read_at", { ascending: false })
        .limit(MAX_HISTORY_ITEMS),
      HISTORY_QUERY_TIMEOUT_MS,
    );

    if (error) {
      console.error("[reading-history] history query returned error", error);
    }
    const records = mergeReadingHistoryRecords(
      (data || []) as unknown as ReadingHistoryRecord[],
      local,
    );
    const postIds = records.map((record) => record.post_id).filter(Boolean);
    const postsResult = postIds.length
      ? await withTimeout(
        supabase
          .from("posts")
          .select("id,title,content,cover_url,post_type,created_at,published_at,user_id,series_name,post_tags(tags(name)),author:profiles!posts_user_id_fkey(nickname,avatar_url)")
          .in("id", postIds)
          .eq("status", "published"),
        HISTORY_QUERY_TIMEOUT_MS,
      ).catch((postError) => {
        console.error("[reading-history] posts query failed", postError);
        return { data: [] };
      })
      : { data: [] };
    if ("error" in postsResult && postsResult.error) {
      console.error("[reading-history] posts query returned error", postsResult.error);
    }
    type PostQueryRow = ReadingHistoryPostSnapshot & {
      post_tags?: Array<{ tags?: { name?: string | null } | null }>;
    };
    const posts = (postsResult.data || []) as unknown as PostQueryRow[];
    const seriesNames = [...new Set(posts
      .map((post) => post.series_name)
      .filter((name): name is string => Boolean(name)))];
    const [statsResult, seriesResult] = await Promise.all([
      postIds.length
        ? withTimeout(supabase.from("post_stats").select("id,like_count").in("id", postIds), HISTORY_METADATA_TIMEOUT_MS)
          .catch((statsError) => {
            console.error("[reading-history] stats query failed", statsError);
            return { data: [] };
          })
        : Promise.resolve({ data: [] }),
      seriesNames.length
        ? withTimeout(supabase.from("series").select("name,description,tags,status").in("name", seriesNames), HISTORY_METADATA_TIMEOUT_MS)
          .catch((seriesError) => {
            console.error("[reading-history] series query failed", seriesError);
            return { data: [] };
          })
        : Promise.resolve({ data: [] }),
    ]);
    if ("error" in statsResult && statsResult.error) {
      console.error("[reading-history] stats query returned error", statsResult.error);
    }
    if ("error" in seriesResult && seriesResult.error) {
      console.error("[reading-history] series query returned error", seriesResult.error);
    }
    const likeCounts = new Map((statsResult.data || []).map((row) => [String(row.id), Number(row.like_count) || 0]));
    const seriesMetadata = new Map((seriesResult.data || []).map((row) => [String(row.name), row]));
    const postSnapshots = new Map(posts.map((post) => {
      const tags = post.tags?.length
        ? post.tags
        : (post.post_tags || []).map((item) => item.tags?.name).filter((name): name is string => Boolean(name));
      const snapshot = { ...post };
      delete snapshot.post_tags;
      const series = post.series_name ? seriesMetadata.get(post.series_name) : undefined;
      return [post.id, {
        ...snapshot,
        tags,
        series_description: typeof series?.description === "string" ? series.description : null,
        series_tags: Array.isArray(series?.tags) ? series.tags.filter((tag): tag is string => typeof tag === "string") : null,
        series_status: typeof series?.status === "string" ? series.status : null,
        like_count: likeCounts.get(post.id) || 0,
      } satisfies ReadingHistoryPostSnapshot] as const;
    }));
    const normalized = records.map((record) => ({
      ...record,
      post: postSnapshots.get(record.post_id) || record.post || null,
    }));
    return { records: mergeReadingHistoryRecords(normalized, local), error };
  } catch (error) {
    console.error("[reading-history] history query failed", error);
    return { records: local, error };
  }
}
