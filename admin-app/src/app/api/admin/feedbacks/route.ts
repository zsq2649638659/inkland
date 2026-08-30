import { NextResponse } from "next/server";
import { createAdminServiceClient, getAdminContext } from "@/lib/supabase/admin-server";
import { syncFeedbackToFeishu } from "@/lib/feishuFeedback";

export async function PATCH(request: Request) {
  const { supabase, user } = await getAdminContext();
  if (!user) return NextResponse.json({ error: "请先登录管理员后台" }, { status: 401 });
  const body = await request.json().catch(() => null) as { feedbackId?: string; status?: string } | null;
  if (!body?.feedbackId || body.status !== "resolved") return NextResponse.json({ error: "处理参数无效" }, { status: 400 });
  const db = createAdminServiceClient() || supabase;
  const { data: feedback, error: readError } = await db
    .from("feedbacks")
    .select("id, public_id, user_id, status")
    .eq("id", body.feedbackId)
    .maybeSingle();
  if (readError || !feedback) return NextResponse.json({ error: "没有找到对应的用户反馈" }, { status: 404 });
  if (!(["pending", "reviewing"] as string[]).includes(feedback.status)) {
    return NextResponse.json({ error: "这条反馈已经处理过了，请刷新页面" }, { status: 409 });
  }

  const now = new Date().toISOString();
  const { data: updatedFeedback, error } = await db.from("feedbacks").update({
    status: body.status,
    resolved_at: now,
    resolved_by: user.id,
  }).eq("id", feedback.id).in("status", ["pending", "reviewing"]).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: "反馈状态更新失败，请先执行反馈同步数据库迁移" }, { status: 500 });
  if (!updatedFeedback) return NextResponse.json({ error: "这条反馈已被其他管理员处理，请刷新页面" }, { status: 409 });

  await db.from("admin_audit_logs").insert({
    admin_id: user.id,
    action: "resolve_feedback",
    target_type: "feedback",
    target_id: feedback.id,
    note: "管理员将反馈标记为已处理",
  });

  let notificationStatus: "sent" | "already_sent" | "failed" = "failed";
  const notificationQuery = db.from("notifications")
    .select("id")
    .eq("user_id", feedback.user_id)
    .eq("template_key", "feedback_resolved")
    .eq("related_entity_type", "feedback")
    .eq("related_entity_id", feedback.id)
    .maybeSingle();
  const { data: existingNotification, error: notificationLookupError } = await notificationQuery;
  if (!notificationLookupError && existingNotification) {
    notificationStatus = "already_sent";
  } else {
    const feedbackNumber = feedback.public_id || feedback.id;
    const { error: notificationError } = await db.from("notifications").insert({
      user_id: feedback.user_id,
      type: "system",
      actor_id: null,
      post_id: null,
      content: `你提交的反馈（${feedbackNumber}）已处理完成，感谢你的反馈。`,
      read: false,
      template_key: "feedback_resolved",
      related_entity_type: "feedback",
      related_entity_id: feedback.id,
      metadata: { feedback_id: feedback.id, feedback_public_id: feedback.public_id || null },
      delivery_status: "sent",
      sent_at: now,
    });
    if (!notificationError) notificationStatus = "sent";
    else console.error("反馈处理完成通知发送失败:", notificationError);
  }
  if (notificationStatus !== "failed") {
    await db.from("feedbacks").update({ user_notified_at: now }).eq("id", feedback.id);
  }

  const syncResult = await syncFeedbackToFeishu(feedback.id, db);
  return NextResponse.json({
    success: true,
    notification: notificationStatus,
    feishuSync: syncResult.status,
  });
}
