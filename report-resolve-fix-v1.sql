-- ============================================================
-- 修复后台处理举报案件失败：admin_resolve_report_case 变量歧义
-- 根因：局部变量 outcome 与 moderation_report_cases.outcome 列同名，
--       执行 UPDATE 时报 42702: column reference "outcome" is ambiguous。
-- 处理：局部变量统一改名为 v_outcome，避免与表列冲突。
-- 幂等：CREATE OR REPLACE，可重复执行。
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_resolve_report_case(
  p_case_id UUID,
  p_action TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_id UUID;
  case_record public.moderation_report_cases%ROWTYPE;
  snapshot_record public.moderation_report_snapshots%ROWTYPE;
  report_row RECORD;
  target_owner_id UUID;
  target_title TEXT;
  target_content TEXT;
  v_object_label TEXT;
  v_content_snippet TEXT;
  v_notify_content TEXT;
  v_reason_label TEXT;
  v_outcome TEXT;
  now_ts TIMESTAMPTZ := NOW();
  report_ids UUID[] := '{}';
  reporter_ids UUID[] := '{}';
  reporter_count INTEGER := 0;
  v_reporter_id UUID;
BEGIN
  admin_id := auth.uid();
  IF admin_id IS NULL OR NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'not_admin', 'message', '需要管理员权限。');
  END IF;
  IF p_case_id IS NULL OR p_action IS NULL
     OR p_action NOT IN ('keep', 'remind', 'delete', 'dismiss', 'no_violation') THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'invalid_params', 'message', '处理参数无效。');
  END IF;

  SELECT * INTO case_record
  FROM public.moderation_report_cases
  WHERE id = p_case_id;
  IF case_record.id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'case_missing', 'message', '没有找到该举报案件。');
  END IF;
  IF case_record.status NOT IN ('pending', 'reviewing') THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'already_resolved', 'message', '该举报案件已处理。');
  END IF;

  SELECT * INTO snapshot_record
  FROM public.moderation_report_snapshots
  WHERE case_id = p_case_id
  LIMIT 1;

  v_outcome := CASE p_action
    WHEN 'keep' THEN 'kept'
    WHEN 'remind' THEN 'reminded'
    WHEN 'delete' THEN 'deleted'
    ELSE 'no_violation'
  END;

  target_owner_id := case_record.target_user_id;
  target_title := '';
  target_content := '';
  IF snapshot_record.id IS NOT NULL THEN
    target_owner_id := COALESCE(target_owner_id, snapshot_record.author_id);
    IF snapshot_record.target_type = 'post' THEN
      target_title := COALESCE(snapshot_record.object_snapshot->>'title', '');
      target_content := COALESCE(snapshot_record.object_snapshot->>'content', '');
    ELSIF snapshot_record.target_type = 'comment' THEN
      target_content := COALESCE(snapshot_record.object_snapshot->>'content', '');
      IF target_title = '' THEN
        target_title := COALESCE(snapshot_record.context_snapshot->>'post_title', '');
      END IF;
    ELSE
      target_title := COALESCE(snapshot_record.object_snapshot->>'nickname', '');
      target_content := COALESCE(snapshot_record.object_snapshot->>'bio', '');
    END IF;
  END IF;

  -- 按飞书 3.4.2 固定模板组装“举报已处理”通知
  v_reason_label := COALESCE(NULLIF(btrim(COALESCE(case_record.primary_reason_category, '')), ''), '其他违规');
  IF snapshot_record.id IS NULL THEN
    v_object_label := '未知对象';
  ELSIF snapshot_record.target_type = 'comment' THEN
    v_object_label := COALESCE(NULLIF(btrim(COALESCE(snapshot_record.context_snapshot->>'comment_author_nickname', '')), ''), '某用户')
      || '在《' || COALESCE(NULLIF(btrim(COALESCE(snapshot_record.context_snapshot->>'post_title', '')), ''), '某作品') || '》下发布的评论';
    v_content_snippet := CASE
      WHEN btrim(COALESCE(target_content, '')) = '' THEN ''
      ELSE left(COALESCE(target_content, ''), 80) || '……'
    END;
  ELSIF snapshot_record.target_type = 'post' THEN
    v_object_label := COALESCE(NULLIF(btrim(COALESCE(snapshot_record.context_snapshot->>'author_nickname', '')), ''), '某用户')
      || '发布的《' || COALESCE(NULLIF(btrim(COALESCE(target_title, '')), ''), '某作品') || '》';
  ELSE
    v_object_label := '用户“' || COALESCE(NULLIF(btrim(COALESCE(snapshot_record.object_snapshot->>'nickname', '')), ''), '某用户') || '”';
  END IF;

  IF snapshot_record.id IS NOT NULL AND snapshot_record.target_type = 'comment' THEN
    v_notify_content := '举报已处理' || E'\n'
      || '举报对象：' || v_object_label || E'\n'
      || '举报内容：' || v_content_snippet || E'\n'
      || '举报理由：' || v_reason_label || E'\n'
      || '我们已经收到你的举报，并将重点关注相关内容和账号。感谢你对社区秩序的维护。';
  ELSE
    v_notify_content := '举报已处理' || E'\n'
      || '举报对象：' || v_object_label || E'\n'
      || '举报理由：' || v_reason_label || E'\n'
      || '我们已经收到你的举报，并将重点关注相关内容和账号。感谢你对社区秩序的维护。';
  END IF;

  -- 删除内容（快照仍保留，供后台查看）
  IF p_action = 'delete' AND case_record.target_type = 'comment' THEN
    DELETE FROM public.comments WHERE id = case_record.target_id;
  ELSIF p_action = 'delete' AND case_record.target_type = 'post' THEN
    DELETE FROM public.posts WHERE id = case_record.target_id;
  END IF;

  UPDATE public.moderation_report_cases
  SET status = 'resolved',
      outcome = v_outcome,
      resolved_by = admin_id,
      resolved_at = now_ts,
      metadata = metadata || jsonb_build_object(
        'action', p_action,
        'note', btrim(COALESCE(p_note, '')),
        'resolved_at', now_ts
      ),
      updated_at = now_ts
  WHERE id = p_case_id;

  FOR report_row IN
    SELECT r.id, r.reporter_id, r.target_type, r.target_id, r.comment_id
    FROM (
      SELECT id, reporter_id, target_type, target_id, NULL::UUID AS comment_id
      FROM public.content_reports
      WHERE case_id = p_case_id
      UNION ALL
      SELECT id, reporter_id, 'comment', NULL::UUID, comment_id
      FROM public.comment_reports
      WHERE case_id = p_case_id
    ) r
  LOOP
    IF report_row.target_type = 'comment' THEN
      UPDATE public.comment_reports
      SET status = 'resolved', resolved_by = admin_id, resolved_at = now_ts
      WHERE id = report_row.id;
    ELSE
      UPDATE public.content_reports
      SET status = 'resolved', resolved_by = admin_id, resolved_at = now_ts
      WHERE id = report_row.id;
    END IF;

    report_ids := report_ids || report_row.id;
    IF report_row.reporter_id IS NOT NULL
       AND NOT report_row.reporter_id = ANY(reporter_ids) THEN
      reporter_ids := reporter_ids || report_row.reporter_id;
      reporter_count := reporter_count + 1;
    END IF;
  END LOOP;

  -- 举报人统计与“举报已处理”通知
  FOREACH v_reporter_id IN ARRAY reporter_ids
  LOOP
    INSERT INTO public.user_reporter_stats (
      user_id, total_reports, pending_reports, valid_reports, invalid_reports,
      updated_at
    ) VALUES (
      v_reporter_id, 0, 0,
      CASE WHEN p_action IN ('delete', 'remind') THEN 1 ELSE 0 END,
      CASE WHEN p_action IN ('dismiss', 'no_violation') THEN 1 ELSE 0 END,
      now_ts
    )
    ON CONFLICT (user_id) DO UPDATE
      SET pending_reports = GREATEST(public.user_reporter_stats.pending_reports - 1, 0),
          valid_reports = public.user_reporter_stats.valid_reports
            + CASE WHEN p_action IN ('delete', 'remind') THEN 1 ELSE 0 END,
          invalid_reports = public.user_reporter_stats.invalid_reports
            + CASE WHEN p_action IN ('dismiss', 'no_violation') THEN 1 ELSE 0 END,
          updated_at = now_ts;

    INSERT INTO public.notifications (
      user_id, type, actor_id, post_id, content, read, created_at,
      template_key, related_entity_type, related_entity_id, metadata,
      delivery_status, sent_at
    ) VALUES (
      v_reporter_id, 'system', NULL, NULL,
      v_notify_content, FALSE, now_ts,
      'report_handled', 'report_case', p_case_id,
      jsonb_build_object('case_id', p_case_id, 'target_type', case_record.target_type),
      'sent', now_ts
    );
  END LOOP;

  -- 作者侧通知与确认违规（仅实际处理时通知作者）
  IF p_action = 'remind' AND case_record.target_type = 'comment' THEN
    INSERT INTO public.notifications (
      user_id, type, actor_id, post_id, content, read, created_at,
      template_key, related_entity_type, related_entity_id, metadata,
      delivery_status, sent_at
    ) VALUES (
      target_owner_id, 'system', NULL, NULL,
      '你的评论收到文明提醒：请友善交流，避免使用攻击、骚扰或威胁性语言。', FALSE, now_ts,
      'comment_civility_reminder', case_record.target_type, case_record.target_id,
      jsonb_build_object('case_id', p_case_id),
      'sent', now_ts
    );
  ELSIF p_action = 'delete' THEN
    IF target_owner_id IS NOT NULL THEN
      INSERT INTO public.notifications (
        user_id, type, actor_id, post_id, content, read, created_at,
        template_key, related_entity_type, related_entity_id, metadata,
        delivery_status, sent_at
      ) VALUES (
        target_owner_id, 'system', NULL, NULL,
        '内容已被删除' || E'\n'
          || '删除对象：' || v_object_label || E'\n'
          || '删除原因：违反社区规范（' || v_reason_label || '）' || E'\n'
          || '已采取措施：该内容已被删除，不再公开展示。' || E'\n'
          || '下一步：如需提交复核，可通过设置页反馈或联系客服邮箱联系我们。',
        FALSE, now_ts,
        CASE WHEN case_record.target_type = 'comment' THEN 'comment_deleted' ELSE 'post_deleted' END,
        case_record.target_type, case_record.target_id,
        jsonb_build_object('case_id', p_case_id, 'title', target_title),
        'sent', now_ts
      );
    END IF;
    IF to_regclass('public.user_violations') IS NOT NULL THEN
      INSERT INTO public.user_violations (
        user_id, source_type, source_id, content_type, content_id,
        category, severity, summary, confirmed_by, confirmed_at, metadata
      ) VALUES (
        target_owner_id, 'report_case', p_case_id,
        case_record.target_type, case_record.target_id,
        COALESCE(case_record.primary_reason_category, '其他违规'), 'standard',
        CASE WHEN case_record.target_type = 'comment'
          THEN '举报确认后删除评论：' || left(COALESCE(target_content, ''), 120)
          ELSE '举报确认后删除作品：' || COALESCE(target_title, '') END,
        admin_id, now_ts,
        jsonb_build_object('action', p_action, 'note', btrim(COALESCE(p_note, '')))
      );
    END IF;
  END IF;

  INSERT INTO public.admin_audit_logs (
    admin_id, action, target_type, target_id, note, created_at, metadata
  ) VALUES (
    admin_id,
    CASE p_action
      WHEN 'keep' THEN 'resolve_report_keep'
      WHEN 'remind' THEN 'resolve_report_remind'
      WHEN 'delete' THEN 'resolve_report_delete'
      WHEN 'dismiss' THEN 'dismiss_report_case'
      ELSE 'resolve_report_no_violation'
    END,
    'report_case', p_case_id,
    btrim(COALESCE(p_note, '')), now_ts,
    jsonb_build_object(
      'action', p_action,
      'target_type', case_record.target_type,
      'target_id', case_record.target_id,
      'reporter_count', reporter_count,
      'report_ids', report_ids
    )
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'case_id', p_case_id,
    'outcome', v_outcome,
    'message', '举报案件已处理完成。'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_resolve_report_case(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_resolve_report_case(UUID, TEXT, TEXT)
  TO authenticated, service_role;
