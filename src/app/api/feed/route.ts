import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadFeed, type FeedTab } from "@/lib/feed";

// 首页信息流的服务端聚合入口：Vercel→Supabase 走机房级网络（拉全文也快），
// 服务端把超长正文瘦身后回传，客户端只下载列表所需的轻量数据。
// 本地 dev 或路由异常时，客户端会安全回落直连 Supabase（loadFeed 逻辑相同）。
export const dynamic = "force-dynamic";

const TABS = new Set<FeedTab>(["following", "myTags", "hot24"]);

export async function GET(request: Request) {
  const tab = new URL(request.url).searchParams.get("tab") as FeedTab | null;
  if (!tab || !TABS.has(tab)) {
    return NextResponse.json({ error: "invalid tab" }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const result = await loadFeed(supabase, { tab, userId: user?.id ?? null });
    return NextResponse.json(result);
  } catch (e) {
    console.error("feed api failed:", e);
    return NextResponse.json({ error: "feed unavailable" }, { status: 500 });
  }
}
