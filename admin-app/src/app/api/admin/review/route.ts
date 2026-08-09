import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/supabase/admin-server";

export async function POST(request: Request) {
  const { supabase, user } = await getAdminContext();
  if (!user) return NextResponse.json({ error: "请先登录管理员后台" }, { status: 401 });
  const body = await request.json().catch(() => null) as { postId?: string; decision?: string; reason?: string | null } | null;
  if (!body?.postId || !["approved", "rejected"].includes(body.decision || "")) return NextResponse.json({ error: "审核参数无效" }, { status: 400 });
  const rejected = body.decision === "rejected";
  const { error } = await supabase.from("posts").update({ review_status: rejected ? "rejected" : "approved", review_reason: rejected ? (body.reason?.trim() || "未提供原因") : null, reviewed_at: new Date().toISOString(), reviewed_by: user.id, status: rejected ? "draft" : "published" }).eq("id", body.postId).eq("review_status", "pending");
  if (error) return NextResponse.json({ error: "审核写入失败，请确认数据库迁移已执行" }, { status: 500 });
  await supabase.from("admin_audit_logs").insert({ admin_id: user.id, action: rejected ? "reject_post" : "approve_post", target_type: "post", target_id: body.postId, note: body.reason?.trim() || null });
  return NextResponse.json({ success: true });
}
