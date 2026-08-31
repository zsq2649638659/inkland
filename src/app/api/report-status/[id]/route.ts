import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ ok: false, code: "invalid_id", error: "举报编号无效。" }, { status: 400 });
  }

  const sessionClient = await createServerClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, code: "not_logged_in", error: "请先登录。" }, { status: 401 });
  }

  let adminClient: ReturnType<typeof createAdminClient>;
  try {
    adminClient = createAdminClient();
  } catch (error) {
    console.error("report_status_admin_client_unavailable", error);
    return NextResponse.json({ ok: false, code: "service_unavailable", error: "举报状态暂时无法读取，请稍后再试。" }, { status: 503 });
  }

  const [{ data: contentReports, error: contentReportError }, { data: commentReports, error: commentReportError }] = await Promise.all([
    adminClient.from("content_reports").select("id").eq("case_id", id).eq("reporter_id", user.id).limit(1),
    adminClient.from("comment_reports").select("id").eq("case_id", id).eq("reporter_id", user.id).limit(1),
  ]);
  if (contentReportError || commentReportError) {
    console.error("report_status_report_lookup_failed", contentReportError || commentReportError);
    return NextResponse.json({ ok: false, code: "service_unavailable", error: "举报状态暂时无法读取，请稍后再试。" }, { status: 503 });
  }
  if (!contentReports?.[0] && !commentReports?.[0]) {
    return NextResponse.json({ ok: false, code: "not_found", error: "找不到这条举报，或你没有查看权限。" }, { status: 404 });
  }

  const { data: reportCase, error: caseError } = await adminClient
    .from("moderation_report_cases")
    .select("id,status,outcome,target_type,target_id,created_at,updated_at,metadata")
    .eq("id", id)
    .maybeSingle();
  if (caseError) {
    console.error("report_status_case_lookup_failed", caseError);
    return NextResponse.json({ ok: false, code: "service_unavailable", error: "举报状态暂时无法读取，请稍后再试。" }, { status: 503 });
  }
  if (!reportCase) {
    return NextResponse.json({ ok: false, code: "not_found", error: "这条举报案件已经不存在。" }, { status: 404 });
  }

  let targetPostId: string | null = reportCase.target_type === "post" ? reportCase.target_id : null;
  if (reportCase.target_type === "comment" && reportCase.target_id) {
    const { data: comment } = await adminClient
      .from("comments")
      .select("post_id")
      .eq("id", reportCase.target_id)
      .maybeSingle();
    targetPostId = (comment as { post_id?: string | null } | null)?.post_id || null;
    if (!targetPostId) {
      const { data: snapshot } = await adminClient
        .from("moderation_report_snapshots")
        .select("post_id")
        .eq("case_id", id)
        .maybeSingle();
      targetPostId = (snapshot as { post_id?: string | null } | null)?.post_id || null;
    }
  }

  return NextResponse.json({
    ok: true,
    case: {
      ...reportCase,
      target_post_id: targetPostId,
    },
  });
}
