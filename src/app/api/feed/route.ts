import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadFeed, type FeedTab } from "@/lib/feed";

// 首页信息流的服务端聚合入口：Vercel→Supabase 走机房级网络（拉全文也快），
// 服务端把超长正文瘦身后回传，客户端只下载列表所需的轻量数据。
// 本地 dev 或路由异常时，客户端会安全回落直连 Supabase（loadFeed 逻辑相同）。
export const dynamic = "force-dynamic";

const TABS = new Set<FeedTab>(["following", "myTags", "hot24"]);
const API_CACHE_TTL = 30_000;

// serverless 实例存活期内的结果缓存（与原客户端 30s feed 缓存同语义）：
// 命中时直接回传已瘦身的 JSON 字符串，跳过「拉 3.4MB 全文 + 瘦身」全程。
const feedApiCache = new Map<string, { body: string; at: number }>();

const jsonResp = (body: string) =>
  new NextResponse(body, { headers: { "content-type": "application/json; charset=utf-8" } });

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tab = url.searchParams.get("tab") as FeedTab | null;
  if (!tab || !TABS.has(tab)) {
    return NextResponse.json({ error: "invalid tab" }, { status: 400 });
  }

  try {
    const supabase = await createClient();

    // 匿名快路径：客户端声明未登录时跳过 getUser 往返。匿名可见的数据本就
    // 不含个人信息，伪造该参数只会拿到公开 feed，无越权风险；登录请求
    // （无 u=anon）仍走服务端会话验证。
    let userId: string | null = null;
    if (url.searchParams.get("u") !== "anon") {
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id ?? null;
    }

    const cacheKey = `${userId ?? "anon"}:${tab}`;
    const hit = feedApiCache.get(cacheKey);
    if (hit && Date.now() - hit.at < API_CACHE_TTL) {
      return jsonResp(hit.body);
    }

    const result = await loadFeed(supabase, { tab, userId });
    const body = JSON.stringify(result);
    feedApiCache.set(cacheKey, { body, at: Date.now() });
    return jsonResp(body);
  } catch (e) {
    console.error("feed api failed:", e);
    return NextResponse.json({ error: "feed unavailable" }, { status: 500 });
  }
}
