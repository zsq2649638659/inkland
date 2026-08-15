-- ============================================================
-- Inkland 模块 7：恶意举报基础治理
-- 文件：user-enforcement-module7-v1.sql
-- 依赖：admin-backoffice.sql、admin-moderation-v1-foundation.sql、
--       report-closure-v1.sql、report-notification-templates-v1.sql、
--       user-enforcement-module6-v1.sql
-- 说明：幂等，可重复执行。在 Supabase SQL Editor 执行后：
--   1. 每日举报上限从 app_config 读取，默认 20 次/天；
--      后台可用 admin_update_report_limit 修改；
--   2. 后台可用 admin_send_report_rule_reminder 发送举报规则提醒；
--   3. 用户详情 admin_user_detail 的 reporter_stats 增加最近举报明细。
-- 注意：本迁移重新定义 submit_report_v1，完整保留 report-notification-
--       templates-v1.sql 的飞书 3.4 通知模板，只把“每日上限”改为配置读取。
-- ============================================================

-- ------------------------------------------------------------
-- 1. 全局配置表（举报每日上限等后台可调参数）
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.app_config (
  config_key TEXT PRIMARY KEY,
  config_value TEXT NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.app_config (config_key, config_value, description)
VALUES ('daily_report_limit', '20', '每个用户每日可提交的举报数量上限')
ON CONFLICT (config_key) DO NOTHING;

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_config_admin_all ON public.app_config;
CREATE POLICY app_config_admin_all ON public.app_config
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ------------------------------------------------------------
-- 2. 后台读取 / 更新每日举报上限
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_get_report_limit()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INTEGER := 20;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'not_admin', 'message', '需要管理员权限。');
  END IF;
  SELECT LEAST(GREATEST(config_value::INTEGER, 1), 1000) INTO v_limit
  FROM public.app_config WHERE config_key = 'daily_report_limit';
  RETURN jsonb_build_object('ok', TRUE, 'daily_report_limit', v_limit);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', TRUE, 'daily_report_limit', 20);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_report_limit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_report_limit() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_update_report_limit(p_limit INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_id UUID;
  v_limit INTEGER;
BEGIN
  admin_id := auth.uid();
  IF admin_id IS NULL OR NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'not_admin', 'message', '需要管理员权限。');
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'invalid_limit', 'message', '每日举报上限需在 1 到 1000 之间。');
  END IF;
  v_limit := p_limit;
  INSERT INTO public.app_config (config_key, config_value, description, updated_by, updated_at)
  VALUES ('daily_report_limit', v_limit::TEXT, '每个用户每日可提交的举报数量上限', admin_id, NOW())
  ON CONFLICT (config_key) DO UPDATE
    SET config_value = EXCLUDED.config_value,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW();
  INSERT INTO public.admin_audit_logs (
    admin_id, action, target_type, target_id, note, created_at, metadata
  ) VALUES (
    admin_id, 'update_report_limit', 'system', NULL,
    '每日举报上限调整为 ' || v_limit || ' 次', NOW(),
    jsonb_build_object('daily_report_limit', v_limit)
  );
  RETURN jsonb_build_object('ok', TRUE, 'daily_report_limit', v_limit, 'message', '每日举报上限已更新。');
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', FALSE, 'code', 'update_failed', 'message', '更新失败：' || SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_report_limit(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_report_limit(INTEGER) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 3. 后台发送举报规则提醒（只提醒，不记违规、不限制功能）
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_send_report_rule_reminder(
  p_user_id UUID,
  p_reason TEXT DEFAULT NULL
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
  v_notify TEXT;
BEGIN
  admin_id := auth.uid();
  IF admin_id IS NULL OR NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'not_admin', 'message', '需要管理员权限。');
  END IF;
  IF p_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'user_missing', 'message', '没有找到该用户。');
  END IF;
  v_reason := btrim(COALESCE(p_reason, ''));
  IF v_reason = '' THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'missing_reason', 'message', '请填写提醒内容。');
  END IF;

  v_notify := '举报规则提醒' || E'\n'
    || v_reason || E'\n'
    || '请如实提交举报，重复、恶意或无关举报可能影响你的举报功能。';
  INSERT INTO public.notifications (
    user_id, type, actor_id, post_id, content, read, created_at,
    template_key, related_entity_type, related_entity_id, metadata,
    delivery_status, sent_at
  ) VALUES (
    p_user_id, 'system', NULL, NULL, v_notify, FALSE, now_ts,
    'report_rule_reminder', 'user', p_user_id,
    jsonb_build_object('reason', v_reason),
    'sent', now_ts
  );
  INSERT INTO public.admin_audit_logs (
    admin_id, action, target_type, target_id, note, created_at, metadata
  ) VALUES (
    admin_id, 'send_report_rule_reminder', 'user', p_user_id,
    left(v_reason, 500), now_ts,
    jsonb_build_object('reason', v_reason)
  );
  RETURN jsonb_build_object('ok', TRUE, 'message', '举报规则提醒已发送。');
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', FALSE, 'code', 'reminder_failed', 'message', '发送失败：' || SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_send_report_rule_reminder(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_send_report_rule_reminder(UUID, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 4. submit_report_v1：每日上限改为从 app_config 读取
--    其余逻辑与 report-notification-templates-v1.sql 完全一致。
-- ------------------------------------------------------------

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
  v_daily_limit INTEGER := 20;
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

  -- 每日举报次数上限（模块 7：从 app_config 读取，默认 20 次/天）
  SELECT LEAST(GREATEST(config_value::INTEGER, 1), 1000) INTO v_daily_limit
  FROM public.app_config WHERE config_key = 'daily_report_limit';
  IF EXISTS (
    SELECT 1 FROM public.user_reporter_stats
    WHERE user_id = v_reporter_id
      AND reports_last_24h >= v_daily_limit
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

-- ------------------------------------------------------------
-- 5. admin_user_detail：reporter_stats 增加最近举报明细
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_user_detail(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user public.profiles%ROWTYPE;
  v_recent_posts JSONB;
  v_recent_comments JSONB;
  v_violations JSONB;
  v_restrictions JSONB;
  v_reporter_stats JSONB;
  v_recent_reports JSONB;
  v_total_cases INTEGER := 0;
  v_pending_cases INTEGER := 0;
  v_active_violations INTEGER := 0;
  v_total_violations INTEGER := 0;
  v_deleted_items INTEGER := 0;
  v_active_restrictions INTEGER := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', FALSE, 'message', '需要管理员权限。');
  END IF;
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'message', '用户 ID 无效。');
  END IF;
  SELECT * INTO v_user FROM public.profiles WHERE id = p_user_id;
  IF v_user.id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'message', '没有找到该用户。');
  END IF;

  SELECT COUNT(*) INTO v_total_cases
  FROM public.moderation_report_cases mc WHERE mc.target_user_id = p_user_id;
  SELECT COUNT(*) INTO v_pending_cases
  FROM public.moderation_report_cases mc
  WHERE mc.target_user_id = p_user_id AND mc.status IN ('pending', 'reviewing');
  SELECT COUNT(*) INTO v_active_violations
  FROM public.user_violations uv WHERE uv.user_id = p_user_id AND uv.status = 'active';
  SELECT COUNT(*) INTO v_total_violations
  FROM public.user_violations uv WHERE uv.user_id = p_user_id;
  SELECT COUNT(*) INTO v_deleted_items
  FROM public.user_violations uv
  WHERE uv.user_id = p_user_id AND uv.metadata->>'action' = 'delete';
  SELECT COUNT(*) INTO v_active_restrictions
  FROM public.user_restrictions ur
  WHERE ur.user_id = p_user_id AND ur.status = 'active'
    AND (ur.ends_at IS NULL OR ur.ends_at > NOW());

  SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb)
  INTO v_recent_posts
  FROM (
    SELECT jsonb_build_object(
      'id', p.id,
      'title', p.title,
      'post_type', p.post_type,
      'status', p.status,
      'review_status', p.review_status,
      'visibility', p.visibility,
      'published_at', p.published_at,
      'created_at', p.created_at
    ) AS row_data
    FROM public.posts p
    WHERE p.user_id = p_user_id
    ORDER BY p.created_at DESC
    LIMIT 10
  ) sub;

  SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb)
  INTO v_recent_comments
  FROM (
    SELECT jsonb_build_object(
      'id', c.id,
      'post_id', c.post_id,
      'parent_id', c.parent_id,
      'content', left(COALESCE(c.content, ''), 200),
      'created_at', c.created_at
    ) AS row_data
    FROM public.comments c
    WHERE c.user_id = p_user_id
    ORDER BY c.created_at DESC
    LIMIT 10
  ) sub;

  SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb)
  INTO v_violations
  FROM (
    SELECT jsonb_build_object(
      'id', uv.id,
      'source_type', uv.source_type,
      'content_type', uv.content_type,
      'category', uv.category,
      'severity', uv.severity,
      'summary', uv.summary,
      'status', uv.status,
      'confirmed_at', uv.confirmed_at,
      'revoked_at', uv.revoked_at,
      'metadata', uv.metadata
    ) AS row_data
    FROM public.user_violations uv
    WHERE uv.user_id = p_user_id
    ORDER BY uv.confirmed_at DESC
    LIMIT 30
  ) sub;

  SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb)
  INTO v_restrictions
  FROM (
    SELECT jsonb_build_object(
      'id', ur.id,
      'restriction_type', ur.restriction_type,
      'status', ur.status,
      'reason', ur.reason,
      'starts_at', ur.starts_at,
      'ends_at', ur.ends_at,
      'lifted_at', ur.lifted_at,
      'created_at', ur.created_at,
      'metadata', ur.metadata
    ) AS row_data
    FROM public.user_restrictions ur
    WHERE ur.user_id = p_user_id
    ORDER BY ur.created_at DESC
    LIMIT 30
  ) sub;

  SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb)
  INTO v_recent_reports
  FROM (
    SELECT jsonb_build_object(
      'id', r.id,
      'target_type', r.target_type,
      'target_id', r.target_id,
      'reason_category', r.reason_category,
      'details', left(COALESCE(r.details, ''), 200),
      'status', r.status,
      'created_at', r.created_at
    ) AS row_data
    FROM (
      SELECT id, target_type, target_id, reason_category, details, status, created_at
      FROM public.content_reports
      WHERE reporter_id = p_user_id
      UNION ALL
      SELECT id, 'comment'::TEXT AS target_type, comment_id AS target_id,
             reason_category, details, status, created_at
      FROM public.comment_reports
      WHERE reporter_id = p_user_id
    ) r
    ORDER BY r.created_at DESC
    LIMIT 10
  ) sub;

  SELECT jsonb_build_object(
    'total_reports', rs.total_reports,
    'pending_reports', rs.pending_reports,
    'valid_reports', rs.valid_reports,
    'invalid_reports', rs.invalid_reports,
    'duplicate_attempts', rs.duplicate_attempts,
    'reports_last_24h', rs.reports_last_24h,
    'last_report_at', rs.last_report_at,
    'report_restricted_until', rs.report_restricted_until,
    'recent_reports', v_recent_reports
  ) INTO v_reporter_stats
  FROM public.user_reporter_stats rs WHERE rs.user_id = p_user_id;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'user', jsonb_build_object(
      'id', v_user.id,
      'nickname', v_user.nickname,
      'avatar_url', v_user.avatar_url,
      'bio', v_user.bio,
      'created_at', v_user.created_at,
      'moderation_status', v_user.moderation_status,
      'moderation_note', v_user.moderation_note,
      'moderated_at', v_user.moderated_at
    ),
    'stats', jsonb_build_object(
      'total_report_cases', v_total_cases,
      'pending_report_cases', v_pending_cases,
      'active_violations', v_active_violations,
      'total_violations', v_total_violations,
      'deleted_items', v_deleted_items,
      'active_restrictions', v_active_restrictions
    ),
    'recent_posts', v_recent_posts,
    'recent_comments', v_recent_comments,
    'violations', v_violations,
    'restrictions', v_restrictions,
    'reporter_stats', v_reporter_stats
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_user_detail(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_user_detail(UUID) TO authenticated, service_role;

-- ============================================================
-- 校验查询（执行后可在 SQL Editor 直接运行确认）
-- SELECT to_regprocedure('public.admin_get_report_limit()');
-- SELECT to_regprocedure('public.admin_update_report_limit(integer)');
-- SELECT to_regprocedure('public.admin_send_report_rule_reminder(uuid, text)');
-- SELECT to_regprocedure('public.admin_user_detail(uuid)');
-- SELECT config_key, config_value FROM public.app_config WHERE config_key = 'daily_report_limit';
-- ============================================================
