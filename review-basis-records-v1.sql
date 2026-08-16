-- ============================================================
-- Inkland 飞书后续补全：审核依据与完整操作记录（2.8 / 3.20）
-- 文件：review-basis-records-v1.sql
-- 依赖：report-closure-v1.sql、report-center-followup-v1.sql、
--       report-composite-priority-v1.sql、user-report-actions-v1.sql
-- 说明：幂等，可重复执行。在 Supabase SQL Editor 执行后：
--   1. 新增 admin_report_operation_record_v1，按案件汇总审核依据与
--      处理全链路记录（举报快照、举报人、自动审核、管理员结论、
--      违规/处罚/通知/资料整改/解除限制/审计日志）；
--   2. 旧案件缺少关联字段时返回空数组 / null，不影响详情页打开；
--   3. 只读接口，仅管理员可调用。
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_report_operation_record_v1(
  p_case_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_id UUID;
  v_case public.moderation_report_cases%ROWTYPE;
  v_snapshot public.moderation_report_snapshots%ROWTYPE;
  v_case_json JSONB;
  v_assigned_nickname TEXT;
  v_resolved_nickname TEXT;
  v_reports JSONB := '[]'::jsonb;
  v_violations JSONB := '[]'::jsonb;
  v_restrictions JSONB := '[]'::jsonb;
  v_profile_revisions JSONB := '[]'::jsonb;
  v_notifications JSONB := '[]'::jsonb;
  v_audit_logs JSONB := '[]'::jsonb;
  v_reporter_stats JSONB := '[]'::jsonb;
  v_reporter_ids UUID[] := '{}';
  v_row RECORD;
BEGIN
  admin_id := auth.uid();
  IF admin_id IS NULL OR NOT public.is_admin() THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'code', 'not_admin',
      'message', '需要管理员权限。'
    );
  END IF;
  IF p_case_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'code', 'invalid_params',
      'message', '案件 ID 不能为空。'
    );
  END IF;

  SELECT * INTO v_case
  FROM public.moderation_report_cases
  WHERE id = p_case_id;
  IF v_case.id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'code', 'case_missing',
      'message', '没有找到该举报案件。'
    );
  END IF;

  SELECT * INTO v_snapshot
  FROM public.moderation_report_snapshots
  WHERE case_id = p_case_id
  LIMIT 1;

  SELECT p.nickname INTO v_assigned_nickname
  FROM public.profiles p
  WHERE p.id = v_case.assigned_admin_id;

  SELECT p.nickname INTO v_resolved_nickname
  FROM public.profiles p
  WHERE p.id = v_case.resolved_by;

  FOR v_row IN
    SELECT id, reporter_id, reason, reason_category, details, evidence,
           status, created_at, resolved_at, 'content' AS kind,
           target_type, target_id
    FROM public.content_reports
    WHERE case_id = p_case_id
    UNION ALL
    SELECT id, reporter_id, reason, reason_category, details, evidence,
           status, created_at, resolved_at, 'comment' AS kind,
           'comment' AS target_type, comment_id::UUID AS target_id
    FROM public.comment_reports
    WHERE case_id = p_case_id
    ORDER BY created_at ASC
  LOOP
    v_reports := v_reports || jsonb_build_object(
      'id', v_row.id,
      'kind', v_row.kind,
      'target_type', v_row.target_type,
      'target_id', v_row.target_id,
      'reporter_id', v_row.reporter_id,
      'reason', v_row.reason,
      'reason_category', v_row.reason_category,
      'details', v_row.details,
      'evidence', v_row.evidence,
      'status', v_row.status,
      'created_at', v_row.created_at,
      'resolved_at', v_row.resolved_at
    );
    IF v_row.reporter_id IS NOT NULL
       AND NOT v_row.reporter_id = ANY(v_reporter_ids) THEN
      v_reporter_ids := v_reporter_ids || v_row.reporter_id;
    END IF;
  END LOOP;

  FOR v_row IN
    SELECT v.id, v.user_id, v.source_type, v.source_id, v.content_type,
           v.content_id, v.category, v.severity, v.summary, v.status,
           v.confirmed_by, v.confirmed_at, v.revoked_at, v.metadata,
           p.nickname AS confirmed_by_nickname
    FROM public.user_violations v
    LEFT JOIN public.profiles p ON p.id = v.confirmed_by
    WHERE v.user_id = COALESCE(v_case.target_user_id, v_snapshot.author_id)
      AND (
        v.metadata->>'case_id' = p_case_id::text
        OR v.source_type = 'report_case' AND v.source_id = p_case_id
      )
    ORDER BY v.confirmed_at ASC
  LOOP
    v_violations := v_violations || jsonb_build_object(
      'id', v_row.id,
      'user_id', v_row.user_id,
      'source_type', v_row.source_type,
      'source_id', v_row.source_id,
      'content_type', v_row.content_type,
      'content_id', v_row.content_id,
      'category', v_row.category,
      'severity', v_row.severity,
      'summary', v_row.summary,
      'status', v_row.status,
      'confirmed_by', v_row.confirmed_by,
      'confirmed_by_nickname', v_row.confirmed_by_nickname,
      'confirmed_at', v_row.confirmed_at,
      'revoked_at', v_row.revoked_at,
      'metadata', v_row.metadata
    );
  END LOOP;

  -- 限制记录包含直接写入 case_id 的记录，以及通过违规 source_id
  -- 关联到旧版手动处罚（模块 6）的限制。
  FOR v_row IN
    SELECT r.id, r.user_id, r.restriction_type, r.status, r.reason,
           r.starts_at, r.ends_at, r.created_by, r.created_at,
           r.lifted_by, r.lifted_at, r.metadata,
           p.nickname AS created_by_nickname,
           l.nickname AS lifted_by_nickname
    FROM public.user_restrictions r
    LEFT JOIN public.profiles p ON p.id = r.created_by
    LEFT JOIN public.profiles l ON l.id = r.lifted_by
    WHERE r.user_id = COALESCE(v_case.target_user_id, v_snapshot.author_id)
      AND (
        r.metadata->>'case_id' = p_case_id::text
        OR r.id IN (
          SELECT COALESCE(
            NULLIF(vv.metadata->>'restriction_id', ''),
            vv.source_id::text
          )::UUID
          FROM public.user_violations vv
          WHERE vv.user_id = COALESCE(v_case.target_user_id, v_snapshot.author_id)
            AND (
              vv.metadata->>'case_id' = p_case_id::text
              OR vv.source_type = 'report_case' AND vv.source_id = p_case_id
            )
        )
      )
    ORDER BY r.created_at ASC
  LOOP
    v_restrictions := v_restrictions || jsonb_build_object(
      'id', v_row.id,
      'user_id', v_row.user_id,
      'restriction_type', v_row.restriction_type,
      'status', v_row.status,
      'reason', v_row.reason,
      'starts_at', v_row.starts_at,
      'ends_at', v_row.ends_at,
      'created_by', v_row.created_by,
      'created_by_nickname', v_row.created_by_nickname,
      'created_at', v_row.created_at,
      'lifted_by', v_row.lifted_by,
      'lifted_by_nickname', v_row.lifted_by_nickname,
      'lifted_at', v_row.lifted_at,
      'metadata', v_row.metadata
    );
  END LOOP;

  FOR v_row IN
    SELECT pr.id, pr.user_id, pr.issue_type, pr.issue_detail,
           pr.status, pr.created_by, pr.created_at,
           pr.confirmed_by, pr.confirmed_at,
           p.nickname AS created_by_nickname,
           c.nickname AS confirmed_by_nickname
    FROM public.profile_revision_requests pr
    LEFT JOIN public.profiles p ON p.id = pr.created_by
    LEFT JOIN public.profiles c ON c.id = pr.confirmed_by
    WHERE pr.case_id = p_case_id
    ORDER BY pr.created_at ASC
  LOOP
    v_profile_revisions := v_profile_revisions || jsonb_build_object(
      'id', v_row.id,
      'user_id', v_row.user_id,
      'issue_type', v_row.issue_type,
      'issue_detail', v_row.issue_detail,
      'status', v_row.status,
      'created_by', v_row.created_by,
      'created_by_nickname', v_row.created_by_nickname,
      'created_at', v_row.created_at,
      'confirmed_by', v_row.confirmed_by,
      'confirmed_by_nickname', v_row.confirmed_by_nickname,
      'confirmed_at', v_row.confirmed_at
    );
  END LOOP;

  FOR v_row IN
    SELECT n.id, n.user_id, n.type, n.template_key, n.content,
      n.created_at, n.sent_at, n.related_entity_type,
      n.related_entity_id, n.metadata,
      p.nickname AS recipient_nickname
    FROM public.notifications n
    LEFT JOIN public.profiles p ON p.id = n.user_id
    WHERE n.metadata->>'case_id' = p_case_id::text
       OR (
         n.related_entity_type = 'report_case'
         AND n.related_entity_id = p_case_id
       )
       OR (
         n.related_entity_type IN ('post', 'comment')
         AND n.related_entity_id IN (
           SELECT target_id::UUID
           FROM public.content_reports
           WHERE case_id = p_case_id
           UNION ALL
           SELECT comment_id::UUID
           FROM public.comment_reports
           WHERE case_id = p_case_id
         )
       )
    ORDER BY n.created_at ASC, n.id ASC
  LOOP
    v_notifications := v_notifications || jsonb_build_object(
      'id', v_row.id,
      'user_id', v_row.user_id,
      'recipient_nickname', v_row.recipient_nickname,
      'type', v_row.type,
      'template_key', v_row.template_key,
      'content', v_row.content,
      'created_at', v_row.created_at,
      'sent_at', v_row.sent_at,
      'related_entity_type', v_row.related_entity_type,
      'related_entity_id', v_row.related_entity_id,
      'metadata', v_row.metadata
    );
  END LOOP;

  FOR v_row IN
    SELECT a.id, a.admin_id, a.action, a.target_type, a.target_id,
           a.note, a.created_at, a.metadata,
           p.nickname AS admin_nickname
    FROM public.admin_audit_logs a
    LEFT JOIN public.profiles p ON p.id = a.admin_id
    WHERE a.target_type = 'report_case' AND a.target_id = p_case_id
    ORDER BY a.created_at ASC
  LOOP
    v_audit_logs := v_audit_logs || jsonb_build_object(
      'id', v_row.id,
      'admin_id', v_row.admin_id,
      'admin_nickname', v_row.admin_nickname,
      'action', v_row.action,
      'note', v_row.note,
      'created_at', v_row.created_at,
      'metadata', v_row.metadata
    );
  END LOOP;

  IF array_length(v_reporter_ids, 1) > 0 THEN
    FOR v_row IN
      SELECT s.user_id, s.total_reports, s.pending_reports,
             s.valid_reports, s.invalid_reports, s.duplicate_attempts,
             s.reports_last_24h, s.reports_last_30d,
             s.malicious_report_count, s.report_restriction_count,
             s.last_report_at, s.report_restricted_until, s.metadata
      FROM public.user_reporter_stats s
      WHERE s.user_id = ANY(v_reporter_ids)
      ORDER BY s.user_id ASC
    LOOP
      v_reporter_stats := v_reporter_stats || jsonb_build_object(
        'user_id', v_row.user_id,
        'total_reports', v_row.total_reports,
        'pending_reports', v_row.pending_reports,
        'valid_reports', v_row.valid_reports,
        'invalid_reports', v_row.invalid_reports,
        'duplicate_attempts', v_row.duplicate_attempts,
        'reports_last_24h', v_row.reports_last_24h,
        'reports_last_30d', v_row.reports_last_30d,
        'malicious_report_count', v_row.malicious_report_count,
        'report_restriction_count', v_row.report_restriction_count,
        'last_report_at', v_row.last_report_at,
        'report_restricted_until', v_row.report_restricted_until,
        'metadata', v_row.metadata
      );
    END LOOP;
  END IF;

  v_case_json := jsonb_build_object(
    'id', v_case.id,
    'target_type', v_case.target_type,
    'target_id', v_case.target_id,
    'target_user_id', v_case.target_user_id,
    'status', v_case.status,
    'priority', v_case.priority,
    'outcome', v_case.outcome,
    'primary_reason_category', v_case.primary_reason_category,
    'report_count', v_case.report_count,
    'first_reported_at', v_case.first_reported_at,
    'last_reported_at', v_case.last_reported_at,
    'created_at', v_case.created_at,
    'assigned_admin_id', v_case.assigned_admin_id,
    'assigned_admin_nickname', v_assigned_nickname,
    'resolved_by', v_case.resolved_by,
    'resolved_by_nickname', v_resolved_nickname,
    'resolved_at', v_case.resolved_at,
    'metadata', v_case.metadata,
    'auto_review_risk', v_case.auto_review_risk,
    'risk_score', v_case.risk_score,
    'suspicious_report', v_case.suspicious_report,
    'low_quality_queue', v_case.low_quality_queue,
    'hidden_for_review', v_case.hidden_for_review,
    'review_basis', v_case.review_basis
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'case_id', p_case_id,
    'case', v_case_json,
    'snapshot', CASE
      WHEN v_snapshot.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', v_snapshot.id,
        'target_type', v_snapshot.target_type,
        'target_id', v_snapshot.target_id,
        'author_id', v_snapshot.author_id,
        'post_id', v_snapshot.post_id,
        'object_snapshot', v_snapshot.object_snapshot,
        'context_snapshot', v_snapshot.context_snapshot,
        'captured_at', v_snapshot.captured_at
      )
    END,
    'reports', v_reports,
    'reporter_stats', v_reporter_stats,
    'violations', v_violations,
    'restrictions', v_restrictions,
    'profile_revisions', v_profile_revisions,
    'notifications', v_notifications,
    'audit_logs', v_audit_logs
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'ok', FALSE,
    'code', 'operation_record_failed',
    'message', '读取完整操作记录失败：' || SQLERRM
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_report_operation_record_v1(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_report_operation_record_v1(UUID)
  TO authenticated, service_role;

COMMIT;
