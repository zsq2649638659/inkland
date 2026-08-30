import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/supabase/admin-server";

type AdminContext = Awaited<ReturnType<typeof getAdminContext>>;

type SearchUserRow = {
  id: string;
  public_id?: string | null;
  nickname: string | null;
  moderation_status: string;
};

type SnapshotMatch = {
  case_id: string;
  target_type: string;
  object_snapshot: Record<string, unknown>;
  context_snapshot?: Record<string, unknown>;
};

function snapshotTitle(row: SnapshotMatch) {
  const object = row.object_snapshot || {};
  const context = row.context_snapshot || {};
  if (row.target_type === "comment") return `评论于《${String(context.post_title || "未知作品")}》`;
  if (row.target_type === "user") return String(object.nickname || "未知用户");
  return String(object.title || "未知作品");
}

export async function GET(request: Request) {
  const { supabase, user } = await getAdminContext();
  if (!user) return NextResponse.json({ error: "请先登录管理员后台" }, { status: 401 });

  const q = new URL(request.url).searchParams.get("q")?.trim() || "";
  if (q.length < 2) return NextResponse.json({ error: "请输入至少 2 个字符后再搜索。" }, { status: 400 });
  const pattern = `%${q}%`;

  const [postsResult, seriesResult, userResult, feedbacksResult, snapshotMatches] = await Promise.all([
    supabase
      .from("posts")
      .select("id, public_id, title, post_type, status, review_status, user_id, author:profiles!posts_user_id_fkey(nickname, public_id)")
      .ilike("title", pattern)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("series")
      .select("id, public_id, name, status, review_status")
      .ilike("name", pattern)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.rpc("admin_user_search", { p_query: q, p_limit: 8 }),
    supabase
      .from("feedbacks")
      .select("id, public_id, type, content")
      .ilike("content", pattern)
      .order("created_at", { ascending: false })
      .limit(5),
    searchSnapshots(supabase, pattern),
  ]);

  const posts = (postsResult.data || []).map((item) => {
    const author = item.author as { nickname?: string | null; public_id?: string | null } | null;
    return {
      id: item.id as string,
      public_id: item.public_id as string | null,
      title: String(item.title || "无标题"),
      post_type: (item.post_type as string | null) || "",
      status: (item.status as string | null) || "",
      review_status: (item.review_status as string | null) || "",
      author_nickname: author?.nickname || "",
      href: item.review_status === "pending" ? `/admin/reviews/${item.id}` : null,
    };
  });

  const series = (seriesResult.data || []).map((item) => ({
    id: item.id as string,
    public_id: item.public_id as string | null,
    name: String(item.name || "未命名连载"),
    status: (item.status as string | null) || "",
    review_status: (item.review_status as string | null) || "",
    href: item.review_status === "pending" ? `/admin/series-reviews/${item.id}` : null,
  }));

  const userPayload = userResult.data as { ok?: boolean; users?: SearchUserRow[] } | null;
  const userIds = userPayload?.ok ? (userPayload.users || []).map((item) => item.id) : [];
  const { data: userProfiles } = userIds.length
    ? await supabase.from("profiles").select("id, public_id").in("id", userIds)
    : { data: [] };
  const userPublicIdMap = new Map((userProfiles || []).map((item) => [item.id, item.public_id]));
  const users = userPayload?.ok ? (userPayload.users || []).map((item) => ({
    id: item.id,
    public_id: item.public_id || userPublicIdMap.get(item.id) || null,
    nickname: item.nickname || "未命名用户",
    moderation_status: item.moderation_status,
    href: `/admin/users/${item.id}`,
  })) : [];

  const feedbacks = (feedbacksResult.data || []).map((item) => ({
    id: item.id as string,
    public_id: item.public_id as string | null,
    type: String(item.type || "反馈"),
    content: String(item.content || ""),
    href: "/admin?view=feedbacks",
  }));

  const caseIds = [...new Set(snapshotMatches.map((item) => item.case_id))];
  let reports: Array<{ id: string; title: string; target_type: string; status: string | null; href: string }> = [];
  if (caseIds.length) {
    const { data: cases } = await supabase
      .from("moderation_report_cases")
      .select("id, public_id, target_type, status")
      .in("id", caseIds)
      .limit(20);
    const caseMap = new Map((cases || []).map((item) => [item.id, item]));
    reports = snapshotMatches
      .filter((item) => caseMap.has(item.case_id))
      .map((item) => {
        const row = caseMap.get(item.case_id)!;
        return {
          id: item.case_id,
          public_id: row.public_id as string | null,
          title: snapshotTitle(item),
          target_type: String(item.target_type || "object"),
          status: (row.status as string | null) || "",
          href: `/admin/reports/${item.case_id}`,
        };
      })
      .slice(0, 20);
  }

  return NextResponse.json({ posts, series, users, reports, feedbacks });
}

async function searchSnapshots(supabase: AdminContext["supabase"], pattern: string): Promise<SnapshotMatch[]> {
  const queries = [
    supabase.from("moderation_report_snapshots").select("case_id, target_type, object_snapshot, context_snapshot").ilike("object_snapshot->>title", pattern).limit(20),
    supabase.from("moderation_report_snapshots").select("case_id, target_type, object_snapshot, context_snapshot").ilike("object_snapshot->>nickname", pattern).limit(20),
    supabase.from("moderation_report_snapshots").select("case_id, target_type, object_snapshot, context_snapshot").ilike("object_snapshot->>content", pattern).limit(20),
    supabase.from("moderation_report_snapshots").select("case_id, target_type, object_snapshot, context_snapshot").ilike("context_snapshot->>post_title", pattern).limit(20),
  ];
  const settled = await Promise.allSettled(queries);
  const merged = new Map<string, SnapshotMatch>();
  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    for (const row of result.value.data || []) {
      if (!merged.has(row.case_id)) {
        merged.set(row.case_id, {
          case_id: row.case_id,
          target_type: row.target_type,
          object_snapshot: (row.object_snapshot || {}) as Record<string, unknown>,
          context_snapshot: (row.context_snapshot || {}) as Record<string, unknown>,
        });
      }
    }
  }
  return [...merged.values()];
}
