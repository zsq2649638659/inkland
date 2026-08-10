import { createClient } from "@/lib/supabase/server";

type ModerationResult = { flagged?: boolean; categories?: Record<string, boolean> };

function imageUrls(content: string) {
  return [...content.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g)].map((match) => match[1]).slice(0, 9);
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "请先登录。" }, { status: 401 });
  const { postId } = await request.json().catch(() => ({})) as { postId?: string };
  if (!postId) return Response.json({ error: "缺少作品编号。" }, { status: 400 });
  const { data: post } = await supabase.from("posts").select("id, content, post_type, review_status").eq("id", postId).eq("user_id", user.id).maybeSingle();
  if (!post || post.post_type !== "illustration" || post.review_status !== "pending") return Response.json({ error: "作品当前不能进行图片审核。" }, { status: 409 });
  const urls = imageUrls(post.content || "");
  if (!urls.length) return Response.json({ error: "没有可供审核的公开图片。" }, { status: 400 });
  const key = process.env.OPENAI_API_KEY;
  const recordServiceError = async (reason: string) => {
    const { error } = await supabase.rpc("complete_image_screening", { post_id_input: postId, outcome: "service_error", result: { model: "omni-moderation-latest", reason }, findings: [] });
    if (error) console.error(JSON.stringify({ level: "error", route: "/api/moderation/screen-image", message: "screening_state_write_failed", reason, error: error.message, ms: Date.now() - startedAt }));
  };
  if (!key) {
    await recordServiceError("missing_api_key");
    console.error(JSON.stringify({ level: "error", route: "/api/moderation/screen-image", message: "missing_api_key", ms: Date.now() - startedAt }));
    return Response.json({ error: "图片审核服务尚未配置，已转入人工审核。" }, { status: 503 });
  }
  try {
    const response = await fetch("https://api.openai.com/v1/moderations", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ model: "omni-moderation-latest", input: urls.map((url) => [{ type: "image_url", image_url: { url } }]) }) });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new Error(`moderation_http_${response.status}:${detail}`);
    }
    const data = await response.json() as { results?: ModerationResult[]; model?: string };
    const findings = (data.results || []).flatMap((result, image_index) => result.flagged ? Object.entries(result.categories || {}).filter(([, flagged]) => flagged).map(([category]) => ({ image_index, category })) : []);
    const outcome = findings.length ? "flagged" : "approved";
    const { error } = await supabase.rpc("complete_image_screening", { post_id_input: postId, outcome, result: { model: data.model || "omni-moderation-latest", image_count: urls.length }, findings });
    if (error) throw error;
    console.log(JSON.stringify({ level: "info", route: "/api/moderation/screen-image", message: "screening_completed", outcome, image_count: urls.length, ms: Date.now() - startedAt }));
    return Response.json({ outcome, findings });
  } catch (error) {
    const reason = error instanceof Error ? error.message.slice(0, 500) : "unknown_error";
    await recordServiceError(reason);
    console.error(JSON.stringify({ level: "error", route: "/api/moderation/screen-image", message: "screening_failed", reason, ms: Date.now() - startedAt }));
    return Response.json({ error: "图片审核服务暂时不可用，已转入人工处理。" }, { status: 503 });
  }
}
