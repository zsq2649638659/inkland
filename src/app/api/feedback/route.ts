import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncFeedbackToFeishu } from "@/lib/feishuFeedback";

const allowedTypes = new Set(["功能建议", "Bug 报告", "内容举报", "其他问题"]);

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const body = await request.json().catch(() => null) as { type?: string; content?: string } | null;
  const type = body?.type?.trim() || "";
  const content = body?.content?.trim() || "";
  if (!allowedTypes.has(type) || content.length < 2 || content.length > 5000) {
    return NextResponse.json({ error: "请填写有效的反馈内容" }, { status: 400 });
  }

  const { data: feedback, error } = await supabase
    .from("feedbacks")
    .insert({ user_id: user.id, type, content })
    .select("id")
    .single();
  if (error) {
    console.error("提交反馈失败:", error);
    return NextResponse.json({ error: "反馈暂时提交失败，请稍后再试" }, { status: 500 });
  }

  // 飞书同步失败不应影响用户提交反馈；失败记录会由每日补偿任务重试。
  const syncResult = await syncFeedbackToFeishu(feedback.id);
  if (syncResult.status === "failed") {
    console.warn("反馈已保存，但暂未同步到飞书:", { feedbackId: feedback.id, error: syncResult.error });
  }

  return NextResponse.json({ success: true, feishuSync: syncResult.status });
}
