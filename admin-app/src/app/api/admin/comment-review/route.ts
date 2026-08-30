import { NextResponse } from "next/server";
import { createAdminServiceClient, getAdminContext } from "@/lib/supabase/admin-server";
import { normalizeModerationReason } from "@shared/moderationReasons";

const actions = ["approve", "remind", "delete"] as const;
type CommentReviewAction = (typeof actions)[number];
const findingStatuses = ["confirmed", "dismissed", "suggested"] as const;
type FindingStatus = (typeof findingStatuses)[number];

export async function PATCH(request: Request) {
  const { supabase, user } = await getAdminContext();
  if (!user) return NextResponse.json({ error: "请先登录管理员后台" }, { status: 401 });

  const body = await request.json().catch(() => null) as { caseId?: string; findingId?: string; status?: string; manualText?: string } | null;
  const caseId = body?.caseId?.trim() || "";
  const findingId = body?.findingId?.trim() || "";
  const status = body?.status as FindingStatus | undefined;
  const manualText = typeof body?.manualText === "string" ? body.manualText.trim().slice(0, 200) : "";
  if (!/^[0-9a-f-]{36}$/i.test(caseId) || (!manualText && !/^[0-9a-f-]{36}$/i.test(findingId)) || (!manualText && (!status || !findingStatuses.includes(status)))) {
    return NextResponse.json({ error: "审核标记参数无效" }, { status: 400 });
  }

  const db = createAdminServiceClient() || supabase;
  const { data: reviewCase, error: caseError } = await db.from("comment_moderation_review_cases")
    .select("id, status").eq("id", caseId).maybeSingle();
  if (caseError) return NextResponse.json({ error: "评论审核数据源尚未启用" }, { status: 503 });
  if (!reviewCase) return NextResponse.json({ error: "没有找到对应的评论审核案件" }, { status: 404 });
  if (!(["pending", "reviewing"] as string[]).includes(reviewCase.status)) return NextResponse.json({ error: "该评论审核案件已经处理" }, { status: 409 });

  if (manualText) {
    const { data: manualFinding, error: manualError } = await db.from("comment_moderation_findings").insert({
      review_case_id: caseId, source: "manual", category: "其他违规", severity: "review", status: "confirmed",
      location_type: "text_range", quoted_text: manualText, details: "管理员补充的审核标记",
      metadata: { admin_id: user.id },
    }).select("id").single();
    if (manualError || !manualFinding) return NextResponse.json({ error: "人工标记添加失败，请重试" }, { status: 500 });
    await db.from("admin_audit_logs").insert({
      admin_id: user.id, action: "comment_finding_manual_add", target_type: "comment_finding", target_id: manualFinding.id,
      note: "添加评论人工审核标记", metadata: { case_id: caseId, text: manualText },
    });
    return NextResponse.json({ success: true, findingId: manualFinding.id, status: "confirmed" });
  }

  const { data: finding, error: findingError } = await db.from("comment_moderation_findings")
    .update({ status }).eq("id", findingId).eq("review_case_id", caseId)
    .select("id").maybeSingle();
  if (findingError || !finding) return NextResponse.json({ error: "没有找到对应的审核标记" }, { status: 404 });
  await db.from("admin_audit_logs").insert({
    admin_id: user.id, action: `comment_finding_${status}`, target_type: "comment_finding", target_id: findingId,
    note: status === "confirmed" ? "确认评论审核标记成立" : status === "dismissed" ? "忽略评论审核标记" : "恢复评论审核标记",
    metadata: { case_id: caseId, status },
  });
  return NextResponse.json({ success: true, findingId, status });
}

export async function POST(request: Request) {
  const { supabase, user } = await getAdminContext();
  if (!user) return NextResponse.json({ error: "请先登录管理员后台" }, { status: 401 });

  const body = await request.json().catch(() => null) as { caseId?: string; action?: string; reason?: string | null } | null;
  const caseId = body?.caseId?.trim() || "";
  const action = body?.action as CommentReviewAction | undefined;
  if (!/^[0-9a-f-]{36}$/i.test(caseId) || !action || !actions.includes(action)) {
    return NextResponse.json({ error: "评论审核参数无效" }, { status: 400 });
  }

  const reason = typeof body?.reason === "string" ? normalizeModerationReason(body.reason.trim().slice(0, 200)) : null;
  const db = createAdminServiceClient() || supabase;
  const { data, error } = await db.rpc("admin_decide_comment_review", {
    p_case_id: caseId,
    p_admin_id: user.id,
    p_action: action,
    p_reason: reason,
  });

  if (error) {
    const message = String(error.message || "");
    if (message.includes("comment_review_case_not_found")) return NextResponse.json({ error: "没有找到对应的评论审核案件，请刷新列表" }, { status: 404 });
    if (message.includes("comment_review_case_not_actionable")) return NextResponse.json({ error: "该评论审核案件已经处理，请刷新列表" }, { status: 409 });
    if (message.includes("comment_not_found")) return NextResponse.json({ error: "评论已不存在，只能刷新审核记录" }, { status: 409 });
    console.error("admin_decide_comment_review_failed", error);
    return NextResponse.json({ error: "评论审核写入失败，请稍后重试" }, { status: 500 });
  }

  return NextResponse.json({ success: true, ...(data || {}) });
}
