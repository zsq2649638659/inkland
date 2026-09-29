import type { SupabaseClient } from "@supabase/supabase-js";
import { withTestDataVisibility } from "@/lib/test-data-visibility";

type SeriesLinkedRecord = {
  user_id?: string | null;
  series_name?: string | null;
  series_id?: string | null;
};

const pairKey = (userId: string, name: string) => `${userId}\u0000${name}`;

/**
 * Resolve legacy posts' name-only relationship to the author's series row.
 * `posts` has no `series_id` column, so ownership + name is the stable lookup
 * until every route has loaded the corresponding series metadata directly.
 */
export async function attachSeriesIds<T extends SeriesLinkedRecord>(
  supabase: SupabaseClient,
  records: T[],
  includeTestData = false,
): Promise<T[]> {
  const pairs = [...new Map(records
    .filter((record) => !record.series_id && record.user_id && record.series_name)
    .map((record) => [pairKey(record.user_id!, record.series_name!), {
      userId: record.user_id!,
      name: record.series_name!,
    }])).values()];
  if (pairs.length === 0) return records;

  const names = [...new Set(pairs.map((pair) => pair.name))];
  const userIds = [...new Set(pairs.map((pair) => pair.userId))];
  const { data } = await withTestDataVisibility(
    supabase.from("series").select("id, user_id, name").in("name", names).in("user_id", userIds),
    includeTestData,
  );
  const idByPair = new Map<string, string>();
  for (const row of (data || []) as Array<{ id?: string | null; user_id?: string | null; name?: string | null }>) {
    if (row.id && row.user_id && row.name) idByPair.set(pairKey(row.user_id, row.name), row.id);
  }

  return records.map((record) => ({
    ...record,
    series_id: record.series_id || (record.user_id && record.series_name
      ? idByPair.get(pairKey(record.user_id, record.series_name)) || null
      : null),
  }));
}

export function seriesPageHref(id: string | null | undefined, kind: "serial" | "collection") {
  return id ? `/${kind === "serial" ? "series" : "collection"}/${encodeURIComponent(id)}` : null;
}

export function studioSeriesHref(id: string | null | undefined) {
  return id ? `/studio/series/${encodeURIComponent(id)}` : null;
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
