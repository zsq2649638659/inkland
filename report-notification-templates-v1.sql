-- ============================================================
-- 举报通知模板对齐飞书 3.4：report-notification-templates-v1.sql
-- 修改：
-- 1. submit_report_v1 的“举报受理中”通知改为飞书 3.4.1 固定模板：
--    评论：举报受理中 / 举报对象 / 举报内容 / 举报理由；
--    作品：举报受理中 / 举报对象 / 举报理由。
-- 2. admin_resolve_report_case 的“举报已处理”通知改为飞书 3.4.2 模板：
--    在 3.4.1 对应字段后追加固定收尾句。
-- 幂等：CREATE OR REPLACE，可重复执行。
-- ============================================================

CREATE OR REPLACE FUNCTION public.submit_report_v1(
  p_target_type TEXT,
  p_target_id UUID,
  p_reason_category TEXT,
  p_details TEXT DEFAULT NULL,
  p_evidence JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reporter_id UUID;
  v_target_user_id UUID;
  post_record public.posts%ROWTYPE;
  comment_record public.comments%ROWTYPE;
  profile_record public.profiles%ROWTYPE;
  v_case_id UUID;
  active_case public.moderation_report_cases%ROWTYPE;
  v_object_snapshot JSONB;
  v_context_snapshot JSONB;
  v_object_label TEXT;
  v_content_snippet TEXT;
  v_notify_content TEXT;
  now_ts TIMESTAMPTZ := NOW();
BEGIN
  v_reporter_id := auth.uid();
  IF v_reporter_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'not_logged_in', 'message', '请先登录后再举报。');
  END IF;
  IF p_target_type IS NULL OR p_target_id IS NULL
     OR p_target_type NOT IN ('post', 'comment', 'user')
     OR btrim(COALESCE(p_reason_category, '')) = '' THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'invalid_params', 'message', '举报参数不完整，请重新选择举报原因。');
  END IF;

  -- 举报功能被限制时直接拦截
  IF EXISTS (
    SELECT 1 FROM public.user_restrictions
    WHERE user_id = v_reporter_id
      AND restriction_type = 'report'
      AND status = 'active'
      AND (ends_at IS NULL OR ends_at > now_ts)
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'report_restricted', 'message', '你的举报功能暂时受限，无法提交举报。');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_reporter_stats
    WHERE user_id = v_reporter_id
      AND report_restricted_until IS NOT NULL
      AND report_restricted_until > now_ts
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'report_restricted', 'message', '你的举报功能暂时受限，无法提交举报。');
  END IF;

  -- 不能举报自己
  IF p_target_type = 'user' THEN
    IF p_target_id = v_reporter_id THEN
      RETURN jsonb_build_object('ok', FALSE, 'code', 'self_report', 'message', '不能举报自己的账号。');
    END IF;
    SELECT * INTO profile_record FROM public.profiles WHERE id = p_target_id;
    IF profile_record.id IS NULL THEN
      RETURN jsonb_build_object('ok', FALSE, 'code', 'target_missing', 'message', '该用户不存在或已被删除。');
    END IF;
    v_target_user_id := profile_record.id;
    v_object_snapshot := jsonb_build_object(
      'nickname', profile_record.nickname,
      'avatar_url', profile_record.avatar_url,
      'bio', profile_record.bio,
      'moderation_status', profile_record.moderation_status,
      'created_at', profile_record.created_at
    );
    v_context_snapshot := '{}'::jsonb;
  ELSIF p_target_type = 'post' THEN
    SELECT * INTO post_record FROM public.posts WHERE id = p_target_id;
    IF post_record.id IS NULL THEN
      RETURN jsonb_build_object('ok', FALSE, 'code', 'target_missing', 'message', '该作品已不存在，无法继续举报。');
    END IF;
    IF post_record.user_id = v_reporter_id THEN
      RETURN jsonb_build_object('ok', FALSE, 'code', 'self_report', 'message', '不能举报自己的作品。');
    END IF;
    IF COALESCE(post_record.status, '') <> 'published' THEN
      RETURN jsonb_build_object('ok', FALSE, 'code', 'target_unavailable', 'message', '该作品已下架，无法继续举报。');
    END IF;
    v_target_user_id := post_record.user_id;
    v_object_snapshot := jsonb_build_object(
      'title', post_record.title,
      'content', post_record.content,
      'cover_url', post_record.cover_url,
      'post_type', post_record.post_type,
      'content_rating', post_record.content_rating,
      'visibility', post_record.visibility,
      'status', post_record.status,
      'published_at', post_record.published_at,
      'created_at', post_record.created_at,
      'author_note', post_record.author_note,
      'series_name', post_record.series_name,
      'chapter_number', post_record.chapter_number
    );
    SELECT p.nickname, p.avatar_url INTO profile_record.nickname, profile_record.avatar_url
    FROM public.profiles p WHERE p.id = post_record.user_id;
    v_context_snapshot := jsonb_build_object(
      'author_id', post_record.user_id,
      'author_nickname', profile_record.nickname,
      'author_avatar_url', profile_record.avatar_url
    );
  ELSE
    SELECT * INTO comment_record FROM public.comments WHERE id = p_target_id;
    IF comment_record.id IS NULL THEN
      RETURN jsonb_build_object('ok', FALSE, 'code', 'target_missing', 'message', '该评论已不存在，无法继续举报。');
    END IF;
    IF comment_record.user_id = v_reporter_id THEN
      RETURN jsonb_build_object('ok', FALSE, 'code', 'self_report', 'message', '不能举报自己的评论。');
    END IF;
    v_target_user_id := comment_record.user_id;
    v_object_snapshot := jsonb_build_object(
      'content', comment_record.content,
      'parent_id', comment_record.parent_id,
      'paragraph_index', comment_record.paragraph_index,
      'created_at', comment_record.created_at
    );
    v_context_snapshot := jsonb_build_object(
      'post_id', comment_record.post_id,
      'post_title', COALESCE(
        (SELECT p.title FROM public.posts p WHERE p.id = comment_record.post_id),
        ''
      ),
      'post_author_id', COALESCE(
        (SELECT p.user_id FROM public.posts p WHERE p.id = comment_record.post_id),
        NULL
      )
    );
    SELECT p.nickname, p.avatar_url INTO profile_record.nickname, profile_record.avatar_url
    FROM public.profiles p WHERE p.id = comment_record.user_id;
    v_context_snapshot := v_context_snapshot || jsonb_build_object(
      'comment_author_id', comment_record.user_id,
      'comment_author_nickname', profile_record.nickname,
      'comment_author_avatar_url', profile_record.avatar_url
    );
  END IF;

  -- 同一举报人同一对象已有待处理举报
  IF p_target_type = 'comment' THEN
    IF EXISTS (
      SELECT 1 FROM public.comment_reports cr
      WHERE cr.reporter_id = v_reporter_id AND cr.comment_id = p_target_id
        AND cr.status IN ('pending', 'reviewing')
    ) THEN
      UPDATE public.user_reporter_stats
      SET duplicate_attempts = duplicate_attempts + 1, updated_at = now_ts
      WHERE user_id = v_reporter_id;
      RETURN jsonb_build_object('ok', FALSE, 'code', 'duplicate', 'message', '你已举报过该内容，平台正在处理中，请勿重复举报。');
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.content_reports cr
      WHERE cr.reporter_id = v_reporter_id
        AND cr.target_type = p_target_type
        AND cr.target_id = p_target_id
        AND cr.status IN ('pending', 'reviewing')
    ) THEN
      UPDATE public.user_reporter_stats
      SET duplicate_attempts = duplicate_attempts + 1, updated_at = now_ts
      WHERE user_id = v_reporter_id;
      RETURN jsonb_build_object('ok', FALSE, 'code', 'duplicate', 'message', '你已举报过该内容，平台正在处理中，请勿重复举报。');
    END IF;
  END IF;

  -- 每日举报次数上限（第一版固定 20 次/天，后台可在 user_reporter_stats 调整）
  IF EXISTS (
    SELECT 1 FROM public.user_reporter_stats
    WHERE user_id = v_reporter_id
      AND reports_last_24h >= 20
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'rate_limited', 'message', '你今天提交的举报数量已达上限，请明天再试。');
  END IF;

  SELECT * INTO active_case
  FROM public.moderation_report_cases
  WHERE target_type = p_target_type AND target_id = p_target_id
    AND status IN ('pending', 'reviewing')
  ORDER BY created_at DESC
  LIMIT 1;

  IF active_case.id IS NULL THEN
    INSERT INTO public.moderation_report_cases (
      target_type, target_id, target_user_id, status, priority,
      primary_reason_category, report_count, first_reported_at, last_reported_at,
      metadata
    ) VALUES (
      p_target_type, p_target_id, v_target_user_id, 'pending', 'normal',
      btrim(p_reason_category), 1, now_ts, now_ts,
      jsonb_build_object('first_reason_category', btrim(p_reason_category))
    ) RETURNING id INTO v_case_id;
  ELSE
    v_case_id := active_case.id;
    UPDATE public.moderation_report_cases
    SET report_count = report_count + 1,
        last_reported_at = now_ts,
        primary_reason_category = COALESCE(primary_reason_category, btrim(p_reason_category)),
        metadata = metadata || jsonb_build_object(
          'last_reason_category', btrim(p_reason_category),
          'last_details', btrim(COALESCE(p_details, ''))
        ),
        updated_at = now_ts
    WHERE id = v_case_id;
  END IF;

  IF p_target_type = 'comment' THEN
    INSERT INTO public.comment_reports (
      comment_id, reporter_id, reason, reason_category, details, evidence,
      case_id, status, created_at
    ) VALUES (
      p_target_id, v_reporter_id, btrim(p_reason_category),
      btrim(p_reason_category), btrim(COALESCE(p_details, '')), COALESCE(p_evidence, '{}'::jsonb),
      v_case_id, 'pending', now_ts
    );
  ELSE
    INSERT INTO public.content_reports (
      target_type, target_id, reporter_id, reason, reason_category, details, evidence,
      case_id, status, created_at
    ) VALUES (
      p_target_type, p_target_id, v_reporter_id, btrim(p_reason_category),
      btrim(p_reason_category), btrim(COALESCE(p_details, '')), COALESCE(p_evidence, '{}'::jsonb),
      v_case_id, 'pending', now_ts
    );
  END IF;

  INSERT INTO public.moderation_report_snapshots (
    case_id, target_type, target_id, author_id, post_id, object_snapshot, context_snapshot, captured_at
  ) VALUES (
    v_case_id, p_target_type, p_target_id,
    CASE WHEN p_target_type = 'comment' THEN comment_record.user_id
         WHEN p_target_type = 'post' THEN post_record.user_id
         ELSE profile_record.id END,
    CASE WHEN p_target_type = 'comment' THEN comment_record.post_id
         WHEN p_target_type = 'post' THEN post_record.id
         ELSE NULL END,
    v_object_snapshot, v_context_snapshot, now_ts
  )
  ON CONFLICT (case_id) DO UPDATE
    SET object_snapshot = EXCLUDED.object_snapshot,
        context_snapshot = EXCLUDED.context_snapshot,
        captured_at = now_ts;

  -- 按飞书 3.4.1 固定模板组装“举报受理中”通知
  IF p_target_type = 'comment' THEN
    v_object_label := COALESCE(NULLIF(btrim(COALESCE(v_context_snapshot->>'comment_author_nickname', '')), ''), '某用户')
      || '在《' || COALESCE(NULLIF(btrim(COALESCE(v_context_snapshot->>'post_title', '')), ''), '某作品') || '》下发布的评论';
    v_content_snippet := CASE
      WHEN btrim(COALESCE(v_object_snapshot->>'content', '')) = '' THEN ''
      ELSE left(COALESCE(v_object_snapshot->>'content', ''), 80) || '……'
    END;
    v_notify_content := '举报受理中' || E'\n'
      || '举报对象：' || v_object_label || E'\n'
      || '举报内容：' || v_content_snippet || E'\n'
      || '举报理由：' || btrim(p_reason_category);
  ELSIF p_target_type = 'post' THEN
    v_object_label := COALESCE(NULLIF(btrim(COALESCE(v_context_snapshot->>'author_nickname', '')), ''), '某用户')
      || '发布的《' || COALESCE(NULLIF(btrim(COALESCE(v_object_snapshot->>'title', '')), ''), '某作品') || '》';
    v_notify_content := '举报受理中' || E'\n'
      || '举报对象：' || v_object_label || E'\n'
      || '举报理由：' || btrim(p_reason_category);
  ELSE
    v_object_label := '用户“' || COALESCE(NULLIF(btrim(COALESCE(v_object_snapshot->>'nickname', '')), ''), '某用户') || '”';
    v_notify_content := '举报受理中' || E'\n'
      || '举报对象：' || v_object_label || E'\n'
      || '举报理由：' || btrim(p_reason_category);
  END IF;

  INSERT INTO public.notifications (
    user_id, type, actor_id, post_id, content, read, created_at,
    template_key, related_entity_type, related_entity_id, metadata,
    delivery_status, sent_at
  ) VALUES (
    v_reporter_id, 'system', NULL, NULL,
    v_notify_content, FALSE, now_ts,
    'report_received', p_target_type, p_target_id,
    jsonb_build_object('case_id', v_case_id, 'target_type', p_target_type, 'target_id', p_target_id),
    'sent', now_ts
  );

  INSERT INTO public.user_reporter_stats (
    user_id, total_reports, pending_reports, reports_last_24h,
    last_report_at, updated_at
  ) VALUES (
    v_reporter_id, 1, 1, 1, now_ts, now_ts
  )
  ON CONFLICT (user_id) DO UPDATE
    SET total_reports = public.user_reporter_stats.total_reports + 1,
        pending_reports = public.user_reporter_stats.pending_reports + 1,
        reports_last_24h = CASE
          WHEN public.user_reporter_stats.last_report_at IS NOT NULL
            AND public.user_reporter_stats.last_report_at > now_ts - interval '24 hours'
          THEN public.user_reporter_stats.reports_last_24h + 1
          ELSE 1 END,
        last_report_at = now_ts,
        updated_at = now_ts;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'case_id', v_case_id,
    'message', '举报已提交，我们会尽快处理。'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'ok', FALSE,
    'code', 'db_error',
    'message', '举报提交失败，请稍后重试。',
    'debug_error', SQLERRM
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_report_v1(TEXT, UUID, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_report_v1(TEXT, UUID, TEXT, TEXT, JSONB)
  TO authenticated, service_role;

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
  v_reason_label := COALESCE(NULLIF(btrim(COALESCE(case_record.primary_reason_category, '')), ''), '其他问题');
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
        CASE WHEN case_record.target_type = 'comment'
          THEN '你的一条评论因违反社区规则已被删除。'
          ELSE '你的作品因违反社区规则已被删除。' END,
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
        COALESCE(case_record.primary_reason_category, '其他问题'), 'standard',
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
