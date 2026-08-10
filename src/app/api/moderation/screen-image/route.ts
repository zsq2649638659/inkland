import { createClient } from "@/lib/supabase/server";

type ModerationResult = { flagged?: boolean; categories?: Record<string, boolean> };

function imageUrls(content: string) {
  return [...content.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g)].map((match) => match[1]).slice(0, 9);
}

export async function POST(request: Request) {
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
  if (!key) return Response.json({ error: "图片审核服务尚未配置。" }, { status: 503 });
  try {
    const response = await fetch("https://api.openai.com/v1/moderations", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ model: "omni-moderation-latest", input: urls.map((url) => [{ type: "image_url", image_url: { url } }]) }) });
    if (!response.ok) throw new Error("moderation failed");
    const data = await response.json() as { results?: ModerationResult[]; model?: string };
    const findings = (data.results || []).flatMap((result, image_index) => result.flagged ? Object.entries(result.categories || {}).filter(([, flagged]) => flagged).map(([category]) => ({ image_index, category })) : []);
    const outcome = findings.length ? "flagged" : "approved";
    const { error } = await supabase.rpc("complete_image_screening", { post_id_input: postId, outcome, result: { model: data.model || "omni-moderation-latest", image_count: urls.length }, findings });
    if (error) throw error;
    return Response.json({ outcome, findings });
  } catch {
    await supabase.rpc("complete_image_screening", { post_id_input: postId, outcome: "service_error", result: { model: "omni-moderation-latest" }, findings: [] });
    return Response.json({ error: "图片审核服务暂时不可用，已转入人工处理。" }, { status: 503 });
  }
}
