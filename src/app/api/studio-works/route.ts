import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { slimContent } from "@/lib/feed";

// 创作中心作品列表的服务端入口：posts（非连载）+ post_stats 两步查询
// 在机房内完成后瘦身回传，客户端不再跨区下载数 MB 全文。
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const { data: posts, error } = await supabase
      .from("posts")
      .select("id, title, content, cover_url, post_type, status, review_status, review_reason, word_count, created_at, updated_at, published_at, series_name, chapter_number, post_tags(tags(name))")
      .eq("user_id", user.id)
      .neq("post_type", "serial")
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const ids = (posts || []).map((p) => p.id);
    const { data: stats } = ids.length > 0
      ? await supabase.from("post_stats").select("id, like_count, comment_count, bookmark_count").in("id", ids)
      : { data: null };

    const slimmed = (posts || []).map((p) => ({
      ...p,
      content: slimContent(p.content || ""),
    }));
    return NextResponse.json({ data: slimmed, stats: stats || [] });
  } catch (e) {
    console.error("studio-works api failed:", e);
    return NextResponse.json({ error: "studio works unavailable" }, { status: 500 });
  }
}
