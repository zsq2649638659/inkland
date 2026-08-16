import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/supabase/admin-server";

const tabs = ["cases", "reporters", "target_users"] as const;
const statuses = ["all", "pending", "reviewing", "kept", "reminded", "deleted", "no_violation", "content_case", "profile_changes", "warned", "restricted", "suspended", "banned"] as const;
const priorities = ["all", "normal", "high", "urgent"] as const;
const targetTypes = ["all", "post", "comment", "user"] as const;

export async function GET(request: Request) {
  const { supabase, user } = await getAdminContext();
  if (!user) return NextResponse.json({ error: "请先登录管理员后台" }, { status: 401 });

  const url = new URL(request.url);
  const tab = url.searchParams.get("tab") || "cases";
  const status = url.searchParams.get("status") || "all";
  const priority = url.searchParams.get("priority") || "all";
  const targetType = url.searchParams.get("targetType") || "all";
  const multiReportRaw = url.searchParams.get("multiReport");
  const suspiciousRaw = url.searchParams.get("suspicious");
  const serviceErrorRaw = url.searchParams.get("serviceError");
  const lowQualityRaw = url.searchParams.get("lowQuality");
  const query = (url.searchParams.get("q") || "").trim().slice(0, 100);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 100), 1), 200);

  if (!tabs.includes(tab as (typeof tabs)[number])
    || !statuses.includes(status as (typeof statuses)[number])
    || !priorities.includes(priority as (typeof priorities)[number])
    || !targetTypes.includes(targetType as (typeof targetTypes)[number])) {
    return NextResponse.json({ error: "筛选参数无效" }, { status: 400 });
  }

  const parseBool = (raw: string | null) => raw === "1" || raw === "true" ? true : null;
  const { data, error } = await supabase.rpc("admin_report_center_v2", {
    p_tab: tab,
    p_status: status,
    p_priority: priority,
    p_target_type: targetType,
    p_multi_report: parseBool(multiReportRaw),
    p_suspicious: parseBool(suspiciousRaw),
    p_service_error: parseBool(serviceErrorRaw),
    p_low_quality: parseBool(lowQualityRaw),
    p_query: query,
    p_limit: limit,
  });
  const result = data as { ok?: boolean; message?: string; cases?: unknown; reporters?: unknown; target_users?: unknown; counts?: unknown; filtered?: unknown } | null;
  if (error || !result?.ok) {
    const raw = error?.message || result?.message || "";
    if (/admin_report_center_v[12]/.test(raw)) {
      return NextResponse.json({ error: "举报中心功能尚未启用，请先执行举报中心数据库迁移。" }, { status: 500 });
    }
    return NextResponse.json({ error: result?.message || "举报中心数据读取失败，请稍后重试。" }, { status: 500 });
  }
  return NextResponse.json({
    success: true,
    cases: result.cases || [],
    reporters: result.reporters || [],
    targetUsers: result.target_users || [],
    counts: result.counts || {},
    filtered: result.filtered || { cases: 0, reporters: 0, target_users: 0 },
  });
}
