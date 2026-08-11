import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type Finding = {
  image_index: number;
  category: string;
  score: number;
  details?: string;
  box?: number[] | null;
};

function contentImageSources(content: string) {
  return [...content.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)]
    .map((match) => match[1])
    .slice(0, 9);
}

export const runtime = "nodejs";

export async function POST(request: Request) {
  const startedAt = Date.now();
  const sessionClient = await createClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return Response.json({ error: "请先登录。" }, { status: 401 });

  const body = await request.json().catch(() => ({})) as { postId?: string };
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
    stage = "parse_moderation_result";
    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(`moderation_service_http_${response.status}:${responseText.slice(0, 1200)}`);
    }
    const result = JSON.parse(responseText) as { outcome?: string; findings?: Finding[]; engine?: string; model?: string };
    const findings = Array.isArray(result.findings) ? result.findings : [];
    const outcome = findings.length > 0 || result.outcome === "flagged" ? "flagged" : "approved";
    if (outcome === "approved") {
      stage = "promote_approved_images";
      await promotePrivateImages(admin, body.postId, post.content || "");
    }
    stage = "write_screening_result";
    const { error } = await admin.rpc("complete_image_screening", {
      post_id_input: body.postId,
      outcome,
      result: { ...result, source: "modelscope_studio", image_count: images.length },
      findings,
    });
    if (error) throw error;
    console.log(JSON.stringify({ level: "info", route: "/api/moderation/screen-image", message: "server_screening_completed", post_id: body.postId, outcome, findings: findings.length, ms: Date.now() - startedAt }));
    return Response.json({ outcome, findings });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", route: "/api/moderation/screen-image", message: "server_screening_failed", post_id: body.postId, stage, error: serializeError(error), ms: Date.now() - startedAt }));
    return completeAsError(admin, body.postId, "NudeNet 服务异常。");
  }
}

async function promotePrivateImages(admin: ReturnType<typeof createAdminClient>, postId: string, content: string) {
  const paths = [...content.matchAll(/private:\/\/private-post-images\/([A-Za-z0-9/_\-.]+)/g)].map((match) => match[1]);
  if (!paths.length) return;
  let updatedContent = content;
  for (const sourcePath of paths) {
    const targetPath = `approved/${postId}/${sourcePath.split("/").pop()}`;
    const { error: copyError } = await admin.storage.from("private-post-images").copy(sourcePath, targetPath, { destinationBucket: "post-images" });
    if (copyError) throw new Error(`image_promote_copy_failed:${copyError.message}`);
    const { data } = admin.storage.from("post-images").getPublicUrl(targetPath);
    if (!data.publicUrl) throw new Error("image_promote_public_url_failed");
    updatedContent = updatedContent.split(`private://private-post-images/${sourcePath}`).join(data.publicUrl);
    await admin.storage.from("private-post-images").remove([sourcePath]);
  }
  const { error: updateError } = await admin.from("posts").update({ content: updatedContent }).eq("id", postId);
  if (updateError) throw new Error(`image_promote_content_update_failed:${updateError.message}`);
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
