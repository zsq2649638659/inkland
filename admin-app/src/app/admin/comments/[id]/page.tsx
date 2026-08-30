import { notFound, redirect } from "next/navigation";
import { createAdminServiceClient, getAdminContext } from "@/lib/supabase/admin-server";
import CommentReviewClient from "./CommentReviewClient";

export const metadata = { title: "评论审核详情 — Inkland 管理后台", robots: { index: false, follow: false } };

export default async function CommentReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, account } = await getAdminContext();
  if (!user || !account) redirect("/admin/login");
  const db = createAdminServiceClient() || supabase;
  const { data: reviewCase } = await db.from("comment_moderation_review_cases")
    .select("id, public_id, comment_id, post_id, author_id, parent_id, paragraph_index, status, priority, route_reason, screening_status, screening_sources, screening_result, rules_version, submission_number, comment_snapshot, decision_reason, decided_by, decided_at, created_at, updated_at")
    .eq("id", id).maybeSingle();
  if (!reviewCase) notFound();

  const snapshot = (reviewCase.comment_snapshot || {}) as Record<string, unknown>;
  const commentId = reviewCase.comment_id || (typeof snapshot.id === "string" ? snapshot.id : null);
  const postId = reviewCase.post_id || (typeof snapshot.post_id === "string" ? snapshot.post_id : null);
  const authorId = reviewCase.author_id || (typeof snapshot.user_id === "string" ? snapshot.user_id : null);
  const [{ data: comment }, { data: author }, { data: post }, { data: parentComment }, { data: findings }, { data: history }] = await Promise.all([
    commentId ? db.from("comments").select("id, public_id, post_id, user_id, parent_id, paragraph_index, content, created_at").eq("id", commentId).maybeSingle() : Promise.resolve({ data: null }),
    authorId ? db.from("profiles").select("id, public_id, nickname").eq("id", authorId).maybeSingle() : Promise.resolve({ data: null }),
    postId ? db.from("posts").select("id, public_id, title, user_id").eq("id", postId).maybeSingle() : Promise.resolve({ data: null }),
    reviewCase.parent_id ? db.from("comments").select("id, public_id, user_id, content").eq("id", reviewCase.parent_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from("comment_moderation_findings").select("id, source, category, severity, status, location_type, start_offset, end_offset, quoted_text, details, metadata, created_at").eq("review_case_id", reviewCase.id).order("created_at", { ascending: true }),
    db.from("comment_moderation_review_cases").select("id, public_id, status, priority, route_reason, screening_sources, submission_number, decision_reason, decided_by, decided_at, created_at, comment_snapshot").or(`comment_id.eq.${commentId || "00000000-0000-0000-0000-000000000000"},id.eq.${reviewCase.id}`).order("created_at", { ascending: true }),
  ]);

  const [{ count: pendingPosts }, { count: pendingSeries }, { data: commentQueue }] = await Promise.all([
    db.from("posts").select("id", { count: "exact", head: true }).eq("review_status", "pending"),
    db.from("series_moderation_review_cases").select("id", { count: "exact", head: true }).in("status", ["pending", "reviewing"]),
    db.from("comment_moderation_review_cases").select("id").in("status", ["pending", "reviewing"]).order("created_at", { ascending: false }).limit(500),
  ]);
  const queueIds = (commentQueue || []).map((item) => item.id);
  const queueIndex = queueIds.indexOf(reviewCase.id);

  return <CommentReviewClient
    adminName={account.display_name || "管理员"}
    adminEmail={account.email}
    pendingCount={(pendingPosts || 0) + (pendingSeries || 0)}
    pendingCommentCount={queueIds.length}
    queuePosition={queueIndex >= 0 ? queueIndex + 1 : null}
    queueTotal={queueIds.length}
    previousCaseId={queueIndex > 0 ? queueIds[queueIndex - 1] : null}
    nextCaseId={queueIndex >= 0 && queueIndex < queueIds.length - 1 ? queueIds[queueIndex + 1] : null}
    reviewCase={reviewCase as never}
    comment={(comment || null) as never}
    author={(author || null) as never}
    post={(post || null) as never}
    parentComment={(parentComment || null) as never}
    findings={(findings || []) as never[]}
    history={(history || []) as never[]}
  />;
}
