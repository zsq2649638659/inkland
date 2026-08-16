-- ============================================================
-- Inkland 飞书后续补全第 3 项：用户举报详情页（4.12）
-- 文件：user-report-detail-v1.sql
-- 依赖：report-closure-v1.sql、report-center-followup-v1.sql、
--       report-low-quality-queue-v1.sql、user-report-actions-v1.sql
-- 说明：幂等，可重复执行。在 Supabase SQL Editor 执行后：
--   1. 用户举报案件详情页支持“标记恶意举报”；
--   2. 标记会写入 moderation_report_cases.suspicious_report 与
--      metadata（原因、标记人、标记时间），并留下管理员审计日志；
--   3. 不改变现有 7 种处理结果函数，不影响已验收功能。
-- ============================================================

BEGIN;

-- 案件级“恶意举报”标记列（已由早期迁移建立的则跳过）
ALTER TABLE public.moderation_report_cases
  ADD COLUMN IF NOT EXISTS suspicious_report BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS moderation_report_cases_suspicious_idx
  ON public.moderation_report_cases (suspicious_report, status, last_reported_at DESC)
  WHERE status IN ('pending', 'reviewing');

CREATE OR REPLACE FUNCTION public.admin_mark_report_case_suspicious(
  p_case_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_id UUID;
  case_record public.moderation_report_cases%ROWTYPE;
  v_reason TEXT;
  now_ts TIMESTAMPTZ := NOW();
BEGIN
  admin_id := auth.uid();
  IF admin_id IS NULL OR NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'not_admin', 'message', '需要管理员权限。');
  END IF;
  IF p_case_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'invalid_params', 'message', '案件参数无效。');
  END IF;

  SELECT * INTO case_record
  FROM public.moderation_report_cases WHERE id = p_case_id;
  IF case_record.id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'case_missing', 'message', '没有找到该举报案件。');
  END IF;
  IF case_record.target_type <> 'user' THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'wrong_case_type', 'message', '该案件不是用户举报案件。');
  END IF;
  IF case_record.status NOT IN ('pending', 'reviewing') THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'already_resolved', 'message', '该举报案件已处理，无法再标记。');
  END IF;

  v_reason := btrim(COALESCE(p_reason, ''));
  IF v_reason = '' THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'missing_reason', 'message', '请填写标记原因。');
  END IF;

  UPDATE public.moderation_report_cases
  SET suspicious_report = TRUE,
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'suspicious_reason', v_reason,
        'suspicious_marked_by', admin_id,
        'suspicious_marked_at', now_ts
      ),
      updated_at = now_ts
  WHERE id = p_case_id;

  INSERT INTO public.admin_audit_logs (
    admin_id, action, target_type, target_id, note, created_at, metadata
  ) VALUES (
    admin_id, 'mark_report_case_suspicious', 'report_case', p_case_id,
    left(v_reason, 500), now_ts,
    jsonb_build_object(
      'target_user_id', case_record.target_user_id,
      'reason', v_reason
    )
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'case_id', p_case_id,
    'suspicious_report', TRUE,
    'message', '该案件已标记为恶意举报，并进入恶意举报审核流程。'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', FALSE, 'code', 'mark_failed', 'message', '标记失败：' || SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_mark_report_case_suspicious(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_mark_report_case_suspicious(UUID, TEXT) TO authenticated, service_role;

COMMIT;

-- 执行后只读核验（单独运行）：
-- SELECT proname FROM pg_proc
-- WHERE proname = 'admin_mark_report_case_suspicious';
-- SELECT suspicious_report FROM public.moderation_report_cases LIMIT 1;
