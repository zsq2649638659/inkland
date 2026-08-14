import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type Finding = {
  image_index: number;
  category: string;
  score: number;
  details?: string;
  box?: number[] | null;
  source?: "nudenet_modelscope" | "nsfwjs_client" | "paddleocr_modelscope";
  severity?: "review" | "high";
  quoted_text?: string;
  metadata?: Record<string, unknown>;
};

type OcrBlock = { text?: string; confidence?: number; polygon?: number[][] };
type OcrResult = { image_index?: number; status?: string; text?: string; blocks?: OcrBlock[] };
type ModerationRule = { id: string; rule_type: "keyword" | "whitelist"; pattern: string; category: string; severity: "review" | "high"; enabled: boolean };

const CLIENT_THRESHOLDS: Record<string, number> = { porn: 0.45, hentai: 0.45, sexy: 0.7 };

function contentImageSources(content: string) {
  return [...content.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)]
    .map((match) => match[1])
    .slice(0, 9);
}

function normalizeScreeningText(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/[\u200B-\u200D\u2060\uFEFF]/g, "").replace(/\s+/g, " ").trim();
}

function keywordFindingsFromOcr(ocrResults: OcrResult[], rules: ModerationRule[], imageCount: number): Finding[] {
  const whitelisted = new Set(rules
    .filter((rule) => rule.enabled && rule.rule_type === "whitelist")
    .map((rule) => `${rule.category}\u0000${normalizeScreeningText(rule.pattern)}`));
  const keywords = rules.filter((rule) => rule.enabled && rule.rule_type === "keyword" && !whitelisted.has(`${rule.category}\u0000${normalizeScreeningText(rule.pattern)}`));
  const findings: Finding[] = [];

  for (const result of ocrResults) {
    const imageIndex = Number(result.image_index);
    if (!Number.isInteger(imageIndex) || imageIndex < 0 || imageIndex >= imageCount || result.status !== "completed" || !Array.isArray(result.blocks)) continue;
    for (const block of result.blocks.slice(0, 120)) {
      const text = typeof block.text === "string" ? block.text.trim().slice(0, 500) : "";
      const confidence = Number(block.confidence);
      if (!text || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) continue;
      const normalizedText = normalizeScreeningText(text);
      for (const rule of keywords) {
        const normalizedPattern = normalizeScreeningText(rule.pattern);
        if (!normalizedPattern || !normalizedText.includes(normalizedPattern)) continue;
        findings.push({
          image_index: imageIndex,
          category: rule.category,
          score: confidence,
          source: "paddleocr_modelscope",
          severity: rule.severity,
          quoted_text: text,
          details: `图片文字识别命中关键词“${rule.pattern}”`,
          metadata: { rule_id: rule.id, pattern: rule.pattern, ocr_polygon: block.polygon || null, ocr_confidence: confidence },
        });
        if (findings.length >= 100) return findings;
      }
    }
  }
  return findings;
}

export const runtime = "nodejs";

export async function POST(request: Request) {
  const startedAt = Date.now();
  const sessionClient = await createClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return Response.json({ error: "请先登录。" }, { status: 401 });

  const body = await request.json().catch(() => ({})) as { postId?: string; clientFindings?: Finding[] };
  if (!body.postId) return Response.json({ error: "缺少作品编号。" }, { status: 400 });

  let admin;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error("moderation_admin_client_unavailable", error);
    return Response.json({ error: "服务端审核尚未配置，作品已转入人工审核。" }, { status: 503 });
  }

  const { data: post } = await admin
    .from("posts")
    .select("id, user_id, content, post_type, review_status")
    .eq("id", body.postId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!post || post.post_type !== "illustration" || post.review_status !== "pending") {
    return Response.json({ error: "作品当前不能进行图片审核。" }, { status: 409 });
  }

  const sources = contentImageSources(post.content || "");
  if (!sources.length) return Response.json({ error: "没有可供审核的图片。" }, { status: 400 });

  const images: Array<{ index: number; url: string }> = [];
  for (const [index, source] of sources.entries()) {
    const privateMatch = source.match(/^private:\/\/private-post-images\/(.+)$/);
    if (privateMatch) {
      const { data } = await admin.storage.from("private-post-images").createSignedUrl(privateMatch[1], 600);
      if (!data?.signedUrl) return completeAsError(admin, body.postId, "无法生成图片临时地址。");
      images.push({ index, url: data.signedUrl });
    } else if (/^https?:\/\//.test(source)) {
      images.push({ index, url: source });
    }
  }

  // 浏览器模型的结果只允许把作品升级为人工审核，绝不能据此自动放行。
  // 服务端重新校验类别、图片序号和阈值，避免任意内容被写入审核记录。
  const clientFindings = Array.isArray(body.clientFindings)
    ? body.clientFindings.slice(0, 27).flatMap((finding) => {
      const category = typeof finding.category === "string" ? finding.category.toLowerCase() : "";
      const score = Number(finding.score);
      const imageIndex = Number(finding.image_index);
      const threshold = CLIENT_THRESHOLDS[category];
      if (!threshold || !Number.isInteger(imageIndex) || imageIndex < 0 || imageIndex >= images.length || !Number.isFinite(score) || score < threshold || score > 1) return [];
      return [{ image_index: imageIndex, category, score, source: "nsfwjs_client" as const, details: "浏览器辅助模型检测到潜在风险；该结果仅用于转人工复核" }];
    })
    : [];

  const serviceUrl = process.env.MODERATION_SERVICE_URL?.replace(/\/$/, "");
  const serviceSecret = process.env.MODERATION_SERVICE_SECRET;
  if (!serviceUrl || !serviceSecret) {
    return completeAsError(admin, body.postId, "NudeNet 服务尚未配置。");
  }

  let stage = "call_moderation_service";
  try {
    const response = await fetch(`${serviceUrl}/moderate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-moderation-secret": serviceSecret,
      },
      body: JSON.stringify({ images }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new Error(`moderation_service_http_${response.status}`);
    stage = "parse_moderation_result";
    const result = await response.json() as { outcome?: string; findings?: Finding[]; engine?: string; model?: string; ocr_model?: string; ocr_results?: OcrResult[] };
    const ocrResults = Array.isArray(result.ocr_results) ? result.ocr_results : [];
    if (ocrResults.length !== images.length || ocrResults.some((item) => item.status !== "completed")) throw new Error("moderation_service_ocr_incomplete");
    const { data: ruleRows, error: rulesError } = await admin
      .from("moderation_rules")
      .select("id, rule_type, pattern, category, severity, enabled")
      .eq("enabled", true);
    if (rulesError) throw new Error(`moderation_rules_unavailable:${rulesError.message}`);
    const serverFindings = Array.isArray(result.findings)
      ? result.findings.map((finding) => ({ ...finding, source: "nudenet_modelscope" as const }))
      : [];
    const ocrFindings = keywordFindingsFromOcr(ocrResults, (ruleRows || []) as ModerationRule[], images.length);
    const findings = [...serverFindings, ...ocrFindings, ...clientFindings];
    const outcome = findings.length > 0 || result.outcome === "flagged" ? "flagged" : "approved";
    stage = "write_screening_result";
    const { error } = await admin.rpc("complete_image_screening", {
      post_id_input: body.postId,
      outcome,
      result: { ...result, source: "modelscope_studio", image_count: images.length, ocr_keyword_findings: ocrFindings.length, client_auxiliary_findings: clientFindings.length },
      findings,
    });
    if (error) throw error;
    if (outcome === "approved") {
      const { data: screenedPost } = await admin
        .from("posts")
        .select("review_status")
        .eq("id", body.postId)
        .maybeSingle();
      if (screenedPost?.review_status === "approved") {
        stage = "promote_approved_images";
        await promotePrivateImages(admin, body.postId, post.content || "");
      }
    }
    console.log(JSON.stringify({ level: "info", route: "/api/moderation/screen-image", message: "server_screening_completed", post_id: body.postId, outcome, findings: findings.length, ms: Date.now() - startedAt }));
    return Response.json({ outcome, findings });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", route: "/api/moderation/screen-image", message: "server_screening_failed", post_id: body.postId, stage, error: serializeError(error), ms: Date.now() - startedAt }));
    return completeAsError(admin, body.postId, "图片或 OCR 审核服务异常。");
  }
}

function serializeError(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };
  if (typeof error === "string") return { message: error };
  try {
    return { value: JSON.parse(JSON.stringify(error)) };
  } catch {
    return { message: String(error) };
  }
}

async function promotePrivateImages(admin: ReturnType<typeof createAdminClient>, postId: string, content: string) {
  const paths = [...content.matchAll(/private:\/\/private-post-images\/([A-Za-z0-9/_\-.]+)/g)].map((match) => match[1]);
  if (!paths.length) return content;

  const replacements: Array<{ sourcePath: string; publicUrl: string }> = [];
  for (const sourcePath of paths) {
    const targetPath = `approved/${postId}/${sourcePath.split("/").pop()}`;
    const { error: copyError } = await admin.storage.from("private-post-images").copy(sourcePath, targetPath, { destinationBucket: "post-images" });
    if (copyError) {
      const existingPublicUrl = await findPublicApprovedImageUrl(admin, postId, sourcePath);
      if (existingPublicUrl) {
        replacements.push({ sourcePath, publicUrl: existingPublicUrl });
        continue;
      }
      throw new Error(`image_promote_copy_failed:${copyError.message}`);
    }
    const { data } = admin.storage.from("post-images").getPublicUrl(targetPath);
    if (!data.publicUrl) throw new Error("image_promote_public_url_failed");
    replacements.push({ sourcePath, publicUrl: data.publicUrl });
  }

  let updatedContent = content;
  for (const { sourcePath, publicUrl } of replacements) {
    updatedContent = updatedContent.split(`private://private-post-images/${sourcePath}`).join(publicUrl);
  }

  const { error: updateError } = await admin.from("posts").update({ content: updatedContent }).eq("id", postId);
  if (updateError) throw new Error(`image_promote_content_update_failed:${updateError.message}`);

  const { data: latestVersion } = await admin
    .from("post_versions")
    .select("id")
    .eq("post_id", postId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestVersion?.id) {
    const { error: versionError } = await admin
      .from("post_versions")
      .update({ content: updatedContent })
      .eq("id", latestVersion.id);
    if (versionError) throw new Error(`post_version_content_sync_failed:${versionError.message}`);
  }

  const { error: removeError } = await admin.storage.from("private-post-images").remove(replacements.map((item) => item.sourcePath));
  if (removeError) console.error("image_promote_private_remove_failed", removeError);
  return updatedContent;
}

async function findPublicApprovedImageUrl(admin: ReturnType<typeof createAdminClient>, postId: string, sourcePath: string) {
  const filename = sourcePath.split("/").pop();
  if (!filename) return null;
  const folderPath = `approved/${postId}`;
  const { data: objects, error } = await admin.storage.from("post-images").list(folderPath);
  if (error || !Array.isArray(objects) || !objects.some((object) => object.name === filename)) return null;
  return admin.storage.from("post-images").getPublicUrl(`${folderPath}/${filename}`).data?.publicUrl || null;
}

async function completeAsError(admin: ReturnType<typeof createAdminClient>, postId: string, message: string) {
  const { error } = await admin.rpc("complete_image_screening", {
    post_id_input: postId,
    outcome: "service_error",
    result: { source: "modelscope_studio", reason: message },
    findings: [],
  });
  if (error) console.error("moderation_service_error_state_write_failed", error);
  return Response.json({ error: `${message}作品已转入人工审核。` }, { status: 503 });
}
