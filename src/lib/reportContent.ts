import { createClient } from "@/lib/supabase/browser";
import { assertCanReport } from "@/lib/userRestrictions";

type ReportTargetType = "post" | "comment" | "user";

/**
 * 统一走 submit_report_v1：自动合并同对象案件、保存内容快照，
 * 并返回可以直接展示给用户的中文结果。
 */
export async function submitReportV1(
  supabase: ReturnType<typeof createClient>,
  input: { targetType: ReportTargetType; targetId: string; reason: string; details?: string }
) {
  const reason = input.reason.trim();
  if (!reason) return { ok: false, message: "请选择举报原因。" };

  const blocked = await assertCanReport();
  if (blocked) return { ok: false, message: blocked };

  const { data, error } = await supabase.rpc("submit_report_v1", {
    p_target_type: input.targetType,
    p_target_id: input.targetId,
    p_reason_category: reason,
    p_details: input.details?.trim() || reason,
    p_evidence: {},
  });

  const result = data as { ok?: boolean; code?: string; message?: string } | null;
  if (error || !result?.ok) {
    const raw = error?.message || result?.message || "";
    if (/submit_report_v1/.test(raw)) {
      return { ok: false, message: "举报功能正在升级，请稍后再试。" };
    }
    return { ok: false, message: result?.message || "举报提交失败，请稍后重试。" };
  }
  return { ok: true, message: result.message || "举报已提交，我们会尽快处理。" };
}
