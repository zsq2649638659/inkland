import { NextResponse } from "next/server";
import { createAdminServiceClient, getAdminContext } from "@/lib/supabase/admin-server";

type ReviewBody = {
  postId?: string;
  decision?: string;
  reason?: string | null;
  affectedImageIndexes?: number[];
};

function normalizeImageIndexes(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is number => Number.isInteger(item) && item >= 0 && item < 9))].sort((a, b) => a - b);
}

export async function POST(request: Request) {
  const { supabase, user } = await getAdminContext();
  if (!user) return NextResponse.json({ error: "请先登录管理员后台" }, { status: 401 });
  const body = await request.json().catch(() => null) as ReviewBody | null;
  if (!body?.postId || !["approved", "rejected"].includes(body.decision || "")) return NextResponse.json({ error: "审核参数无效" }, { status: 400 });
  const rejected = body.decision === "rejected";
  const reason = rejected ? body.reason?.trim() : null;
  if (rejected && !reason) return NextResponse.json({ error: "打回作品时必须选择问题类型" }, { status: 400 });

  const service = createAdminServiceClient();
  const db = service || supabase;
  const { data: post, error: postError } = await db
    .from("posts")
    .select("id, user_id, title, review_status, review_submission_number, pending_visibility, visibility")
    .eq("id", body.postId)
    .maybeSingle();
  if (postError || !post) return NextResponse.json({ error: "没有找到待审核作品" }, { status: 404 });
  const retryingRejectedNotification = rejected && post.review_status === "rejected";
  if (post.review_status !== "pending" && !retryingRejectedNotification) return NextResponse.json({ error: "该作品已经处理，请刷新审核列表" }, { status: 409 });

  let affectedImageIndexes = normalizeImageIndexes(body.affectedImageIndexes);
  if (rejected && affectedImageIndexes.length === 0) {
    const { data: reviewCase } = await db.from("moderation_review_cases").select("id").eq("post_id", body.postId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (reviewCase) {
      const { data: imageFindings } = await db.from("moderation_findings").select("image_index").eq("review_case_id", reviewCase.id).eq("location_type", "image");
      affectedImageIndexes = normalizeImageIndexes((imageFindings || []).map((item) => item.image_index));
    }
  }

  const reviewedAt = new Date().toISOString();
  const affectedText = affectedImageIndexes.length ? `（涉及${affectedImageIndexes.map((index) => `第${index + 1}张图片`).join("、")}）` : "";
  const reviewReason = rejected ? `${reason}${affectedText}` : null;
  if (!retryingRejectedNotification) {
    const { data: updatedPost, error } = await db.from("posts").update({
      review_status: rejected ? "rejected" : "approved",
      review_reason: reviewReason,
      reviewed_at: reviewedAt,
      reviewed_by: user.id,
      status: rejected ? "draft" : "published",
      ...(rejected ? {} : {
        visibility: post.pending_visibility || post.visibility || "public",
        pending_visibility: null,
      }),
    }).eq("id", body.postId).eq("review_status", "pending").select("id").maybeSingle();
    if (error || !updatedPost) return NextResponse.json({ error: "审核写入失败，请刷新后重试" }, { status: 500 });
  }

  if (rejected) {
    const imageText = affectedImageIndexes.length
      ? `涉及图片：${affectedImageIndexes.map((index) => `第${index + 1}张`).join("、")}。`
      : "";
    const content = `你的作品《${post.title || "无标题"}》未通过本次审核。问题类型：${reason}。${imageText}请修改后重新提交审核。`;
    const submissionNumber = post.review_submission_number || 1;
    const { data: existingNotification } = await db
      .from("notifications")
      .select("id")
      .eq("user_id", post.user_id)
      .eq("template_key", "post_review_rejected")
      .eq("related_entity_id", post.id)
      .contains("metadata", { submission_number: submissionNumber })
      .limit(1)
      .maybeSingle();
    if (!existingNotification) {
      const { error: notificationError } = await db.from("notifications").insert({
        user_id: post.user_id,
        type: "system",
        actor_id: null,
        post_id: post.id,
        content,
        read: false,
        template_key: "post_review_rejected",
        related_entity_type: "post",
        related_entity_id: post.id,
        metadata: {
          action_url: `/create?editPost=${post.id}`,
          action_label: "查看问题并修改",
          issue_type: reason,
          affected_image_indexes: affectedImageIndexes,
          submission_number: submissionNumber,
        },
        delivery_status: "sent",
        sent_at: reviewedAt,
      });
      if (notificationError) {
        console.error("Failed to create rejection notification", notificationError);
        return NextResponse.json({ error: "作品已打回，但系统通知发送失败，请不要重复操作并检查通知表配置" }, { status: 500 });
      }
    }
  }

  if (!retryingRejectedNotification) {
    await db.from("admin_audit_logs").insert({
      admin_id: user.id,
      action: rejected ? "reject_post" : "approve_post",
      target_type: "post",
      target_id: body.postId,
      note: reason,
      metadata: { affected_image_indexes: affectedImageIndexes },
    });
  }
  return NextResponse.json({ success: true });
}
