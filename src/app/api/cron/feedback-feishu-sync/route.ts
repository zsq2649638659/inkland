import { NextResponse } from "next/server";
import { syncPendingFeedbacksToFeishu } from "@/lib/feishuFeedback";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return NextResponse.json({ error: "定时任务密钥尚未配置" }, { status: 503 });
  }

  const authorization = request.headers.get("authorization");
  if (authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "无权执行该定时任务" }, { status: 401 });
  }

  try {
    const result = await syncPendingFeedbacksToFeishu();
    if (result.status === "skipped") {
      return NextResponse.json({ error: "飞书反馈同步尚未配置" }, { status: 503 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("反馈飞书补偿同步失败:", error);
    return NextResponse.json({ error: "反馈飞书补偿同步失败" }, { status: 500 });
  }
}
