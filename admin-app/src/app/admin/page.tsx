import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/supabase/admin-server";
import AdminDashboard, { type AdminView } from "./AdminDashboard";

export const metadata = { title: "管理后台 — inkland", robots: { index: false, follow: false } };

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ view?: string; q?: string; query?: string }> }) {
  const { view, q, query } = await searchParams;
  if (view === "reports") redirect("/admin?view=reportwork");
  const allowedViews: AdminView[] = ["reviews", "comments", "reportwork", "reportcomment", "reportuser", "reports", "users", "feedbacks", "rules"];
  const initialView: AdminView = allowedViews.includes(view as AdminView) ? (view as AdminView) : "reviews";
  const initialQuery = (q || query || "").trim().slice(0, 100);
  const { supabase, user, account } = await getAdminContext();
  if (!user || !account) redirect("/admin/login");
  const [postsResult, reviewCasesResult, reviewHistoryCasesResult, seriesCasesResult, seriesHistoryCasesResult, commentCasesResult, commentHistoryCasesResult, reportCasesResult, feedbacksResult, rulesResult, rulesCountResult] = await Promise.all([
    supabase.from("posts").select("id, title, content, post_type, status, review_status, review_reason, created_at, user_id, author:profiles!posts_user_id_fkey(nickname)").eq("review_status", "pending").order("created_at", { ascending: false }).limit(50),
    supabase.from("moderation_review_cases").select("id, post_id, status, screening_status, priority, route_reason, submission_number").in("status", ["pending", "service_error"]).in("screening_status", ["completed", "failed"]).order("created_at", { ascending: false }).limit(100),
    supabase.from("moderation_review_cases").select("id, post_id, status, screening_status, priority, route_reason, submission_number, decided_by, decided_at, created_at").not("status", "in", "(pending,reviewing,service_error)").order("created_at", { ascending: false }).limit(100),
    supabase.from("series_moderation_review_cases").select("id, series_id, status, screening_status, priority, route_reason, created_at").in("status", ["pending", "reviewing"]).order("created_at", { ascending: false }).limit(100),
    supabase.from("series_moderation_review_cases").select("id, series_id, status, screening_status, priority, route_reason, decided_by, decided_at, created_at").not("status", "in", "(pending,reviewing,service_error)").order("created_at", { ascending: false }).limit(100),
    supabase.from("comment_moderation_review_cases").select("id, comment_id, post_id, author_id, parent_id, paragraph_index, status, priority, route_reason, screening_status, screening_sources, submission_number, decision_reason, decided_by, decided_at, created_at, comment_snapshot").in("status", ["pending", "reviewing"]).order("created_at", { ascending: false }).limit(100),
    supabase.from("comment_moderation_review_cases").select("id, comment_id, post_id, author_id, parent_id, paragraph_index, status, priority, route_reason, screening_status, screening_sources, submission_number, decision_reason, decided_by, decided_at, created_at, comment_snapshot").not("status", "in", "(pending,reviewing)").order("created_at", { ascending: false }).limit(200),
    supabase.from("moderation_report_cases").select("id, target_type, target_id, target_user_id, status, priority, outcome, primary_reason_category, report_count, first_reported_at, last_reported_at, created_at").in("status", ["pending", "reviewing"]).order("last_reported_at", { ascending: false }).limit(50),
    supabase.from("feedbacks").select("id, type, content, status, created_at, user_id").order("created_at", { ascending: false }).limit(200),
    supabase.from("moderation_rules").select("id, rule_type, pattern, category, severity, risk_level, min_hits, description, enabled, hit_count, updated_at").order("created_at", { ascending: false }).limit(100),
    supabase.from("moderation_rules").select("id", { count: "exact", head: true }),
  ]);
  const reportCaseIds = (reportCasesResult.data || []).map((item) => item.id);
  const { data: reportSnapshots } = reportCaseIds.length
    ? await supabase.from("moderation_report_snapshots").select("case_id, object_snapshot, context_snapshot").in("case_id", reportCaseIds)
    : { data: [] };
  const snapshotMap = new Map((reportSnapshots || []).map((snapshot) => [snapshot.case_id, snapshot]));
  const reportCases = (reportCasesResult.data || []).map((item) => {
    const snapshot = snapshotMap.get(item.id);
    const object = (snapshot?.object_snapshot || {}) as Record<string, unknown>;
    const context = (snapshot?.context_snapshot || {}) as Record<string, unknown>;
    let targetTitle = "";
    let targetSummary = "";
    let authorNickname = "";
    if (item.target_type === "post") {
      targetTitle = String(object.title || "");
      targetSummary = String(object.content || "");
      authorNickname = String(context.author_nickname || "");
    } else if (item.target_type === "comment") {
      targetTitle = `评论于《${String(context.post_title || "未知作品")}》`;
      targetSummary = String(object.content || "");
      authorNickname = String(context.comment_author_nickname || "");
    } else {
      targetTitle = String(object.nickname || "未知用户");
      targetSummary = String(object.bio || "");
      authorNickname = String(object.nickname || "");
    }
    return { ...item, target_title: targetTitle, target_summary: targetSummary.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\s+/g, " ").trim().slice(0, 160), author_nickname: authorNickname };
  });
  const reviewCaseByPostId = new Map<string, string>();
  for (const reviewCase of reviewCasesResult.data || []) {
    if (!reviewCaseByPostId.has(reviewCase.post_id)) reviewCaseByPostId.set(reviewCase.post_id, reviewCase.id);
  }
  const humanReviewPosts = (postsResult.data || []).flatMap((post) => {
    const reviewCaseId = reviewCaseByPostId.get(post.id);
    const reviewCase = (reviewCasesResult.data || []).find((item) => item.id === reviewCaseId);
    return reviewCaseId ? [{ ...post, review_case_id: reviewCaseId, review_priority: reviewCase?.priority, review_route_reason: reviewCase?.route_reason, screening_status: reviewCase?.screening_status, review_submission_number: reviewCase?.submission_number }] : [];
  });
  const seriesIds = (seriesCasesResult.data || []).map((item) => item.series_id);
  const { data: reviewSeries } = seriesIds.length
    ? await supabase.from("series").select("id, name, description, user_id, created_at, review_status").in("id", seriesIds)
    : { data: [] };
  const seriesMap = new Map((reviewSeries || []).map((item) => [item.id, item]));
  const humanReviewSeries = (seriesCasesResult.data || []).map((item) => ({ ...item, series: seriesMap.get(item.series_id) || null }));
  const commentCaseRows = [...(commentCasesResult.data || []), ...(commentHistoryCasesResult.data || [])];
  const commentIds = [...new Set(commentCaseRows.map((item) => item.comment_id).filter((value): value is string => Boolean(value)))];
  const commentPostIds = [...new Set(commentCaseRows.map((item) => item.post_id).filter((value): value is string => Boolean(value)))];
  const commentAuthorIds = [...new Set(commentCaseRows.map((item) => item.author_id).filter((value): value is string => Boolean(value)))];
  const [{ data: commentObjects }, { data: commentAuthors }, { data: commentPosts }] = await Promise.all([
    commentIds.length ? supabase.from("comments").select("id, post_id, user_id, parent_id, paragraph_index, content, created_at").in("id", commentIds) : Promise.resolve({ data: [] }),
    commentAuthorIds.length ? supabase.from("profiles").select("id, nickname").in("id", commentAuthorIds) : Promise.resolve({ data: [] }),
    commentPostIds.length ? supabase.from("posts").select("id, title").in("id", commentPostIds) : Promise.resolve({ data: [] }),
  ]);
  const commentObjectMap = new Map((commentObjects || []).map((item) => [item.id, item]));
  const commentAuthorMap = new Map((commentAuthors || []).map((item) => [item.id, item.nickname || "未知用户"]));
  const commentPostMap = new Map((commentPosts || []).map((item) => [item.id, item.title || "未知作品"]));
  const normalizeCommentCase = (item: (typeof commentCaseRows)[number]) => {
    const snapshot = (item.comment_snapshot || {}) as Record<string, unknown>;
    const comment = item.comment_id ? commentObjectMap.get(item.comment_id) : null;
    const commentId = item.comment_id || (typeof snapshot.id === "string" ? snapshot.id : null);
    const postId = item.post_id || (typeof snapshot.post_id === "string" ? snapshot.post_id : comment?.post_id || null);
    const authorId = item.author_id || (typeof snapshot.user_id === "string" ? snapshot.user_id : comment?.user_id || null);
    return {
      ...item,
      comment_id: commentId,
      post_id: postId,
      author_id: authorId,
      parent_id: item.parent_id ?? (typeof snapshot.parent_id === "string" ? snapshot.parent_id : comment?.parent_id || null),
      paragraph_index: item.paragraph_index ?? (typeof snapshot.paragraph_index === "number" ? snapshot.paragraph_index : comment?.paragraph_index ?? null),
      content: comment?.content || (typeof snapshot.content === "string" ? snapshot.content : "评论内容已删除"),
      author_nickname: authorId ? commentAuthorMap.get(authorId) || "未知用户" : "未知用户",
      post_title: postId ? commentPostMap.get(postId) || "未知作品" : "未知作品",
      screening_sources: Array.isArray(item.screening_sources) ? item.screening_sources : [],
    };
  };
  const initialComments = (commentCasesResult.data || []).map(normalizeCommentCase);
  const initialCommentHistory = (commentHistoryCasesResult.data || []).map(normalizeCommentCase);
  const historyPostIds = (reviewHistoryCasesResult.data || []).map((item) => item.post_id);
  const historySeriesIds = (seriesHistoryCasesResult.data || []).map((item) => item.series_id);
  const historyActorIds = [...new Set([
    ...(reviewHistoryCasesResult.data || []).map((item) => item.decided_by).filter(Boolean),
    ...(seriesHistoryCasesResult.data || []).map((item) => item.decided_by).filter(Boolean),
  ])];
  const [{ data: historyPosts }, { data: historySeries }, { data: historyActors }] = await Promise.all([
    historyPostIds.length
      ? supabase.from("posts").select("id, title, post_type, user_id, review_reason, author:profiles!posts_user_id_fkey(nickname)").in("id", historyPostIds)
      : Promise.resolve({ data: [] }),
    historySeriesIds.length
      ? supabase.from("series").select("id, name, user_id").in("id", historySeriesIds)
      : Promise.resolve({ data: [] }),
    historyActorIds.length
      ? supabase.from("profiles").select("id, nickname").in("id", historyActorIds)
      : Promise.resolve({ data: [] }),
  ]);
  const historyPostMap = new Map((historyPosts || []).map((item) => [item.id, item]));
  const historySeriesMap = new Map((historySeries || []).map((item) => [item.id, item]));
  const historyActorMap = new Map((historyActors || []).map((item) => [item.id, item.nickname]));
  const reviewHistory = [
    ...(reviewHistoryCasesResult.data || []).flatMap((item) => {
      const post = historyPostMap.get(item.post_id);
      if (!post) return [];
      const author = post.author as unknown as { nickname?: string } | Array<{ nickname?: string }> | null;
      return [{
        ...item,
        item_type: "post" as const,
        entity_id: post.id,
        title: post.title || "无标题",
        post_type: post.post_type,
        user_id: post.user_id,
        author_name: (Array.isArray(author) ? author[0]?.nickname : author?.nickname) || "未知作者",
        review_reason: post.review_reason,
        handler_name: item.decided_by ? historyActorMap.get(item.decided_by) || `管理员 ${item.decided_by.slice(0, 8)}` : "未记录",
      }];
    }),
    ...(seriesHistoryCasesResult.data || []).flatMap((item) => {
      const series = historySeriesMap.get(item.series_id);
      if (!series) return [];
      return [{
        ...item,
        item_type: "series" as const,
        entity_id: series.id,
        title: series.name || "未命名连载",
        post_type: "serial",
        user_id: series.user_id,
        author_name: historyActorMap.get(series.user_id) || `作者 ${series.user_id.slice(0, 8)}`,
        review_reason: null,
        handler_name: item.decided_by ? historyActorMap.get(item.decided_by) || `管理员 ${item.decided_by.slice(0, 8)}` : "未记录",
      }];
    }),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return <AdminDashboard adminName={account.display_name || "管理员"}
    adminEmail={account.email}
    initialView={initialView}
    initialQuery={initialQuery}
    initialPosts={humanReviewPosts as never[]}
    initialSeriesReviews={humanReviewSeries as never[]}
    initialReviewHistory={reviewHistory as never[]}
    initialComments={initialComments as never[]}
    initialCommentHistory={initialCommentHistory as never[]}
    commentsReady={!commentCasesResult.error && !commentHistoryCasesResult.error}
    initialReports={reportCases as never[]}
    initialFeedbacks={(feedbacksResult.data || []) as never[]}
    initialRules={(rulesResult.data || []) as never[]}
    initialRuleTotal={rulesCountResult.count ?? (rulesResult.data || []).length}
    rulesReady={!rulesResult.error && !rulesCountResult.error}
    loadErrors={[postsResult.error?.message, reviewCasesResult.error?.message, reviewHistoryCasesResult.error?.message, seriesCasesResult.error?.message, seriesHistoryCasesResult.error?.message, reportCasesResult.error?.message, feedbacksResult.error?.message].filter(Boolean) as string[]}
  />;
}
