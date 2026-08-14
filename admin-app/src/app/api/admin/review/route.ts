import { NextResponse } from "next/server";
import { createAdminServiceClient, getAdminContext } from "@/lib/supabase/admin-server";
import { healBrokenPrivateImageMarkers } from "@/lib/review-images";

type ManualFinding = {
  category?: string;
  severity?: "review" | "high";
  location_type?: string;
  field_name?: string;
  paragraph_index?: number | null;
  start_offset?: number | null;
  end_offset?: number | null;
  image_index?: number | null;
  quoted_text?: string | null;
  details?: string | null;
};

type ReviewBody = {
  reviewCaseId?: string;
  decision?: "approved" | "rejected";
  reason?: string | null;
  confirmedFindingIds?: string[];
  dismissedFindingIds?: string[];
  manualFindings?: ManualFinding[];
};

function normalizeIds(value: unknown, max = 50) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && /^[0-9a-f-]{36}$/i.test(item)))].slice(0, max);
}

function normalizeManualFindings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).flatMap((item): ManualFinding[] => {
    if (!item || typeof item !== "object") return [];
    const finding = item as Record<string, unknown>;
    const category = typeof finding.category === "string" ? finding.category.trim().slice(0, 100) : "";
    if (!category) return [];
    const severity = finding.severity === "high" ? "high" : "review";
    const locationType = finding.location_type === "image" || finding.location_type === "image_ocr" ? finding.location_type : "text_range";
    const fieldName = ["title", "content", "author_note", "image", "image_ocr"].includes(String(finding.field_name || ""))
      ? String(finding.field_name)
      : locationType === "image" ? "image" : "content";
    const paragraphIndex = Number.isInteger(finding.paragraph_index) && Number(finding.paragraph_index) > 0 ? Number(finding.paragraph_index) : null;
    const startOffset = Number.isInteger(finding.start_offset) && Number(finding.start_offset) >= 0 ? Number(finding.start_offset) : null;
    const endOffset = Number.isInteger(finding.end_offset) && Number(finding.end_offset) >= 0 ? Number(finding.end_offset) : null;
    const imageIndex = Number.isInteger(finding.image_index) && Number(finding.image_index) >= 0 ? Number(finding.image_index) : null;
    if (fieldName === "image" && imageIndex === null) return [];
    return [{
      category,
      severity,
      location_type: locationType,
      field_name: fieldName,
      paragraph_index: paragraphIndex,
      start_offset: startOffset,
      end_offset: endOffset,
      image_index: imageIndex,
      quoted_text: typeof finding.quoted_text === "string" ? finding.quoted_text.slice(0, 500) : null,
      details: typeof finding.details === "string" ? finding.details.trim().slice(0, 2000) || null : null,
    }];
  });
}

async function healApprovedReviewCaseImages(service: ReturnType<typeof createAdminServiceClient>, reviewCaseId: string) {
  if (!service) return;
  const { data: reviewCase } = await service
    .from("moderation_review_cases")
    .select("post_id, post_version_id")
    .eq("id", reviewCaseId)
    .maybeSingle();
  if (!reviewCase?.post_id || !reviewCase.post_version_id) return;

  const { data: version } = await service
    .from("post_versions")
    .select("content")
    .eq("id", reviewCase.post_version_id)
    .maybeSingle();
  const content = version?.content;
  if (!content) return;

  const healed = await healBrokenPrivateImageMarkers(service, content, reviewCase.post_id);
  if (healed === content) return;

  const { error: postError } = await service.from("posts").update({ content: healed }).eq("id", reviewCase.post_id);
  const { error: versionError } = await service.from("post_versions").update({ content: healed }).eq("id", reviewCase.post_version_id);
  if (postError || versionError) throw new Error(`image_marker_heal_failed:${postError?.message || versionError?.message}`);
}

export async function POST(request: Request) {
  const { supabase, user } = await getAdminContext();
  if (!user) return NextResponse.json({ error: "请先登录管理员后台" }, { status: 401 });

  const body = await request.json().catch(() => null) as ReviewBody | null;
  if (!body?.reviewCaseId || !["approved", "rejected"].includes(body.decision || "")) {
    return NextResponse.json({ error: "审核参数无效" }, { status: 400 });
  }

  const rejected = body.decision === "rejected";
  const reason = rejected ? (body.reason?.trim().slice(0, 200) || "") : null;
  const confirmedFindingIds = normalizeIds(body.confirmedFindingIds);
  const dismissedFindingIds = normalizeIds(body.dismissedFindingIds);
  const manualFindings = normalizeManualFindings(body.manualFindings);

  if (rejected && !reason) {
    return NextResponse.json({ error: "打回作品时必须选择问题类型" }, { status: 400 });
  }
  if (rejected && confirmedFindingIds.length === 0 && manualFindings.length === 0) {
    return NextResponse.json({ error: "打回作品时必须至少确认一项系统标记或添加一项人工标记" }, { status: 400 });
  }

  const service = createAdminServiceClient();
  const db = service || supabase;
  if (!rejected) {
    try {
      await healApprovedReviewCaseImages(service, body.reviewCaseId);
    } catch (error) {
      console.error("review_image_heal_failed", error);
      return NextResponse.json({ error: "审核图片地址修复失败，请刷新后重试" }, { status: 500 });
    }
  }
  const { data, error } = await db.rpc("admin_decide_post_review", {
    review_case_id: body.reviewCaseId,
    admin_id: user.id,
    decision: body.decision,
    reason,
    confirmed_finding_ids: confirmedFindingIds,
    dismissed_finding_ids: dismissedFindingIds,
    manual_findings: manualFindings,
  });

  if (error) {
    const message = String(error.message || "");
    if (message.includes("review_case_not_found")) {
      return NextResponse.json({ error: "没有找到对应的审核案件，请刷新审核列表" }, { status: 404 });
    }
    if (message.includes("review_case_not_actionable")) {
      return NextResponse.json({ error: "该审核案件已经处理，请刷新审核列表" }, { status: 409 });
    }
    if (message.includes("post_version_not_found")) {
      return NextResponse.json({ error: "审核版本已不存在，请刷新审核列表" }, { status: 409 });
    }
    if (message.includes("post_not_found")) {
      return NextResponse.json({ error: "作品已不存在，请刷新审核列表" }, { status: 404 });
    }
    if (message.includes("confirmed_finding_required")) {
      return NextResponse.json({ error: "打回作品时必须至少确认一项问题标记" }, { status: 400 });
    }
    if (message.includes("reject_reason_required")) {
      return NextResponse.json({ error: "打回作品时必须选择问题类型" }, { status: 400 });
    }
    console.error("admin_decide_post_review_failed", error);
    return NextResponse.json({ error: "审核写入失败，请稍后重试" }, { status: 500 });
  }

  return NextResponse.json({ success: true, ...(data || {}) });
}
