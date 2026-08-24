import { getAdminContext } from "@/lib/supabase/admin-server";

const categories = new Set([
  "广告与导流",
  "诈骗与交易风险",
  "人身攻击与骚扰",
  "暴力与威胁",
  "成人与不当内容",
  "其他",
]);
const MAX_BATCH_SIZE = 5000;
const ERROR_STATUS: Record<string, number> = {
  not_admin: 403,
  invalid_category: 400,
  invalid_severity: 400,
  empty_batch: 400,
  batch_too_large: 400,
  description_too_long: 400,
};

type BulkImportRpcResult = {
  ok?: boolean;
  code?: string;
  message?: string;
  inserted?: number;
  skipped?: number;
  invalid_lines?: number;
  invalid_examples?: string[];
  ignored_blank_lines?: number;
  duplicated_in_batch?: number;
  total_input?: number;
  category?: string;
  severity?: string;
};

function isMissingBulkImportFunction(error: { message?: string } | null) {
  return error?.message?.includes("admin_bulk_import_moderation_rules") === true;
}

export async function POST(request: Request) {
  const { supabase, user } = await getAdminContext();
  if (!user) return Response.json({ error: "管理员登录已失效。" }, { status: 401 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || !Array.isArray(body.texts)) {
    return Response.json({ error: "请提供要导入的敏感词列表。" }, { status: 400 });
  }

  const texts = body.texts;
  if (texts.some((item) => typeof item !== "string")) {
    return Response.json({ error: "导入内容格式不正确，请使用每行一个敏感词的文本。" }, { status: 400 });
  }
  if (texts.length === 0) {
    return Response.json({ error: "导入内容为空，请粘贴文本或上传文件。" }, { status: 400 });
  }
  if (texts.length > MAX_BATCH_SIZE) {
    return Response.json({ error: "单批最多 5000 条，请分批导入。" }, { status: 400 });
  }

  const category = body.category;
  const severity = body.severity;
  if (typeof category !== "string" || !categories.has(category)) {
    return Response.json({ error: "问题分类不正确。" }, { status: 400 });
  }
  if (severity !== "review" && severity !== "high") {
    return Response.json({ error: "风险级别不正确。" }, { status: 400 });
  }

  const description = typeof body.description === "string" ? body.description.trim() : null;
  if (description && description.length > 500) {
    return Response.json({ error: "备注不能超过 500 个字符。" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("admin_bulk_import_moderation_rules", {
    p_admin_id: user.id,
    p_texts: texts,
    p_category: category,
    p_severity: severity,
    p_description: description,
  });
  const result = data as BulkImportRpcResult | null;

  if (error || !result?.ok) {
    if (isMissingBulkImportFunction(error)) {
      return Response.json({ error: "敏感词批量导入功能尚未启用，请先执行 moderation-rules-bulk-import-v1.sql。" }, { status: 503 });
    }
    const code = result?.code ?? "";
    return Response.json({ error: result?.message || "批量导入失败，请稍后重试。" }, { status: ERROR_STATUS[code] ?? 500 });
  }

  const inserted = result.inserted ?? 0;
  const skipped = result.skipped ?? 0;
  const invalidLines = result.invalid_lines ?? 0;
  return Response.json({
    success: true,
    message: `批量导入完成：新增 ${inserted} 条，跳过 ${skipped} 条，无效 ${invalidLines} 条。`,
    result: {
      inserted,
      skipped,
      invalidLines,
      invalidExamples: result.invalid_examples ?? [],
      ignoredBlankLines: result.ignored_blank_lines ?? 0,
      duplicatedInBatch: result.duplicated_in_batch ?? 0,
      totalInput: result.total_input ?? texts.length,
      category: result.category ?? category,
      severity: result.severity ?? severity,
    },
  });
}
