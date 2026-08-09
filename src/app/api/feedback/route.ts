import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const { error } = await supabase.from("feedbacks").insert({ user_id: user.id, type, content });
  if (error) {
    console.error("提交反馈失败:", error);
    return NextResponse.json({ error: "反馈暂时提交失败，请稍后再试" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
