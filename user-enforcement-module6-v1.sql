-- ============================================================
-- Inkland 模块 6：用户管理、用户举报与账号处罚
-- 文件：user-enforcement-module6-v1.sql
-- 依赖：admin-backoffice.sql、moderation-rules.sql、
--       admin-moderation-v1-foundation.sql、report-closure-v1.sql
-- 说明：幂等，可重复执行。在 Supabase SQL Editor 执行后：
--   1. 后台可用 admin_user_search / admin_user_detail 查询用户；
--   2. 后台可用 admin_enforce_user_restriction / admin_lift_user_restriction
--      执行警告、限制、暂停、封禁、解除与恢复；
--   3. 前台用 get_my_restrictions 真实拦截，数据库触发器兜底，
--      暂停/封禁/功能限制期间不能绕过。
-- ============================================================

-- ------------------------------------------------------------
-- 0. 账号状态约束统一（兼容暂停态，防止旧迁移覆盖）
-- ------------------------------------------------------------

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_moderation_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_moderation_status_check
  CHECK (moderation_status IN ('active', 'warned', 'restricted', 'suspended', 'banned'));

-- ------------------------------------------------------------
-- 1. 前台查询当前账号状态与有效限制
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_restrictions()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile public.profiles%ROWTYPE;
  v_restrictions JSONB;
  now_ts TIMESTAMPTZ := NOW();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', TRUE, 'status', 'active', 'restrictions', '[]'::jsonb);
  END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id;
  IF v_profile.id IS NULL THEN
    RETURN jsonb_build_object('ok', TRUE, 'status', 'active', 'restrictions', '[]'::jsonb);
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'restriction_type', r.restriction_type,
      'reason', r.reason,
      'starts_at', r.starts_at,
      'ends_at', r.ends_at
    ) ORDER BY r.created_at DESC), '[]'::jsonb)
  INTO v_restrictions
  FROM public.user_restrictions r
  WHERE r.user_id = v_user_id
    AND r.status = 'active'
    AND (r.ends_at IS NULL OR r.ends_at > now_ts);
  RETURN jsonb_build_object(
    'ok', TRUE,
    'status', v_profile.moderation_status,
    'restrictions', v_restrictions
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_restrictions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_restrictions() TO authenticated;

-- ------------------------------------------------------------
-- 2. 后台用户搜索
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_user_search(
  p_query TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_query TEXT := btrim(COALESCE(p_query, ''));
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  v_users JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', FALSE, 'message', '需要管理员权限。');
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', u.id,
      'nickname', u.nickname,
      'avatar_url', u.avatar_url,
      'bio', u.bio,
      'created_at', u.created_at,
      'moderation_status', u.moderation_status,
      'total_report_cases', (
        SELECT COUNT(*)::INTEGER FROM public.moderation_report_cases mc
        WHERE mc.target_user_id = u.id
      ),
      'pending_report_cases', (
        SELECT COUNT(*)::INTEGER FROM public.moderation_report_cases mc
        WHERE mc.target_user_id = u.id AND mc.status IN ('pending', 'reviewing')
      ),
      'active_violations', (
        SELECT COUNT(*)::INTEGER FROM public.user_violations uv
        WHERE uv.user_id = u.id AND uv.status = 'active'
      ),
      'active_restrictions', (
        SELECT COUNT(*)::INTEGER FROM public.user_restrictions ur
        WHERE ur.user_id = u.id AND ur.status = 'active'
          AND (ur.ends_at IS NULL OR ur.ends_at > NOW())
      ),
      'restrictions', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'restriction_type', r.restriction_type,
            'reason', r.reason,
            'ends_at', r.ends_at
          ) ORDER BY r.created_at DESC), '[]'::jsonb)
        FROM public.user_restrictions r
        WHERE r.user_id = u.id AND r.status = 'active'
          AND (r.ends_at IS NULL OR r.ends_at > NOW())
      )
    )), '[]'::jsonb)
  INTO v_users
  FROM (
    SELECT id, nickname, avatar_url, bio, created_at, moderation_status
    FROM public.profiles
    WHERE v_query = ''
       OR nickname ILIKE '%' || v_query || '%'
       OR id::TEXT = v_query
       OR id::TEXT ILIKE v_query || '%'
    ORDER BY created_at DESC
    LIMIT v_limit
  ) u;
  RETURN jsonb_build_object('ok', TRUE, 'users', v_users);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_user_search(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_user_search(TEXT, INTEGER) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 3. 后台用户详情
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

  SELECT jsonb_build_object(
    'total_reports', rs.total_reports,
    'pending_reports', rs.pending_reports,
    'valid_reports', rs.valid_reports,
    'invalid_reports', rs.invalid_reports,
    'duplicate_attempts', rs.duplicate_attempts,
    'reports_last_24h', rs.reports_last_24h,
    'last_report_at', rs.last_report_at,
    'report_restricted_until', rs.report_restricted_until
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

-- ------------------------------------------------------------
-- 4. 后台执行处罚
--    p_action: warn | restrict_comment | restrict_publish
--              | restrict_report | suspend | ban
-- ------------------------------------------------------------

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
    v_notify := '账号暂停' || E'\n' || '你的账号已被暂停' || v_date_label || '。' || E'\n' || '原因：' || v_reason;
  ELSE
    v_template_key := 'account_banned';
    v_notify := '账号封禁' || E'\n' || '你的账号已被永久封禁。' || E'\n' || '原因：' || v_reason;
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

-- ------------------------------------------------------------
-- 5. 后台解除限制 / 恢复账号
--    p_action: lift（解除单项/全部功能限制）| restore（恢复账号）
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_lift_user_restriction(
  p_user_id UUID,
  p_action TEXT DEFAULT 'lift',
  p_restriction_type TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_restore_content BOOLEAN DEFAULT FALSE,
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
  v_row RECORD;
  v_lifted_count INTEGER := 0;
  v_restored_count INTEGER := 0;
  v_hidden_ids UUID[] := '{}';
  v_cur_status TEXT;
  v_new_status TEXT;
  v_active_count INTEGER;
  v_violation_count INTEGER;
  v_notify TEXT;
  v_template_key TEXT;
  v_type_filter TEXT;
  v_func_label TEXT;
BEGIN
  admin_id := auth.uid();
  IF admin_id IS NULL OR NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'not_admin', 'message', '需要管理员权限。');
  END IF;
  IF p_user_id IS NULL OR p_action NOT IN ('lift', 'restore') THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'invalid_params', 'message', '解除参数无效。');
  END IF;
  v_reason := btrim(COALESCE(p_reason, ''));
  IF v_reason = '' THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'missing_reason', 'message', '请填写解除原因。');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'user_missing', 'message', '没有找到该用户。');
  END IF;

  v_type_filter := CASE
    WHEN p_action = 'restore' THEN 'account'
    WHEN p_restriction_type = 'all' THEN NULL
    WHEN p_restriction_type IN ('comment', 'publish', 'report', 'account') THEN p_restriction_type
    ELSE NULL
  END;
  IF p_action = 'lift' AND COALESCE(p_restriction_type, '') NOT IN ('all','comment','publish','report','account') THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'invalid_type', 'message', '请选择要解除的限制类型。');
  END IF;
  IF p_action = 'restore' THEN
    v_type_filter := 'account';
    p_restore_content := TRUE;
  END IF;

  SELECT moderation_status INTO v_cur_status FROM public.profiles WHERE id = p_user_id;

  FOR v_row IN
    SELECT * FROM public.user_restrictions r
    WHERE r.user_id = p_user_id AND r.status = 'active'
      AND (v_type_filter IS NULL OR r.restriction_type = v_type_filter)
  LOOP
    UPDATE public.user_restrictions
    SET status = 'lifted',
        lifted_by = admin_id,
        lifted_at = now_ts,
        metadata = metadata || jsonb_build_object(
          'lift_reason', v_reason,
          'lifted_at', now_ts,
          'lifted_by', admin_id
        ),
        updated_at = now_ts
    WHERE id = v_row.id;
    v_lifted_count := v_lifted_count + 1;
    IF p_restore_content AND v_row.restriction_type = 'account'
       AND jsonb_typeof(v_row.metadata->'hidden_post_ids') = 'array' THEN
      UPDATE public.posts
      SET status = 'published'
      WHERE user_id = p_user_id AND status = 'hidden'
        AND id IN (
          SELECT hid::uuid FROM jsonb_array_elements_text(v_row.metadata->'hidden_post_ids') AS hid
        );
      GET DIAGNOSTICS v_restored_count = ROW_COUNT;
    END IF;
  END LOOP;

  -- 举报限制解除时清空举报人统计表中的截止时间
  IF v_type_filter = 'report' OR v_type_filter IS NULL THEN
    UPDATE public.user_reporter_stats
    SET report_restricted_until = NULL, updated_at = now_ts
    WHERE user_id = p_user_id;
  END IF;

  -- 重算账号状态
  SELECT COUNT(*) INTO v_active_count
  FROM public.user_restrictions r
  WHERE r.user_id = p_user_id AND r.status = 'active'
    AND (r.ends_at IS NULL OR r.ends_at > now_ts);
  IF v_active_count = 0 THEN
    SELECT COUNT(*) INTO v_violation_count
    FROM public.user_violations uv WHERE uv.user_id = p_user_id AND uv.status = 'active';
    v_new_status := CASE WHEN v_violation_count > 0 THEN 'warned' ELSE 'active' END;
  ELSIF EXISTS (
    SELECT 1 FROM public.user_restrictions r
    WHERE r.user_id = p_user_id AND r.restriction_type = 'account'
      AND r.status = 'active' AND (r.ends_at IS NULL OR r.ends_at > now_ts)
  ) THEN
    v_new_status := v_cur_status;
  ELSE
    v_new_status := 'restricted';
  END IF;
  UPDATE public.profiles
  SET moderation_status = v_new_status,
      moderation_note = left(v_reason, 500),
      moderated_at = now_ts,
      moderated_by = admin_id
  WHERE id = p_user_id;

  -- 解除/恢复通知
  IF v_type_filter = 'account' OR p_action = 'restore' THEN
    v_template_key := 'account_restored';
    v_func_label := '账号';
    v_notify := '账号恢复' || E'\n' || '你的账号已恢复使用。' || E'\n' || '原因：' || v_reason;
  ELSE
    v_template_key := 'restriction_lifted';
    v_func_label := CASE v_type_filter
      WHEN 'comment' THEN '评论'
      WHEN 'publish' THEN '发布'
      WHEN 'report' THEN '举报'
      ELSE '相关功能' END;
    v_notify := '限制解除' || E'\n' || '你的' || v_func_label || '功能已恢复。' || E'\n' || '原因：' || v_reason;
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
      'restriction_type', v_type_filter,
      'reason', v_reason,
      'restore_content', COALESCE(p_restore_content, FALSE),
      'restored_post_count', v_restored_count
    ),
    'sent', now_ts
  );

  INSERT INTO public.admin_audit_logs (
    admin_id, action, target_type, target_id, note, created_at, metadata
  ) VALUES (
    admin_id, CASE WHEN p_action = 'restore' THEN 'restore_user_account' ELSE 'lift_user_restriction' END,
    'user', p_user_id, btrim(COALESCE(p_note, v_reason)), now_ts,
    jsonb_build_object(
      'action', p_action,
      'restriction_type', v_type_filter,
      'reason', v_reason,
      'lifted_count', v_lifted_count,
      'restore_content', COALESCE(p_restore_content, FALSE),
      'restored_post_count', v_restored_count
    )
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'message', CASE WHEN p_action = 'restore' THEN '账号已恢复使用。' ELSE '限制已解除。' END,
    'lifted_count', v_lifted_count,
    'restored_post_count', v_restored_count
  );
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'lift_failed', 'message', '解除操作执行失败：' || SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_lift_user_restriction(UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_lift_user_restriction(UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 6. 数据库层硬拦截（前台绕过前端也无法执行）
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_user_restrictions_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
BEGIN
  IF auth.uid() IS NULL OR NEW.user_id IS NULL OR NEW.user_id <> auth.uid() THEN
    RETURN NEW;
  END IF;
  SELECT p.moderation_status INTO v_status FROM public.profiles p WHERE p.id = NEW.user_id;
  IF v_status = 'banned' THEN
    RAISE EXCEPTION '你的账号已被封禁，无法发表评论。';
  ELSIF v_status = 'suspended' THEN
    RAISE EXCEPTION '你的账号已被暂停，暂停期间无法发表评论。';
  ELSIF EXISTS (
    SELECT 1 FROM public.user_restrictions r
    WHERE r.user_id = NEW.user_id AND r.restriction_type = 'comment'
      AND r.status = 'active' AND (r.ends_at IS NULL OR r.ends_at > NOW())
  ) THEN
    RAISE EXCEPTION '你的评论功能暂时受限，无法发表评论。';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comments_enforce_restrictions ON public.comments;
CREATE TRIGGER comments_enforce_restrictions
BEFORE INSERT ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.enforce_user_restrictions_comment();

CREATE OR REPLACE FUNCTION public.enforce_user_restrictions_publish()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
BEGIN
  IF auth.uid() IS NULL OR NEW.user_id IS NULL OR NEW.user_id <> auth.uid() THEN
    RETURN NEW;
  END IF;
  -- 仅拦截实际发布/提交审核；草稿保存不受影响
  IF NEW.status = 'draft' AND COALESCE(NEW.review_status, '') <> 'pending' THEN
    RETURN NEW;
  END IF;
  SELECT p.moderation_status INTO v_status FROM public.profiles p WHERE p.id = NEW.user_id;
  IF v_status = 'banned' THEN
    RAISE EXCEPTION '你的账号已被封禁，无法发布作品。';
  ELSIF v_status = 'suspended' THEN
    RAISE EXCEPTION '你的账号已被暂停，暂停期间无法发布作品。';
  ELSIF EXISTS (
    SELECT 1 FROM public.user_restrictions r
    WHERE r.user_id = NEW.user_id AND r.restriction_type = 'publish'
      AND r.status = 'active' AND (r.ends_at IS NULL OR r.ends_at > NOW())
  ) THEN
    RAISE EXCEPTION '你的发布功能暂时受限，无法发布或提交作品。';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS posts_enforce_restrictions ON public.posts;
CREATE TRIGGER posts_enforce_restrictions
BEFORE INSERT OR UPDATE ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.enforce_user_restrictions_publish();

CREATE OR REPLACE FUNCTION public.enforce_user_restrictions_series()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
BEGIN
  IF auth.uid() IS NULL OR NEW.user_id IS NULL OR NEW.user_id <> auth.uid() THEN
    RETURN NEW;
  END IF;
  -- 更新场景只拦截“重新提交审核”，不拦截连载状态/备注等常规编辑
  IF TG_OP = 'UPDATE' THEN
    IF NEW.review_status IS DISTINCT FROM 'pending'
       OR OLD.review_status = 'pending' THEN
      RETURN NEW;
    END IF;
  END IF;
  SELECT p.moderation_status INTO v_status FROM public.profiles p WHERE p.id = NEW.user_id;
  IF v_status = 'banned' THEN
    RAISE EXCEPTION '你的账号已被封禁，无法创建连载或合集。';
  ELSIF v_status = 'suspended' THEN
    RAISE EXCEPTION '你的账号已被暂停，暂停期间无法创建连载或合集。';
  ELSIF EXISTS (
    SELECT 1 FROM public.user_restrictions r
    WHERE r.user_id = NEW.user_id AND r.restriction_type = 'publish'
      AND r.status = 'active' AND (r.ends_at IS NULL OR r.ends_at > NOW())
  ) THEN
    RAISE EXCEPTION '你的发布功能暂时受限，无法创建连载或合集。';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS series_enforce_restrictions ON public.series;
CREATE TRIGGER series_enforce_restrictions
BEFORE INSERT OR UPDATE OF name, description, review_status ON public.series
FOR EACH ROW EXECUTE FUNCTION public.enforce_user_restrictions_series();

CREATE OR REPLACE FUNCTION public.enforce_user_restrictions_report()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
BEGIN
  IF auth.uid() IS NULL OR NEW.reporter_id IS NULL OR NEW.reporter_id <> auth.uid() THEN
    RETURN NEW;
  END IF;
  SELECT p.moderation_status INTO v_status FROM public.profiles p WHERE p.id = NEW.reporter_id;
  IF v_status = 'banned' THEN
    RAISE EXCEPTION '你的账号已被封禁，无法提交举报。';
  ELSIF v_status = 'suspended' THEN
    RAISE EXCEPTION '你的账号已被暂停，暂停期间无法提交举报。';
  ELSIF EXISTS (
    SELECT 1 FROM public.user_restrictions r
    WHERE r.user_id = NEW.reporter_id AND r.restriction_type = 'report'
      AND r.status = 'active' AND (r.ends_at IS NULL OR r.ends_at > NOW())
  ) THEN
    RAISE EXCEPTION '你的举报功能暂时受限，无法提交举报。';
  ELSIF EXISTS (
    SELECT 1 FROM public.user_reporter_stats rs
    WHERE rs.user_id = NEW.reporter_id
      AND rs.report_restricted_until IS NOT NULL
      AND rs.report_restricted_until > NOW()
  ) THEN
    RAISE EXCEPTION '你的举报功能暂时受限，无法提交举报。';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS content_reports_enforce_restrictions ON public.content_reports;
CREATE TRIGGER content_reports_enforce_restrictions
BEFORE INSERT ON public.content_reports
FOR EACH ROW EXECUTE FUNCTION public.enforce_user_restrictions_report();

DROP TRIGGER IF EXISTS comment_reports_enforce_restrictions ON public.comment_reports;
CREATE TRIGGER comment_reports_enforce_restrictions
BEFORE INSERT ON public.comment_reports
FOR EACH ROW EXECUTE FUNCTION public.enforce_user_restrictions_report();

-- ============================================================
-- 校验查询（执行后可在 SQL Editor 直接运行确认）
-- SELECT to_regprocedure('public.get_my_restrictions()');
-- SELECT to_regprocedure('public.admin_user_search(text, integer)');
-- SELECT to_regprocedure('public.admin_user_detail(uuid)');
-- SELECT to_regprocedure('public.admin_enforce_user_restriction(uuid, text, text, boolean, timestamptz, timestamptz, boolean, text)');
-- SELECT to_regprocedure('public.admin_lift_user_restriction(uuid, text, text, text, boolean, text)');
-- ============================================================
