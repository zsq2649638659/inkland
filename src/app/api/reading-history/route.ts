import { NextResponse } from "next/server";
import { loadReadingHistory, type ReadingHistoryRecord } from "@/lib/readingHistory";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ records: [] }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { postIds?: unknown } | null;
  const postIds = Array.isArray(body?.postIds)
    ? [...new Set(body.postIds.filter((id): id is string => typeof id === "string" && UUID_PATTERN.test(id)))].slice(0, 100)
    : [];
  const seedRecords: ReadingHistoryRecord[] = postIds.map((postId) => ({
    user_id: user.id,
    post_id: postId,
    progress_ratio: 0,
    paragraph_index: null,
    position_label: null,
    chapter_number: null,
    last_read_at: "1970-01-01T00:00:00.000Z",
  }));

  const { records, error } = await loadReadingHistory(supabase, user.id, seedRecords);
  if (error) {
    console.error("[api/reading-history] load failed", error);
  }

  return NextResponse.json({ records }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
