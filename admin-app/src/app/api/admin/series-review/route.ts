import { NextResponse } from "next/server";
import { createAdminServiceClient, getAdminContext } from "@/lib/supabase/admin-server";
import { normalizeModerationReason } from "@shared/moderationReasons";

export async function POST(request: Request) {
  const { supabase, user } = await getAdminContext();
  if (!user) return NextResponse.json({ error: "请先登录管理员后台" }, { status: 401 });
  const body = await request.json().catch(() => null) as { seriesId?: string; decision?: string; reason?: string } | null;
  if (!body?.seriesId || !["approved", "rejected"].includes(body.decision || "")) return NextResponse.json({ error: "审核参数无效" }, { status: 400 });
  const reason = body.reason?.trim() ? normalizeModerationReason(body.reason.trim()) : "";
  if (body.decision === "rejected" && !reason) return NextResponse.json({ error: "打回连载时必须选择问题类型" }, { status: 400 });
  const db = createAdminServiceClient() || supabase;
  const { data: series } = await db.from("series").select("id, user_id, name, review_status").eq("id", body.seriesId).maybeSingle();
  if (!series) return NextResponse.json({ error: "没有找到待审核连载" }, { status: 404 });
  const approved = body.decision === "approved";
  const { data: reviewCase } = await db.from("series_moderation_review_cases").select("id").eq("series_id", body.seriesId).in("status", ["pending", "reviewing"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const { error } = await db.from("series").update({ review_status: approved ? "approved" : "rejected", review_reason: approved ? null : reason, reviewed_at: new Date().toISOString() }).eq("id", body.seriesId);
  if (error) return NextResponse.json({ error: `审核写入失败：${error.message}` }, { status: 500 });
  if (reviewCase) await db.from("series_moderation_review_cases").update({ status: approved ? "approved" : "changes_requested", decided_by: user.id, decided_at: new Date().toISOString() }).eq("id", reviewCase.id);
  if (!approved) {
    await db.from("notifications").insert({
      user_id: series.user_id, type: "system", actor_id: null, content: `你的连载《${series.name}》未通过本次审核。问题类型：${reason}。请修改连载名称或简介后重新提交。`, read: false,
      template_key: "series_review_rejected", related_entity_type: "series", related_entity_id: series.id,
      metadata: { action_url: `/create?series=${series.id}`, action_label: "查看问题并修改", issue_type: reason }, delivery_status: "sent", sent_at: new Date().toISOString(),
    });
  }
  return NextResponse.json({ success: true });
}
