import { getAdminContext } from "@/lib/supabase/admin-server";

const categories = new Set([
  "政治敏感",
  "淫秽色情",
  "涉未成年人不良信息",
  "低俗恶趣",
  "暴力血腥",
  "欺诈广告",
  "人身攻击",
  "恶意营销",
  "抄袭信息",
  "其他违规",
]);
const MAX_BATCH_SIZE = 5000;
const ERROR_STATUS: Record<string, number> = {
  not_admin: 403,
  invalid_category: 400,
  invalid_risk_level: 400,
  invalid_min_hits: 400,
  empty_batch: 400,
  batch_too_large: 400,
  description_too_long: 400,
};
const riskLevels = new Set(["low", "medium", "high"]);
const riskDefaultMinHits: Record<string, number> = { low: 5, medium: 3, high: 1 };

function parseMinHits(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 999 ? parsed : NaN;
}

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
  risk_level?: string;
  min_hits?: number;
};

function isMissingBulkImportFunction(error: { message?: string } | null) {
  return error?.message?.includes("admin_bulk_import_moderation_rules") === true;
}

function isMissingRiskColumns(error: { message?: string } | null) {
  return error?.message?.includes("risk_level") === true || error?.message?.includes("min_hits") === true;
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
  const riskLevel = body.riskLevel;
  const rawMinHits = parseMinHits(body.minHits);
  if (typeof category !== "string" || !categories.has(category)) {
    return Response.json({ error: "问题分类不正确。" }, { status: 400 });
  }
  if (typeof riskLevel !== "string" || !riskLevels.has(riskLevel)) {
    return Response.json({ error: "风险级别不正确。" }, { status: 400 });
  }
  if (Number.isNaN(rawMinHits)) {
    return Response.json({ error: "最低命中次数必须是 1 至 999 的整数。" }, { status: 400 });
  }

  const description = typeof body.description === "string" ? body.description.trim() : null;
  if (description && description.length > 500) {
    return Response.json({ error: "备注不能超过 500 个字符。" }, { status: 400 });
  }

  const minHits = rawMinHits ?? riskDefaultMinHits[riskLevel];
  const { data, error } = await supabase.rpc("admin_bulk_import_moderation_rules", {
    p_admin_id: user.id,
    p_texts: texts,
    p_category: category,
    p_risk_level: riskLevel,
    p_min_hits: minHits,
    p_description: description,
  });
  const result = data as BulkImportRpcResult | null;

  if (error || !result?.ok) {
    if (isMissingRiskColumns(error)) {
      return Response.json({ error: "风险分级功能尚未启用，请先执行 moderation-risk-thresholds-v1.sql。" }, { status: 503 });
    }
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
      riskLevel: result.risk_level ?? riskLevel,
      minHits: result.min_hits ?? minHits,
    },
  });
}
