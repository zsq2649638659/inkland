import type { SupabaseClient } from "@supabase/supabase-js";
import type { Post } from "@/lib/types";
import type { SerialPostCardData } from "@/components/SerialPostCard";

export type FeedTab = "following" | "myTags" | "hot24";

export interface TagItem {
  name: string;
  post_count: number;
}

export interface FeedResult {
  posts: Post[];
  serialCards: SerialPostCardData[];
  followedTags: TagItem[];
  error?: string;
}

// 服务端聚合与客户端回退共用同一份查询逻辑，避免逻辑分叉。
// 数据依赖推导出的最小波数：
//   wave1: blocked / follows / bookmarks（互不依赖，并行）
//   wave2: 主信息流 + 收藏→系列名解析（并行）
//   wave3: 统计 + 收藏系列章节 + 系列元数据（并行）
//   wave4(仅当收藏系列产生新章节 id 时才触发): 这些章节的统计
// 相比原实现的 4 波硬串行，common 情况下固定省掉最后一波。

const postSelect = `id, user_id, title, content, cover_url, word_count, post_type, created_at, series_name, chapter_number,
     author:profiles!posts_user_id_fkey(nickname, avatar_url),
     post_tags(tags(name))`;

export async function loadFeed(
  supabase: SupabaseClient,
  opts: { tab: FeedTab; userId?: string | null; limit?: number; tryRpc?: boolean }
): Promise<FeedResult> {
  const { tab, userId = null } = opts;
  const limit = opts.limit ?? 50;
  const needsFollow = tab === "following";

  if (tab === "myTags") {
    return loadFollowedTags(supabase, userId);
  }

  if (needsFollow && !userId) {
    return { posts: [], serialCards: [], followedTags: [] };
  }

  // RPC 单查询快速路径：浏览器端直接调用 get_home_feed（已部署 get-home-feed.sql 后生效）。
  // 单次数据库往返完成全部聚合，命中即返回；函数缺失/形状不合法时安全回落下方波数逻辑。
  if (opts.tryRpc !== false) {
    const rpc = await supabase.rpc("get_home_feed", {
      p_user_id: needsFollow ? userId : null,
      p_tab: tab,
      p_limit: limit,
    });
    if (!rpc.error && rpc.data != null) {
      const viaRpc = await normalizeRpcResult(supabase, rpc.data, tab);
      if (viaRpc) return viaRpc;
    }
  }

  // ---- wave 1：旁路查询并行 ----
  const blockedPromise = userId
    ? supabase.from("blocked_users").select("blocked_user_id").eq("user_id", userId)
    : Promise.resolve({ data: [] as unknown[] });
  const followsPromise = needsFollow && userId
    ? supabase.from("follows").select("following_id").eq("follower_id", userId)
    : Promise.resolve({ data: [] as unknown[] });
  const bookmarksPromise = needsFollow && userId
    ? supabase.from("bookmarks").select("post_id").eq("user_id", userId)
    : Promise.resolve({ data: [] as unknown[] });

  const [{ data: blockedRows }, { data: follows }, { data: bookmarks }] = await Promise.all([
    blockedPromise,
    followsPromise,
    bookmarksPromise,
  ]);

  const blockedIds = new Set((blockedRows || []).map((row) => (row as Record<string, unknown>).blocked_user_id as string));

  let query = supabase.from("posts").select(postSelect).eq("status", "published");
  let bookmarkedPostIds: string[] = [];

  if (needsFollow) {
    const followingIds = (follows || []).map((f) => (f as Record<string, unknown>).following_id as string);
    followingIds.push(userId!);
    query = query.in("user_id", followingIds);
    bookmarkedPostIds = [...new Set((bookmarks || []).map((bm) => (bm as Record<string, unknown>).post_id as string).filter(Boolean))];
  }

  // ---- wave 2：主 feed 与收藏作品解析并行（二者只依赖 wave1） ----
  const bookmarkedPostsPromise = bookmarkedPostIds.length > 0
    ? supabase.from("posts").select("id, series_name, post_type, chapter_number").in("id", bookmarkedPostIds).eq("status", "published")
    : Promise.resolve({ data: [] as unknown[] });

  const [{ data: rawPosts, error: err }, { data: bookmarkedPosts }] = await Promise.all([
    query.order("created_at", { ascending: false }).limit(limit),
    bookmarkedPostsPromise,
  ]);
  if (err) return { posts: [], serialCards: [], followedTags: [], error: err.message };

  let rawArr = (rawPosts || []) as unknown as Record<string, unknown>[];
  const bookmarkedSeriesNames = [...new Set((bookmarkedPosts || [])
    .filter((p) => (p as Record<string, unknown>).post_type === "serial" && (p as Record<string, unknown>).chapter_number && (p as Record<string, unknown>).series_name)
    .map((p) => (p as Record<string, unknown>).series_name as string))];

  rawArr = rawArr.filter((post) => !blockedIds.has(post.user_id as string));
  rawArr.sort((a, b) => new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime());
  rawArr = rawArr.slice(0, limit);

  if (rawArr.length === 0) return { posts: [], serialCards: [], followedTags: [] };

  const feedIds = rawArr.map((p) => p.id as string);
  const seriesNames = [...new Set(rawArr
    .filter((p) => p.post_type === "serial" && p.chapter_number && (p.chapter_number as number) > 0)
    .map((p) => p.series_name as string)
    .filter(Boolean))];

  // ---- wave 3：三个互不依赖的查询并行（统一只依赖 wave2） ----
  const statsPromise = supabase
    .from("post_stats")
    .select("id, like_count, comment_count, bookmark_count")
    .in("id", feedIds);
  const seriesFullPostsPromise = bookmarkedSeriesNames.length > 0
    ? supabase.from("posts").select(postSelect).in("series_name", bookmarkedSeriesNames).eq("status", "published")
    : Promise.resolve({ data: [] as unknown[] });
  const seriesMetaNames = [...new Set([...bookmarkedSeriesNames, ...seriesNames])];
  const seriesMetaPromise = seriesMetaNames.length > 0
    ? supabase.from("series").select("name, description, cover_url, tags, status, series_type").in("name", seriesMetaNames)
    : Promise.resolve({ data: [] as unknown[] });

  const [{ data: stats }, { data: rawSeriesPosts }, { data: seriesData }] = await Promise.all([
    statsPromise,
    seriesFullPostsPromise,
    seriesMetaPromise,
  ]);

  const statsMap = new Map<string, { like_count: number; comment_count: number; bookmark_count: number }>();
  if (stats) for (const s of stats as Array<Record<string, unknown>>) {
    statsMap.set(s.id as string, {
      like_count: s.like_count as number,
      comment_count: s.comment_count as number,
      bookmark_count: s.bookmark_count as number,
    });
  }

  // 合并收藏系列章节（去重，避免覆盖 feed 中的同一条），并保持与原实现一致的
  // “合并后按时间倒序、总条数 ≤ limit”的分页语义。
  const merged = new Map<string, Record<string, unknown>>();
  for (const post of rawArr) merged.set(post.id as string, post);
  for (const post of (rawSeriesPosts || []) as unknown as Record<string, unknown>[]) merged.set(post.id as string, post);
  const mergedArr = [...merged.values()].filter((post) => !blockedIds.has(post.user_id as string));
  mergedArr.sort((a, b) => new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime());
  const limitedArr = mergedArr.slice(0, limit);

  // ---- wave4（仅当收藏系列产生 feed 之外的章节 id 时才触发）----
  const extraIds = limitedArr.filter((p) => !feedIds.includes(p.id as string)).map((p) => p.id as string);
  if (extraIds.length > 0) {
    const { data: extraStats } = await supabase
      .from("post_stats")
      .select("id, like_count, comment_count, bookmark_count")
      .in("id", extraIds);
    if (extraStats) for (const s of extraStats as Array<Record<string, unknown>>) {
      if (!statsMap.has(s.id as string)) {
        statsMap.set(s.id as string, {
          like_count: s.like_count as number,
          comment_count: s.comment_count as number,
          bookmark_count: s.bookmark_count as number,
        });
      }
    }
  }

  // ---- 当前用户的点赞/收藏状态（一次性批量，避免每卡 N+1 查询）----
  let likedSet = new Set<string>();
  let bookmarkedSet = new Set<string>();
  if (userId && limitedArr.length > 0) {
    const meIds = limitedArr.map((p) => p.id as string);
    const [{ data: myLikes }, { data: myBookmarks }] = await Promise.all([
      supabase.from("likes").select("post_id").eq("user_id", userId).in("post_id", meIds),
      supabase.from("bookmarks").select("post_id").eq("user_id", userId).in("post_id", meIds),
    ]);
    likedSet = new Set((myLikes || []).map((l) => (l as Record<string, unknown>).post_id as string));
    bookmarkedSet = new Set((myBookmarks || []).map((b) => (b as Record<string, unknown>).post_id as string));
  }

  const normalPosts: Record<string, unknown>[] = [];
  const serialChapters: Record<string, unknown>[] = [];
  for (const p of limitedArr) {
    if (p.post_type === "serial" && p.chapter_number && (p.chapter_number as number) > 0) {
      serialChapters.push(p);
    } else {
      normalPosts.push(p);
    }
  }

  const formatted: Post[] = normalPosts.map((p) => {
    const ptags = (p.post_tags as Array<{ tags: { name: string } }> | undefined)?.map((pt) => pt.tags?.name) || [];
    const author = p.author as { nickname: string; avatar_url: string | null } | null;
    const content = (p.content as string) || "";
    const st = statsMap.get(p.id as string) || { like_count: 0, comment_count: 0, bookmark_count: 0 };
    const plainText = content
      .replace(/!\[.*?\]\(.*?\)/g, "")
      .replace(/\[([^\]]*)\]\(.*?\)/g, "$1")
      .replace(/[*_~`#>|-]/g, "")
      .replace(/\n+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const imgMatches = content.matchAll(/!\[.*?\]\((.*?)\)/g);
    const extractedImages = [...imgMatches].map((m) => m[1]);

    return {
      id: p.id as string,
      title: (p.title as string) || "无标题",
      content,
      cover_url: p.cover_url as string | null,
      word_count: p.word_count as number,
      created_at: p.created_at as string,
      user_id: p.user_id as string,
      series_name: p.series_name as string | null,
      chapter_number: p.chapter_number as number | null,
      tags: ptags,
      author: { nickname: author?.nickname || "匿名用户", avatar_url: author?.avatar_url },
      excerpt: plainText,
      images: extractedImages.length > 0 ? extractedImages : undefined,
      like_count: st.like_count,
      comment_count: st.comment_count,
      bookmark_count: st.bookmark_count,
      liked_by_me: likedSet.has(p.id as string),
      bookmarked_by_me: bookmarkedSet.has(p.id as string),
      time_ago: getTimeAgo(p.created_at as string),
    };
  });

  const seriesMeta = new Map<string, Record<string, unknown>>();
  if (seriesData) {
    for (const s of seriesData as Record<string, unknown>[]) {
      seriesMeta.set(s.name as string, s);
    }
  }

  const serialCardList: SerialPostCardData[] = [];
  // 首页信息流按“发布的章节”展示动态。同一连载一次发布多章时，每章都应有一张
  // SerialPostCard；系列标题、简介和标签共用，章节内容和互动数据各自独立。
  for (const chapter of serialChapters) {
    const sn = chapter.series_name as string;
    if (!sn) continue;
    const meta = seriesMeta.get(sn) || {};
    const author = chapter.author as { nickname: string; avatar_url: string | null } | null;
    const st = statsMap.get(chapter.id as string) || { like_count: 0, comment_count: 0, bookmark_count: 0 };

    serialCardList.push({
      chapterId: chapter.id as string,
      chapterTitle: (chapter.title as string) || "无标题",
      chapterNumber: chapter.chapter_number as number,
      content: (chapter.content as string) || "",
      seriesName: sn,
      seriesDescription: (meta.description as string) || "",
      seriesCover: (meta.cover_url as string) || null,
      seriesTags: (meta.tags as string[]) || [],
      seriesStatus: (meta.status as string) || "ongoing",
      seriesType: (meta.series_type as string) || "fanfic",
      authorId: chapter.user_id as string,
      authorNickname: author?.nickname || "匿名用户",
      authorAvatar: author?.avatar_url || null,
      likeCount: st.like_count,
      commentCount: st.comment_count,
      bookmarkCount: st.bookmark_count,
      likedByMe: likedSet.has(chapter.id as string),
      bookmarkedByMe: bookmarkedSet.has(chapter.id as string),
      createdAt: chapter.created_at as string,
    });
  }

  if (tab === "hot24") {
    formatted.sort((a, b) => {
      const heatA = (a.like_count || 0) + (a.comment_count || 0) + (a.bookmark_count || 0);
      const heatB = (b.like_count || 0) + (b.comment_count || 0) + (b.bookmark_count || 0);
      return heatB - heatA;
    });
    serialCardList.sort((a, b) => {
      const heatA = a.likeCount + a.commentCount + a.bookmarkCount;
      const heatB = b.likeCount + b.commentCount + b.bookmarkCount;
      return heatB - heatA;
    });
  }

  return { posts: formatted, serialCards: serialCardList, followedTags: [] };
}

async function loadFollowedTags(supabase: SupabaseClient, userId: string | null): Promise<FeedResult> {
  if (!userId) return { posts: [], serialCards: [], followedTags: [] };
  const { data: follows } = await supabase.from("tag_follows").select("tag_id").eq("user_id", userId);
  if (!follows || follows.length === 0) return { posts: [], serialCards: [], followedTags: [] };

  const tagIds = [...new Set((follows as Array<Record<string, unknown>>).map((f) => f.tag_id as string))];
  const [{ data: tagsData }, { data: rawCounts }] = await Promise.all([
    supabase.from("tags").select("id, name").in("id", tagIds),
    supabase.from("post_tags").select("tag_id, post_id").in("tag_id", tagIds),
  ]);
  const tagNames = (tagsData || []).map((t: Record<string, unknown>) => t.name as string);

  const postIds = [...new Set((rawCounts || []).map((r: Record<string, unknown>) => r.post_id as string))];
  let validPostIds = new Set<string>();
  if (postIds.length > 0) {
    const { data: posts } = await supabase
      .from("posts")
      .select("id, post_type, chapter_number")
      .in("id", postIds)
      .eq("status", "published");
    validPostIds = new Set((posts || []).filter((p: Record<string, unknown>) => {
      return !(p.post_type === "serial" && p.chapter_number && (p.chapter_number as number) > 0);
    }).map((p: Record<string, unknown>) => p.id as string));
  }

  const countMap = new Map<string, number>();
  for (const r of (rawCounts || []) as Array<Record<string, unknown>>) {
    const pid = r.post_id as string;
    if (!validPostIds.has(pid)) continue;
    const tid = r.tag_id as string;
    const tagName = tagsData?.find((t: Record<string, unknown>) => t.id === tid)?.name as string;
    if (tagName) countMap.set(tagName, (countMap.get(tagName) || 0) + 1);
  }

  const followedTags: TagItem[] = tagNames.map((n) => ({
    name: n,
    post_count: countMap.get(n) || 0,
  }));
  return { posts: [], serialCards: [], followedTags };
}

// RPC 返回结构由本仓库自建的 get_home_feed 函数决定，属受控边界，
// 用 any 便于对未知列做宽容读取，随后在 normalizeRpcResult 内校验关键形状。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RpcRow = Record<string, any>;

function stripMarkdownForRpc(content: string): string {
  return content
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[([^\]]*)\]\(.*?\)/g, "$1")
    .replace(/[*_~`#>|-]/g, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractImagesForRpc(content: string): string[] {
  return [...content.matchAll(/!\[.*?\]\((.*?)\)/g)].map((m) => m[1]);
}

// 把 get_home_feed 返回的原始行规范化为组件所需数据形状；形状不合法返回 null（回落波数逻辑）。
async function normalizeRpcResult(
  supabase: SupabaseClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>,
  tab: FeedTab
): Promise<FeedResult | null> {
  const raw = data.posts;
  if (!Array.isArray(raw)) return null;
  // post_type 决定首页使用普通卡片还是长篇连载卡片。旧版 RPC 曾漏掉该字段，
  // 如果继续消费会把 serial 章节误当普通作品；此时应直接回落到完整查询。
  if (raw.length > 0 && raw.some((p) => (
    !p
    || typeof p.id !== "string"
    || typeof p.content !== "string"
    || typeof p.post_type !== "string"
  ))) return null;

  const toPost = (p: RpcRow): Post => {
    const content = (p.content as string) || "";
    const images = extractImagesForRpc(content);
    return {
      id: p.id,
      title: p.title || "无标题",
      content,
      cover_url: p.cover_url ?? null,
      word_count: p.word_count ?? 0,
      created_at: p.created_at,
      user_id: p.user_id,
      series_name: p.series_name ?? null,
      chapter_number: p.chapter_number ?? null,
      tags: p.tags ?? [],
      author: { nickname: p.author_nickname || "匿名用户", avatar_url: p.author_avatar ?? null },
      excerpt: stripMarkdownForRpc(content),
      images: images.length > 0 ? images : undefined,
      like_count: p.like_count ?? 0,
      comment_count: p.comment_count ?? 0,
      bookmark_count: p.bookmark_count ?? 0,
      liked_by_me: !!p.liked_by_me,
      bookmarked_by_me: !!p.bookmarked_by_me,
      time_ago: getTimeAgo(p.created_at),
    };
  };

  const normals: Post[] = [];
  const serials: Array<Post & RpcRow> = [];
  for (const p of raw as RpcRow[]) {
    const post = toPost(p);
    if (p.post_type === "serial" && p.chapter_number && p.chapter_number > 0) {
      serials.push({ ...p, ...post });
    } else {
      normals.push(post);
    }
  }

  const seriesNames = [...new Set(serials.map((s) => s.series_name as string).filter(Boolean))];
  // 优先消费 RPC 已折叠的 seriesMeta，避免二次往返；仅当某系列名缺失时才回退查询（兼容旧版本 SQL）。
  const seriesMeta = new Map<string, RpcRow>();
  if (Array.isArray(data.seriesMeta)) {
    for (const s of data.seriesMeta as RpcRow[]) {
      if (s && typeof s.name === "string") seriesMeta.set(s.name as string, s);
    }
  }
  if (seriesNames.some((n) => !seriesMeta.has(n))) {
    const { data: fetched } = await supabase
      .from("series")
      .select("name, description, cover_url, tags, status, series_type")
      .in("name", seriesNames.filter((n) => !seriesMeta.has(n)));
    if (fetched) for (const s of fetched as RpcRow[]) seriesMeta.set(s.name as string, s);
  }

  const serialCards: SerialPostCardData[] = [];
  for (const chapter of serials) {
    const sn = chapter.series_name as string;
    if (!sn) continue;
    const meta = seriesMeta.get(sn) || {};
    serialCards.push({
      chapterId: chapter.id as string,
      chapterTitle: chapter.title || "无标题",
      chapterNumber: chapter.chapter_number as number,
      content: (chapter.content as string) || "",
      seriesName: sn,
      seriesDescription: meta.description || "",
      seriesCover: meta.cover_url || null,
      seriesTags: meta.tags || [],
      seriesStatus: meta.status || "ongoing",
      seriesType: meta.series_type || "fanfic",
      authorId: chapter.user_id as string,
      authorNickname: chapter.author?.nickname || "匿名用户",
      authorAvatar: chapter.author?.avatar_url || null,
      likeCount: chapter.like_count ?? 0,
      commentCount: chapter.comment_count ?? 0,
      bookmarkCount: chapter.bookmark_count ?? 0,
      likedByMe: !!chapter.liked_by_me,
      bookmarkedByMe: !!chapter.bookmarked_by_me,
      createdAt: chapter.created_at as string,
    });
  }

  if (tab === "hot24") {
    const heat = (p: Post) => (p.like_count || 0) + (p.comment_count || 0) + (p.bookmark_count || 0);
    normals.sort((a, b) => heat(b) - heat(a));
    serialCards.sort((a, b) => (b.likeCount + b.commentCount + b.bookmarkCount) - (a.likeCount + a.commentCount + a.bookmarkCount));
  }

  return { posts: normals, serialCards, followedTags: data.followedTags ?? [], error: undefined };
}

export function getTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)} 天前`;
  return new Date(dateStr).toLocaleDateString("zh-CN");
}
