-- 举报提交修复 report-fix-v1.sql
-- 修复问题：
-- 1. submit_report_v1 中 reporter_id 局部变量与表列同名导致 42702 歧义错误；
-- 2. 作品“可举报”条件过严，visibility 非 public 会被误判为已下架；
-- 3. 旧版触发器与新函数双写 user_report_stats / notifications。

-- 1. 移除旧版举报触发器，避免与新函数重复累计/重复发通知。
DROP TRIGGER IF EXISTS content_reports_record_user_stat ON public.content_reports;
DROP TRIGGER IF EXISTS comment_reports_record_user_stat ON public.comment_reports;
DROP TRIGGER IF EXISTS content_reports_ack_notification ON public.content_reports;
DROP TRIGGER IF EXISTS comment_reports_ack_notification ON public.comment_reports;

-- 2. 重定义统一举报提交函数。
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

  INSERT INTO public.notifications (
    user_id, type, actor_id, post_id, content, read, created_at,
    template_key, related_entity_type, related_entity_id, metadata,
    delivery_status, sent_at
  ) VALUES (
    v_reporter_id, 'system', NULL, NULL,
    '你的举报已受理，平台正在处理中。', FALSE, now_ts,
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
