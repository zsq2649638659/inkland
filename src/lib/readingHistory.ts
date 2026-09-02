import type { SupabaseClient } from "@supabase/supabase-js";

export interface ReadingHistoryPostSnapshot {
  id: string;
  title?: string | null;
  post_type?: string | null;
  series_name?: string | null;
  chapter_number?: number | null;
  word_count?: number | null;
  cover_url?: string | null;
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
const localKey = (userId: string) => `inkland-reading-history:${userId}`;

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

function mergeRecords(remote: ReadingHistoryRecord[], local: ReadingHistoryRecord[]) {
  const byPost = new Map<string, ReadingHistoryRecord>();
  for (const record of [...remote, ...local]) {
    const previous = byPost.get(record.post_id);
    if (!previous || new Date(record.last_read_at).getTime() >= new Date(previous.last_read_at).getTime()) {
      byPost.set(record.post_id, record);
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

export async function loadReadingHistory(supabase: SupabaseClient, userId: string) {
  const local = getLocalReadingHistory(userId);

  try {
    const { data, error } = await supabase
      .from("reading_history")
      .select("*, post:posts(id,title,post_type,series_name,chapter_number,word_count,cover_url)")
      .eq("user_id", userId)
      .order("last_read_at", { ascending: false })
      .limit(MAX_HISTORY_ITEMS);

    if (error || !data) return { records: local, error };
    return { records: mergeRecords(data as unknown as ReadingHistoryRecord[], local), error: null };
  } catch (error) {
    return { records: local, error };
  }
}
