import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { slimContent } from "@/lib/feed";

// 个人中心列表数据的服务端入口（works / likes / bookmarks 三个 tab）。
// 服务端在机房内拉取数据并瘦身 content，客户端不再跨区下载数 MB 全文。
export const dynamic = "force-dynamic";

const SELECT = "id, title, content, cover_url, post_type, created_at, published_at, user_id, series_name, chapter_number, status, review_status, review_reason, post_tags(tags(name))";

export async function GET(request: Request) {
  const tab = new URL(request.url).searchParams.get("tab") || "works";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    let rows: Array<Record<string, unknown>> | null = null;
    let error: { message: string } | null = null;

    if (tab === "works") {
      const res = await supabase
        .from("posts")
        .select(SELECT)
        .eq("user_id", user.id)
        // 连载章节由系列卡片承载，服务端直接排除，避免 limit(50) 被章节挤占
        .or("post_type.neq.serial,chapter_number.is.null")
        .order("created_at", { ascending: false })
        .limit(50);
      rows = res.data as unknown as Array<Record<string, unknown>>;
      error = res.error;
    } else if (tab === "likes" || tab === "bookmarks") {
      const sourceTable = tab === "likes" ? "likes" : "bookmarks";
      const { data: interactions, error: intErr } = await supabase
        .from(sourceTable)
        .select("post_id, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (intErr) return NextResponse.json({ error: intErr.message }, { status: 500 });
      const postIds = (interactions || []).map((r) => (r as Record<string, unknown>).post_id as string).filter(Boolean);
      if (postIds.length === 0) return NextResponse.json({ data: [], interactions: [] });
      const res = await supabase
        .from("posts")
        .select(`${SELECT}, author:profiles!posts_user_id_fkey(nickname, avatar_url)`)
        .in("id", postIds)
        .eq("status", "published");
      rows = res.data as unknown as Array<Record<string, unknown>>;
      error = res.error;
      if (rows) {
        const timeMap = new Map((interactions || []).map((r) => {
          const row = r as Record<string, unknown>;
          return [row.post_id as string, row.created_at as string];
        }));
        for (const row of rows) row.interaction_at = timeMap.get(row.id as string) || row.created_at;
      }
    } else {
      return NextResponse.json({ error: "invalid tab" }, { status: 400 });
    }

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const slimmed = (rows || []).map((p) => ({
      ...p,
      content: slimContent((p.content as string) || ""),
    }));
    return NextResponse.json({ data: slimmed });
  } catch (e) {
    console.error("profile-posts api failed:", e);
    return NextResponse.json({ error: "profile posts unavailable" }, { status: 500 });
  }
}
