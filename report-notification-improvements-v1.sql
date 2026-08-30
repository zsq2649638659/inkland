-- ============================================================
-- 飞书补全 4.10：被举报用户通知模板补全（幂等增量迁移）
-- 1. 删除内容通知：补充删除对象、规则/原因、已采取措施、下一步
-- 2. 暂停/封禁通知：补充影响范围、恢复/不可撤销说明、下一步
-- 幂等：CREATE OR REPLACE FUNCTION，可重复执行。
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

    -- 第二级：处理结果进入统计后，自动重评该举报者并同步其余待处理案件
    PERFORM public.sync_reporter_low_quality(v_reporter_id);

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
CREATE OR REPLACE FUNCTION public.admin_resolve_user_report_case(
  p_case_id UUID,
  p_action TEXT,
  p_reason TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_options JSONB DEFAULT '{}'::jsonb
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
  profile_record public.profiles%ROWTYPE;
  report_row RECORD;
  report_ids UUID[] := '{}';
  reporter_ids UUID[] := '{}';
  reporter_id UUID;
  outcome TEXT;
  now_ts TIMESTAMPTZ := NOW();
  v_reason TEXT;
  v_note TEXT;
  v_options JSONB;
  v_issue_type TEXT;
  v_issue_label TEXT;
  v_hide_profile BOOLEAN := TRUE;
  v_request_id UUID;
  v_notify TEXT;
  v_template_key TEXT;
  v_reporter_notify TEXT;
  v_reporter_object TEXT;
  v_reporter_reason TEXT;
  v_hidden_fields JSONB := '[]'::jsonb;
  v_old_profile JSONB;
  v_content_target_type TEXT;
  v_content_target_id UUID;
  v_content_action TEXT;
  v_owner_id UUID;
  v_content_title TEXT;
  v_content_snippet TEXT;
  v_enforce_result JSONB;
  v_restriction_types TEXT[] := '{}';
  v_restriction_type TEXT;
  v_restriction_label TEXT;
  v_restriction_labels TEXT[] := '{}';
  v_starts_at TIMESTAMPTZ;
  v_ends_at TIMESTAMPTZ;
  v_immediate BOOLEAN := TRUE;
  v_count_violation BOOLEAN := TRUE;
  v_hide_content BOOLEAN := FALSE;
  v_category TEXT;
  v_severity TEXT;
  v_restriction_id UUID;
  v_cur_status TEXT;
  v_notify_date TEXT;
  v_violation_summary TEXT;
BEGIN
  admin_id := auth.uid();
  IF admin_id IS NULL OR NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'not_admin', 'message', '需要管理员权限。');
  END IF;
  IF p_case_id IS NULL OR p_action IS NULL
     OR p_action NOT IN ('no_violation', 'convert_content', 'profile_revision', 'warn', 'restrict', 'suspend', 'ban') THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'invalid_params', 'message', '处理参数无效。');
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
    RETURN jsonb_build_object('ok', FALSE, 'code', 'already_resolved', 'message', '该举报案件已处理。');
  END IF;
  IF case_record.target_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'user_missing', 'message', '该账号已不存在，无法执行账号处理。');
  END IF;

  SELECT * INTO profile_record
  FROM public.profiles WHERE id = case_record.target_user_id;
  IF profile_record.id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'user_missing', 'message', '该账号已不存在，无法执行账号处理。');
  END IF;

  SELECT * INTO snapshot_record
  FROM public.moderation_report_snapshots
  WHERE case_id = p_case_id LIMIT 1;

  v_reason := btrim(COALESCE(p_reason, ''));
  v_note := btrim(COALESCE(p_note, ''));
  v_options := COALESCE(p_options, '{}'::jsonb);
  outcome := CASE p_action
    WHEN 'no_violation' THEN 'no_violation'
    WHEN 'convert_content' THEN 'content_case'
    WHEN 'profile_revision' THEN 'profile_changes'
    WHEN 'warn' THEN 'warned'
    WHEN 'restrict' THEN 'restricted'
    WHEN 'suspend' THEN 'suspended'
    ELSE 'banned' END;

  -- 校验动作参数
  IF p_action = 'profile_revision' THEN
    v_issue_type := btrim(COALESCE(v_options->>'issue_type', ''));
    IF v_issue_type NOT IN ('avatar', 'nickname', 'bio', 'external_link') THEN
      RETURN jsonb_build_object('ok', FALSE, 'code', 'invalid_issue', 'message', '请选择需要修改的资料位置。');
    END IF;
    v_issue_label := CASE v_issue_type
      WHEN 'avatar' THEN '头像'
      WHEN 'nickname' THEN '昵称'
      WHEN 'bio' THEN '个人简介'
      ELSE '外部链接' END;
    v_hide_profile := COALESCE((v_options->>'hide_profile')::BOOLEAN, TRUE);
    IF v_reason = '' THEN v_reason := '包含不适宜内容'; END IF;
  ELSIF p_action = 'convert_content' THEN
    v_content_target_type := btrim(COALESCE(v_options->>'target_type', ''));
    v_content_target_id := NULLIF(btrim(COALESCE(v_options->>'target_id', '')), '')::UUID;
    v_content_action := btrim(COALESCE(v_options->>'content_action', ''));
    IF v_content_target_type NOT IN ('post', 'comment')
       OR v_content_action NOT IN ('keep', 'remind', 'delete')
       OR v_content_target_id IS NULL THEN
      RETURN jsonb_build_object('ok', FALSE, 'code', 'invalid_content', 'message', '请选择具体违规内容及处理方式。');
    END IF;
    IF v_content_target_type = 'comment' THEN
      SELECT user_id, content INTO v_owner_id, v_content_snippet
      FROM public.comments WHERE id = v_content_target_id;
      v_content_title := COALESCE((
        SELECT p.title FROM public.posts p
        JOIN public.comments c ON c.post_id = p.id
        WHERE c.id = v_content_target_id
      ), '');
    ELSE
      SELECT user_id, title, content INTO v_owner_id, v_content_title, v_content_snippet
      FROM public.posts WHERE id = v_content_target_id;
    END IF;
    IF v_owner_id IS NULL OR v_owner_id <> case_record.target_user_id THEN
      RETURN jsonb_build_object('ok', FALSE, 'code', 'invalid_content', 'message', '所选内容不属于被举报用户。');
    END IF;
  ELSIF p_action = 'restrict' THEN
    SELECT COALESCE(array_agg(value), '{}'::TEXT[])
    INTO v_restriction_types
    FROM jsonb_array_elements_text(v_options->'restriction_types') AS t(value);
    IF COALESCE(array_length(v_restriction_types, 1), 0) = 0
       OR EXISTS (
         SELECT 1 FROM unnest(v_restriction_types) AS t(value)
         WHERE value NOT IN ('profile_edit', 'report', 'interact')
       ) THEN
      RETURN jsonb_build_object('ok', FALSE, 'code', 'invalid_restrict', 'message', '请选择要限制的功能。');
    END IF;
    v_immediate := COALESCE((v_options->>'immediate')::BOOLEAN, TRUE);
    v_starts_at := CASE WHEN v_immediate THEN now_ts
      ELSE COALESCE(NULLIF(v_options->>'starts_at', '')::TIMESTAMPTZ, now_ts) END;
    v_ends_at := NULLIF(v_options->>'ends_at', '')::TIMESTAMPTZ;
    IF v_ends_at IS NULL OR v_ends_at <= v_starts_at THEN
      RETURN jsonb_build_object('ok', FALSE, 'code', 'missing_ends_at', 'message', '请选择晚于开始时间的结束时间。');
    END IF;
    IF v_reason = '' THEN
      RETURN jsonb_build_object('ok', FALSE, 'code', 'missing_reason', 'message', '请填写限制原因。');
    END IF;
    v_count_violation := COALESCE((v_options->>'count_violation')::BOOLEAN, TRUE);
  ELSIF p_action IN ('warn', 'suspend', 'ban') THEN
    IF v_reason = '' THEN
      RETURN jsonb_build_object('ok', FALSE, 'code', 'missing_reason', 'message', '请填写处罚原因。');
    END IF;
    v_count_violation := COALESCE((v_options->>'count_violation')::BOOLEAN, TRUE);
    v_hide_content := COALESCE((v_options->>'hide_content')::BOOLEAN, FALSE);
    IF p_action = 'suspend' THEN
      v_ends_at := NULLIF(v_options->>'ends_at', '')::TIMESTAMPTZ;
      IF v_ends_at IS NULL OR v_ends_at <= now_ts THEN
        RETURN jsonb_build_object('ok', FALSE, 'code', 'missing_ends_at', 'message', '请选择晚于当前时间的结束时间。');
      END IF;
    ELSIF p_action = 'ban' AND NULLIF(v_options->>'ends_at', '') IS NOT NULL THEN
      RETURN jsonb_build_object('ok', FALSE, 'code', 'ban_no_ends', 'message', '永久封禁不需要结束时间。');
    END IF;
  END IF;

  -- 先执行实际措施，全部成功后再结案（失败时整段回滚，保留管理员选择）
  IF p_action = 'convert_content' THEN
    IF v_content_target_type = 'comment' THEN
      IF v_content_action = 'delete' THEN
        DELETE FROM public.comments WHERE id = v_content_target_id;
      END IF;
    ELSIF v_content_action = 'delete' THEN
      DELETE FROM public.posts WHERE id = v_content_target_id;
    END IF;

    IF v_content_action = 'remind' THEN
      INSERT INTO public.notifications (
        user_id, type, actor_id, post_id, content, read, created_at,
        template_key, related_entity_type, related_entity_id, metadata,
        delivery_status, sent_at
      ) VALUES (
        v_owner_id, 'system', NULL, NULL,
        CASE WHEN v_content_target_type = 'comment'
          THEN '你的评论收到文明提醒：请友善交流，避免使用攻击、骚扰或威胁性语言。'
          ELSE '你的作品收到文明提醒：请检查作品内容，如涉及社区规则要求调整，请及时修改。' END,
        FALSE, now_ts, 'content_civility_reminder', v_content_target_type, v_content_target_id,
        jsonb_build_object('case_id', p_case_id), 'sent', now_ts
      );
    ELSIF v_content_action = 'delete' THEN
      INSERT INTO public.notifications (
        user_id, type, actor_id, post_id, content, read, created_at,
        template_key, related_entity_type, related_entity_id, metadata,
        delivery_status, sent_at
      ) VALUES (
        v_owner_id, 'system', NULL, NULL,
        CASE WHEN v_content_target_type = 'comment'
          THEN '内容已被删除' || E'\n'
            || '删除对象：你发布在《' || COALESCE(v_content_title, '某作品') || '》下的评论' || E'\n'
          ELSE '内容已被删除' || E'\n'
            || '删除对象：你的作品《' || COALESCE(v_content_title, '未命名作品') || '》' || E'\n' END
          || '删除原因：违反社区规范（' || COALESCE(NULLIF(btrim(COALESCE(case_record.primary_reason_category, '')), ''), '其他违规') || '）' || E'\n'
          || '已采取措施：该内容已被删除，不再公开展示。' || E'\n'
          || '下一步：如需提交复核，可通过设置页反馈或联系客服邮箱联系我们。',
        FALSE, now_ts,
        CASE WHEN v_content_target_type = 'comment' THEN 'comment_deleted' ELSE 'post_deleted' END,
        v_content_target_type, v_content_target_id,
        jsonb_build_object('case_id', p_case_id, 'title', v_content_title),
        'sent', now_ts
      );
      INSERT INTO public.user_violations (
        user_id, source_type, source_id, content_type, content_id,
        category, severity, summary, confirmed_by, confirmed_at, metadata
      ) VALUES (
        v_owner_id, 'report_case', p_case_id, v_content_target_type, v_content_target_id,
        COALESCE(case_record.primary_reason_category, '其他违规'), 'standard',
        CASE WHEN v_content_target_type = 'comment'
          THEN '用户举报转为内容案件后删除评论：' || left(COALESCE(v_content_snippet, ''), 120)
          ELSE '用户举报转为内容案件后删除作品：' || COALESCE(v_content_title, '') END,
        admin_id, now_ts,
        jsonb_build_object('action', 'delete', 'case_id', p_case_id, 'note', v_note)
      );
    END IF;

  ELSIF p_action = 'profile_revision' THEN
    v_old_profile := jsonb_build_object(
      'nickname', profile_record.nickname,
      'avatar_url', profile_record.avatar_url,
      'bio', profile_record.bio,
      'external_link', profile_record.external_link,
      'hidden_profile_fields', profile_record.hidden_profile_fields
    );
    IF v_hide_profile THEN
      IF jsonb_typeof(profile_record.hidden_profile_fields) = 'array' THEN
        SELECT COALESCE(jsonb_agg(DISTINCT value), '[]'::jsonb) INTO v_hidden_fields
        FROM jsonb_array_elements_text(
          COALESCE(profile_record.hidden_profile_fields, '[]'::jsonb) || jsonb_build_array(v_issue_type)
        ) AS t(value);
      ELSE
        v_hidden_fields := jsonb_build_array(v_issue_type);
      END IF;
    END IF;

    INSERT INTO public.profile_revision_requests (
      user_id, case_id, issue_type, issue_detail, original_profile,
      hidden_fields, status, created_by, created_at, updated_at
    ) VALUES (
      case_record.target_user_id, p_case_id, v_issue_type, v_reason, v_old_profile,
      v_hidden_fields, 'requested', admin_id, now_ts, now_ts
    ) RETURNING id INTO v_request_id;

    UPDATE public.profiles
    SET profile_revision_status = 'requested',
        profile_revision_request_id = v_request_id,
        hidden_profile_fields = v_hidden_fields,
        nickname = CASE WHEN v_hide_profile AND v_issue_type = 'nickname' THEN '待修改用户' ELSE nickname END,
        avatar_url = CASE WHEN v_hide_profile AND v_issue_type = 'avatar' THEN NULL ELSE avatar_url END,
        bio = CASE WHEN v_hide_profile AND v_issue_type = 'bio' THEN NULL ELSE bio END,
        external_link = CASE WHEN v_hide_profile AND v_issue_type = 'external_link' THEN NULL ELSE external_link END,
        updated_at = now_ts
    WHERE id = case_record.target_user_id;

    v_notify := '个人资料修改通知' || E'\n'
      || '你的账号资料中存在需要修改的内容。' || E'\n'
      || '问题位置：' || v_issue_label || E'\n'
      || '问题类型：' || v_reason || E'\n'
      || '请修改后重新提交。'
      || CASE WHEN v_hide_profile THEN '完成审核前，相关资料将暂时隐藏。' ELSE '修改完成后资料将恢复正常展示。' END;
    v_template_key := 'profile_revision_request';
    INSERT INTO public.notifications (
      user_id, type, actor_id, post_id, content, read, created_at,
      template_key, related_entity_type, related_entity_id, metadata,
      delivery_status, sent_at
    ) VALUES (
      case_record.target_user_id, 'system', NULL, NULL, v_notify, FALSE, now_ts,
      v_template_key, 'profile_revision', v_request_id,
      jsonb_build_object(
        'case_id', p_case_id,
        'issue_type', v_issue_type,
        'hide_profile', v_hide_profile
      ),
      'sent', now_ts
    );

  ELSIF p_action = 'restrict' THEN
    FOREACH v_restriction_type IN ARRAY v_restriction_types
    LOOP
      v_restriction_id := NULL;
      v_restriction_label := CASE v_restriction_type
        WHEN 'profile_edit' THEN '修改个人资料'
        WHEN 'report' THEN '提交举报'
        ELSE '与其他用户互动' END;
      v_restriction_labels := v_restriction_labels || v_restriction_label;
      UPDATE public.user_restrictions
      SET status = 'active',
          reason = v_reason,
          starts_at = v_starts_at,
          ends_at = v_ends_at,
          created_by = admin_id,
          lifted_by = NULL,
          lifted_at = NULL,
          metadata = metadata || jsonb_build_object('renewed_at', now_ts),
          updated_at = now_ts
      WHERE user_id = case_record.target_user_id
        AND restriction_type = v_restriction_type
        AND status = 'active'
      RETURNING id INTO v_restriction_id;
      IF v_restriction_id IS NULL THEN
        INSERT INTO public.user_restrictions (
          user_id, restriction_type, status, reason, starts_at, ends_at,
          created_by, metadata, created_at, updated_at
        ) VALUES (
          case_record.target_user_id, v_restriction_type, 'active', v_reason,
          v_starts_at, v_ends_at, admin_id, '{}'::jsonb, now_ts, now_ts
        ) RETURNING id INTO v_restriction_id;
      END IF;
      IF v_restriction_type = 'report' THEN
        INSERT INTO public.user_reporter_stats (user_id, report_restricted_until, updated_at)
        VALUES (case_record.target_user_id, v_ends_at, now_ts)
        ON CONFLICT (user_id) DO UPDATE
          SET report_restricted_until = EXCLUDED.report_restricted_until,
              updated_at = now_ts;
      END IF;
    END LOOP;

    SELECT moderation_status INTO v_cur_status
    FROM public.profiles WHERE id = case_record.target_user_id;
    UPDATE public.profiles
    SET moderation_status = CASE WHEN v_cur_status IN ('suspended', 'banned') THEN v_cur_status ELSE 'restricted' END,
        moderation_note = left(v_reason, 500),
        moderated_at = now_ts,
        moderated_by = admin_id
    WHERE id = case_record.target_user_id;

    IF v_count_violation THEN
      INSERT INTO public.user_violations (
        user_id, source_type, source_id, content_type, content_id,
        category, severity, summary, confirmed_by, confirmed_at, metadata
      ) VALUES (
        case_record.target_user_id, 'report_case', p_case_id, 'account', NULL,
        '限制账号功能', 'standard', v_reason, admin_id, now_ts,
        jsonb_build_object(
          'action', 'restrict',
          'restriction_types', v_restriction_types,
          'starts_at', v_starts_at,
          'ends_at', v_ends_at,
          'note', v_note
        )
      );
    END IF;

    v_notify_date := CASE WHEN v_ends_at IS NULL THEN '' ELSE '（至 ' || to_char(v_ends_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI') || '）' END;
    v_notify := '功能限制' || E'\n'
      || '你的以下功能已被限制' || v_notify_date || '：' || E'\n'
      || '- ' || array_to_string(v_restriction_labels, E'\n- ') || E'\n'
      || '原因：' || v_reason || E'\n'
      || '限制结束后相关功能会恢复。';
    INSERT INTO public.notifications (
      user_id, type, actor_id, post_id, content, read, created_at,
      template_key, related_entity_type, related_entity_id, metadata,
      delivery_status, sent_at
    ) VALUES (
      case_record.target_user_id, 'system', NULL, NULL, v_notify, FALSE, now_ts,
      'restriction_functions', 'user', case_record.target_user_id,
      jsonb_build_object(
        'case_id', p_case_id,
        'restriction_types', v_restriction_types,
        'starts_at', v_starts_at,
        'ends_at', v_ends_at,
        'reason', v_reason
      ),
      'sent', now_ts
    );

  ELSIF p_action = 'warn' THEN
    v_enforce_result := public.admin_enforce_user_restriction(
      case_record.target_user_id, 'warn', v_reason, v_count_violation,
      NULL, NULL, FALSE, v_note
    );
    IF NOT COALESCE((v_enforce_result->>'ok')::BOOLEAN, FALSE) THEN
      RETURN jsonb_build_object(
        'ok', FALSE, 'code', 'enforce_failed',
        'message', COALESCE(v_enforce_result->>'message', '账号警告发送失败，请稍后重试。')
      );
    END IF;

  ELSIF p_action = 'suspend' THEN
    v_enforce_result := public.admin_enforce_user_restriction(
      case_record.target_user_id, 'suspend', v_reason, v_count_violation,
      now_ts, v_ends_at, v_hide_content, v_note
    );
    IF NOT COALESCE((v_enforce_result->>'ok')::BOOLEAN, FALSE) THEN
      RETURN jsonb_build_object(
        'ok', FALSE, 'code', 'enforce_failed',
        'message', COALESCE(v_enforce_result->>'message', '账号暂停失败，请稍后重试。')
      );
    END IF;

  ELSIF p_action = 'ban' THEN
    v_enforce_result := public.admin_enforce_user_restriction(
      case_record.target_user_id, 'ban', v_reason, v_count_violation,
      NULL, NULL, v_hide_content, v_note
    );
    IF NOT COALESCE((v_enforce_result->>'ok')::BOOLEAN, FALSE) THEN
      RETURN jsonb_build_object(
        'ok', FALSE, 'code', 'enforce_failed',
        'message', COALESCE(v_enforce_result->>'message', '账号封禁失败，请稍后重试。')
      );
    END IF;
  END IF;

  -- 按飞书 3.4.2 固定模板组装“举报已处理”通知（用户举报）
  v_reporter_reason := COALESCE(NULLIF(btrim(COALESCE(case_record.primary_reason_category, '')), ''), '其他违规');
  v_reporter_object := '用户“' || COALESCE(NULLIF(btrim(COALESCE(snapshot_record.object_snapshot->>'nickname', '')), ''), '某用户') || '”';
  v_reporter_notify := '举报已处理' || E'\n'
    || '举报对象：' || v_reporter_object || E'\n'
    || '举报理由：' || v_reporter_reason || E'\n'
    || '我们已经收到你的举报，并将重点关注相关内容和账号。感谢你对社区秩序的维护。';

  -- 全部措施成功后结案
  UPDATE public.moderation_report_cases
  SET status = 'resolved',
      outcome = outcome,
      resolved_by = admin_id,
      resolved_at = now_ts,
      metadata = metadata || jsonb_build_object(
        'action', p_action,
        'options', v_options,
        'note', v_note,
        'resolved_at', now_ts
      ),
      updated_at = now_ts
  WHERE id = p_case_id;

  FOR report_row IN
    SELECT id, reporter_id, target_type, target_id, comment_id
    FROM (
      SELECT id, reporter_id, target_type, target_id, NULL::UUID AS comment_id
      FROM public.content_reports
      WHERE case_id = p_case_id
      UNION ALL
      SELECT id, reporter_id, 'comment', NULL::UUID, comment_id
      FROM public.comment_reports
      WHERE case_id = p_case_id
    ) reports
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
    END IF;
  END LOOP;

  FOREACH reporter_id IN ARRAY reporter_ids
  LOOP
    -- convert_content 沿用内容案件口径：保留=举报不成立，提醒/删除=举报成立
    v_count_violation := TRUE;
    IF p_action = 'convert_content' AND v_content_action = 'keep' THEN
      v_count_violation := FALSE;
    END IF;
    INSERT INTO public.user_reporter_stats (
      user_id, total_reports, pending_reports, valid_reports, invalid_reports,
      updated_at
    ) VALUES (
      reporter_id, 0, 0,
      CASE WHEN p_action = 'no_violation' OR (p_action = 'convert_content' AND v_content_action = 'keep') THEN 0 ELSE 1 END,
      CASE WHEN p_action = 'no_violation' OR (p_action = 'convert_content' AND v_content_action = 'keep') THEN 1 ELSE 0 END,
      now_ts
    )
    ON CONFLICT (user_id) DO UPDATE
      SET pending_reports = GREATEST(public.user_reporter_stats.pending_reports - 1, 0),
          valid_reports = public.user_reporter_stats.valid_reports
            + CASE WHEN p_action = 'no_violation' OR (p_action = 'convert_content' AND v_content_action = 'keep') THEN 0 ELSE 1 END,
          invalid_reports = public.user_reporter_stats.invalid_reports
            + CASE WHEN p_action = 'no_violation' OR (p_action = 'convert_content' AND v_content_action = 'keep') THEN 1 ELSE 0 END,
          updated_at = now_ts;

    INSERT INTO public.notifications (
      user_id, type, actor_id, post_id, content, read, created_at,
      template_key, related_entity_type, related_entity_id, metadata,
      delivery_status, sent_at
    ) VALUES (
      reporter_id, 'system', NULL, NULL,
      v_reporter_notify, FALSE, now_ts,
      'report_handled', 'report_case', p_case_id,
      jsonb_build_object('case_id', p_case_id, 'target_type', 'user'),
      'sent', now_ts
    );
  END LOOP;

  INSERT INTO public.admin_audit_logs (
    admin_id, action, target_type, target_id, note, created_at, metadata
  ) VALUES (
    admin_id, 'resolve_user_report_' || p_action, 'report_case', p_case_id,
    v_note, now_ts,
    jsonb_build_object(
      'action', p_action,
      'outcome', outcome,
      'target_user_id', case_record.target_user_id,
      'options', v_options,
      'reason', v_reason,
      'reporter_count', COALESCE(array_length(reporter_ids, 1), 0),
      'report_ids', report_ids
    )
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'case_id', p_case_id,
    'outcome', outcome,
    'message', CASE p_action
      WHEN 'no_violation' THEN '举报不成立，案件已结案。'
      WHEN 'convert_content' THEN '已转为具体内容案件处理。'
      WHEN 'profile_revision' THEN '资料整改通知已发送。'
      WHEN 'warn' THEN '账号警告已发送。'
      WHEN 'restrict' THEN '功能限制已生效。'
      WHEN 'suspend' THEN '账号已暂停。'
      ELSE '账号已永久封禁。' END
  );
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'ok', FALSE, 'code', 'resolve_failed',
      'message', '用户举报处理失败：' || SQLERRM
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_resolve_user_report_case(UUID, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_resolve_user_report_case(UUID, TEXT, TEXT, TEXT, JSONB)
  TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.admin_enforce_user_restriction(
  p_user_id UUID,
  p_action TEXT,
  p_reason TEXT DEFAULT NULL,
  p_count_violation BOOLEAN DEFAULT TRUE,
  p_starts_at TIMESTAMPTZ DEFAULT NULL,
  p_ends_at TIMESTAMPTZ DEFAULT NULL,
  p_hide_content BOOLEAN DEFAULT FALSE,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_id UUID;
  now_ts TIMESTAMPTZ := NOW();
  v_reason TEXT;
  v_starts_at TIMESTAMPTZ;
  v_type TEXT;
  v_category TEXT;
  v_severity TEXT;
  v_restriction_id UUID;
  v_cur_status TEXT;
  v_hidden_ids UUID[] := '{}';
  v_notify TEXT;
  v_template_key TEXT;
  v_date_label TEXT;
BEGIN
  admin_id := auth.uid();
  IF admin_id IS NULL OR NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'not_admin', 'message', '需要管理员权限。');
  END IF;
  IF p_user_id IS NULL OR p_action IS NULL
     OR p_action NOT IN ('warn', 'restrict_comment', 'restrict_publish', 'restrict_report', 'suspend', 'ban') THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'invalid_params', 'message', '处罚参数无效。');
  END IF;
  v_reason := btrim(COALESCE(p_reason, ''));
  IF v_reason = '' THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'missing_reason', 'message', '请填写处罚原因。');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'user_missing', 'message', '没有找到该用户。');
  END IF;

  v_starts_at := COALESCE(p_starts_at, now_ts);
  v_type := CASE p_action
    WHEN 'restrict_comment' THEN 'comment'
    WHEN 'restrict_publish' THEN 'publish'
    WHEN 'restrict_report' THEN 'report'
    WHEN 'suspend' THEN 'account'
    WHEN 'ban' THEN 'account'
    ELSE NULL END;
  v_category := CASE p_action
    WHEN 'warn' THEN '账号警告'
    WHEN 'restrict_comment' THEN '限制评论'
    WHEN 'restrict_publish' THEN '限制发布'
    WHEN 'restrict_report' THEN '限制举报'
    WHEN 'suspend' THEN '账号暂停'
    WHEN 'ban' THEN '账号封禁' END;
  v_severity := CASE p_action
    WHEN 'warn' THEN 'minor'
    WHEN 'restrict_comment' THEN 'standard'
    WHEN 'restrict_publish' THEN 'standard'
    WHEN 'restrict_report' THEN 'standard'
    WHEN 'suspend' THEN 'serious'
    WHEN 'ban' THEN 'critical' END;

  -- 除警告与永久封禁外，必须给出结束时间
  IF p_action IN ('restrict_comment', 'restrict_publish', 'restrict_report', 'suspend') THEN
    IF p_ends_at IS NULL OR p_ends_at <= v_starts_at THEN
      RETURN jsonb_build_object('ok', FALSE, 'code', 'missing_ends_at', 'message', '请选择晚于开始时间的结束时间。');
    END IF;
  ELSIF p_action = 'ban' THEN
    IF p_ends_at IS NOT NULL THEN
      RETURN jsonb_build_object('ok', FALSE, 'code', 'ban_no_ends', 'message', '永久封禁不需要结束时间。');
    END IF;
  END IF;

  SELECT moderation_status INTO v_cur_status FROM public.profiles WHERE id = p_user_id;

  -- 同类型已有有效限制时直接更新，避免重复堆积
  IF v_type IS NOT NULL THEN
    UPDATE public.user_restrictions
    SET status = 'active',
        reason = v_reason,
        starts_at = v_starts_at,
        ends_at = p_ends_at,
        created_by = admin_id,
        lifted_by = NULL,
        lifted_at = NULL,
        metadata = metadata || jsonb_build_object('renewed_at', now_ts, 'previous_ends_at', ends_at),
        updated_at = now_ts
    WHERE user_id = p_user_id AND restriction_type = v_type AND status = 'active'
    RETURNING id INTO v_restriction_id;
    IF v_restriction_id IS NULL THEN
      INSERT INTO public.user_restrictions (
        user_id, restriction_type, status, reason, starts_at, ends_at,
        created_by, metadata, created_at, updated_at
      ) VALUES (
        p_user_id, v_type, 'active', v_reason, v_starts_at, p_ends_at,
        admin_id, '{}'::jsonb, now_ts, now_ts
      ) RETURNING id INTO v_restriction_id;
    END IF;
  END IF;

  -- 暂停/封禁时可按管理员决定隐藏已发布内容（不删除）
  IF p_hide_content AND p_action IN ('suspend', 'ban') THEN
    SELECT COALESCE(array_agg(id), '{}'::UUID[]) INTO v_hidden_ids
    FROM public.posts WHERE user_id = p_user_id AND status = 'published';
    UPDATE public.posts SET status = 'hidden' WHERE user_id = p_user_id AND status = 'published';
  END IF;
  IF v_restriction_id IS NOT NULL AND array_length(v_hidden_ids, 1) > 0 THEN
    UPDATE public.user_restrictions
    SET metadata = metadata || jsonb_build_object(
      'hidden_post_ids', (SELECT jsonb_agg(hid) FROM unnest(v_hidden_ids) AS hid)
    )
    WHERE id = v_restriction_id;
  END IF;

  -- 计入确认违规时写入 user_violations（与“收到举报”彻底分离）
  IF COALESCE(p_count_violation, TRUE) THEN
    INSERT INTO public.user_violations (
      user_id, source_type, source_id, content_type, content_id,
      category, severity, summary, confirmed_by, confirmed_at, metadata
    ) VALUES (
      p_user_id, 'manual', v_restriction_id, 'account', NULL,
      v_category, v_severity, v_reason, admin_id, now_ts,
      jsonb_build_object(
        'action', p_action,
        'restriction_type', v_type,
        'restriction_id', v_restriction_id,
        'starts_at', v_starts_at,
        'ends_at', p_ends_at,
        'hide_content', p_hide_content,
        'note', btrim(COALESCE(p_note, ''))
      )
    );
  END IF;

  -- 账号状态：警告/功能限制不降级暂停或封禁
  UPDATE public.profiles
  SET moderation_status = CASE p_action
        WHEN 'warn' THEN CASE WHEN v_cur_status IN ('suspended', 'banned') THEN v_cur_status ELSE 'warned' END
        WHEN 'restrict_comment' THEN CASE WHEN v_cur_status IN ('suspended', 'banned') THEN v_cur_status ELSE 'restricted' END
        WHEN 'restrict_publish' THEN CASE WHEN v_cur_status IN ('suspended', 'banned') THEN v_cur_status ELSE 'restricted' END
        WHEN 'restrict_report' THEN CASE WHEN v_cur_status IN ('suspended', 'banned') THEN v_cur_status ELSE 'restricted' END
        WHEN 'suspend' THEN 'suspended'
        WHEN 'ban' THEN 'banned'
      END,
      moderation_note = left(v_reason, 500),
      moderated_at = now_ts,
      moderated_by = admin_id
  WHERE id = p_user_id;

  -- 限制举报时同步写举报人统计表
  IF p_action = 'restrict_report' THEN
    INSERT INTO public.user_reporter_stats (user_id, report_restricted_until, updated_at)
    VALUES (p_user_id, p_ends_at, now_ts)
    ON CONFLICT (user_id) DO UPDATE
      SET report_restricted_until = EXCLUDED.report_restricted_until,
          updated_at = now_ts;
  END IF;

  -- 固定处罚通知
  v_date_label := CASE WHEN p_ends_at IS NULL THEN '' ELSE '（至 ' || to_char(p_ends_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI') || '）' END;
  IF p_action = 'warn' THEN
    v_template_key := 'account_warning';
    v_notify := '账号警告' || E'\n' || '原因：' || v_reason || E'\n' || '请认真阅读并遵守社区规范，避免再次违规。';
  ELSIF p_action = 'restrict_comment' THEN
    v_template_key := 'restriction_comment';
    v_notify := '功能限制' || E'\n' || '你的评论功能已被限制' || v_date_label || '。' || E'\n' || '原因：' || v_reason || E'\n' || '限制结束后相关功能会恢复。';
  ELSIF p_action = 'restrict_publish' THEN
    v_template_key := 'restriction_publish';
    v_notify := '功能限制' || E'\n' || '你的发布功能已被限制' || v_date_label || '。' || E'\n' || '原因：' || v_reason || E'\n' || '限制结束后相关功能会恢复。';
  ELSIF p_action = 'restrict_report' THEN
    v_template_key := 'restriction_report';
    v_notify := '功能限制' || E'\n' || '你的举报功能已被限制' || v_date_label || '。' || E'\n' || '原因：' || v_reason || E'\n' || '限制结束后相关功能会恢复。';
  ELSIF p_action = 'suspend' THEN
    v_template_key := 'account_suspended';
    v_notify := '账号暂停' || E'\n'
      || '你的账号已被暂停' || v_date_label || '。' || E'\n'
      || '原因：' || v_reason || E'\n'
      || '影响范围：暂停期间无法发布或提交审核、无法创建连载与合集、无法评论或举报、无法编辑资料，也无法关注、点赞、收藏、写段评等互动。' || E'\n'
      || '恢复说明：到期后账号将自动恢复，相关功能会重新开放。' || E'\n'
      || '下一步：如需提交复核或反馈，可通过设置页反馈或联系客服邮箱联系我们。';
  ELSE
    v_template_key := 'account_banned';
    v_notify := '账号封禁' || E'\n'
      || '你的账号已被永久封禁。' || E'\n'
      || '原因：' || v_reason || E'\n'
      || '影响范围：账号无法发布或提交审核、无法创建连载与合集、无法评论或举报、无法编辑资料，也无法关注、点赞、收藏、写段评等互动。' || E'\n'
      || '恢复说明：该处罚不可撤销，账号将保持封禁状态。' || E'\n'
      || '下一步：如需提交反馈，可通过设置页反馈或联系客服邮箱联系我们。';
  END IF;
  INSERT INTO public.notifications (
    user_id, type, actor_id, post_id, content, read, created_at,
    template_key, related_entity_type, related_entity_id, metadata,
    delivery_status, sent_at
  ) VALUES (
    p_user_id, 'system', NULL, NULL, v_notify, FALSE, now_ts,
    v_template_key, 'user', p_user_id,
    jsonb_build_object(
      'action', p_action,
      'restriction_type', v_type,
      'restriction_id', v_restriction_id,
      'reason', v_reason,
      'starts_at', v_starts_at,
      'ends_at', p_ends_at,
      'hide_content', p_hide_content
    ),
    'sent', now_ts
  );

  INSERT INTO public.admin_audit_logs (
    admin_id, action, target_type, target_id, note, created_at, metadata
  ) VALUES (
    admin_id, 'enforce_user_' || p_action, 'user', p_user_id,
    btrim(COALESCE(p_note, v_reason)), now_ts,
    jsonb_build_object(
      'action', p_action,
      'restriction_type', v_type,
      'restriction_id', v_restriction_id,
      'reason', v_reason,
      'count_violation', COALESCE(p_count_violation, TRUE),
      'starts_at', v_starts_at,
      'ends_at', p_ends_at,
      'hide_content', p_hide_content,
      'hidden_post_count', COALESCE(array_length(v_hidden_ids, 1), 0)
    )
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'restriction_id', v_restriction_id,
    'message', CASE p_action
      WHEN 'warn' THEN '账号警告已发送。'
      WHEN 'restrict_comment' THEN '评论功能限制已生效。'
      WHEN 'restrict_publish' THEN '发布功能限制已生效。'
      WHEN 'restrict_report' THEN '举报功能限制已生效。'
      WHEN 'suspend' THEN '账号已暂停。'
      ELSE '账号已永久封禁。' END
  );
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'enforce_failed', 'message', '处罚操作执行失败：' || SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_enforce_user_restriction(UUID, TEXT, TEXT, BOOLEAN, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_enforce_user_restriction(UUID, TEXT, TEXT, BOOLEAN, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN, TEXT) TO authenticated, service_role;
