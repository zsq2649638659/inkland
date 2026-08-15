import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/supabase/admin-server";

const allowedTypes = ["all", "comment", "publish", "report", "account"] as const;

export async function POST(request: Request) {
  const { supabase, user } = await getAdminContext();
  if (!user) return NextResponse.json({ error: "请先登录管理员后台" }, { status: 401 });
  const body = await request.json().catch(() => null) as {
    userId?: string;
    action?: string;
    restrictionType?: string | null;
    reason?: string;
    restoreContent?: boolean;
    note?: string | null;
  } | null;
  if (!body?.userId || !body.action || !["lift", "restore"].includes(body.action)) {
    return NextResponse.json({ error: "解除参数无效" }, { status: 400 });
  }
  if (body.action === "lift" && body.restrictionType && !allowedTypes.includes(body.restrictionType as (typeof allowedTypes)[number])) {
    return NextResponse.json({ error: "限制类型无效" }, { status: 400 });
  }
  const { data, error } = await supabase.rpc("admin_lift_user_restriction", {
    p_user_id: body.userId,
    p_action: body.action,
    p_restriction_type: body.restrictionType || null,
    p_reason: body.reason?.trim() || null,
    p_restore_content: Boolean(body.restoreContent),
    p_note: body.note?.trim() || null,
  });
  const result = data as { ok?: boolean; message?: string } | null;
  if (error || !result?.ok) {
    const raw = error?.message || result?.message || "";
    if (/admin_lift_user_restriction/.test(raw)) {
      return NextResponse.json({ error: "解除限制功能尚未启用，请先执行模块6数据库迁移。" }, { status: 500 });
    }
    return NextResponse.json({ error: result?.message || "解除操作失败，请稍后重试。" }, { status: 500 });
  }
  return NextResponse.json({ success: true, message: result.message || "操作已完成。" });
}
