-- ============================================================
-- Inkland 飞书后续补全批次第 1 项：高风险内容临时隐藏（3.7 / 3.9）
-- 文件：report-high-risk-hide-v1.sql
-- 依赖：report-closure-v1.sql、report-center-followup-v1.sql、
--       report-low-quality-queue-v1.sql、report-notification-improvements-v1.sql、
--       user-report-actions-v1.sql、followers-only-visibility.sql
-- 说明：幂等，可重复执行。在 Supabase SQL Editor 执行后：
--   1. posts/comments 增加 hidden_for_review 及隐藏记录字段，前台 RLS 不再公开展示；
--   2. 举报入库时自动扫描关键词并记录 auto_review_risk / risk_score / review_basis，
--      不自动隐藏，由管理员在后台确认后临时隐藏；
--   3. 后台举报详情支持“暂时隐藏内容 / 恢复展示”，隐藏原因必填；
--   4. 案件处理（非删除）时自动恢复展示，删除时无需恢复；
--   5. 举报中心新增“暂时隐藏”筛选，隐藏案件排在低质量队列之前。
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. posts / comments 临时隐藏字段
-- ------------------------------------------------------------

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS hidden_for_review BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS hidden_for_review_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hidden_for_review_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hidden_for_review_reason TEXT;

ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS hidden_for_review BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS hidden_for_review_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hidden_for_review_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hidden_for_review_reason TEXT;

CREATE INDEX IF NOT EXISTS posts_hidden_for_review_idx
  ON public.posts (hidden_for_review) WHERE hidden_for_review;

CREATE INDEX IF NOT EXISTS comments_hidden_for_review_idx
  ON public.comments (hidden_for_review) WHERE hidden_for_review;

-- ------------------------------------------------------------
-- 2. 前台可见性 RLS：隐藏内容仅作者本人可见
-- ------------------------------------------------------------

DROP POLICY IF EXISTS posts_visible_read ON public.posts;
CREATE POLICY posts_visible_read ON public.posts
  FOR SELECT USING (
    auth.uid() = user_id
    OR (
      status = 'published'
      AND NOT COALESCE(hidden_for_review, FALSE)
      AND (
        visibility = 'public'
        OR (
          visibility = 'followers_only'
          AND EXISTS (
            SELECT 1
            FROM public.follows
            WHERE follows.follower_id = auth.uid()
              AND follows.following_id = posts.user_id
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS comments_visible_read ON public.comments;
CREATE POLICY comments_visible_read ON public.comments
  FOR SELECT USING (
    comments.user_id = auth.uid()
    OR (
      NOT COALESCE(comments.hidden_for_review, FALSE)
      AND EXISTS (
        SELECT 1
        FROM public.posts
        WHERE posts.id = comments.post_id
          AND (
            posts.user_id = auth.uid()
            OR (
              posts.status = 'published'
              AND NOT COALESCE(posts.hidden_for_review, FALSE)
              AND (
                posts.visibility = 'public'
                OR (
                  posts.visibility = 'followers_only'
                  AND EXISTS (
                    SELECT 1
                    FROM public.follows
                    WHERE follows.follower_id = auth.uid()
                      AND follows.following_id = posts.user_id
                  )
                )
              )
            )
          )
      )
    )
  );

-- 私有图片读取范围与作品可见范围保持一致，隐藏后私有图片也不再可读。
DROP POLICY IF EXISTS private_post_images_visible_read ON storage.objects;
CREATE POLICY private_post_images_visible_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'private-post-images'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1
        FROM public.posts
        WHERE (
          posts.cover_url = 'private://private-post-images/' || storage.objects.name
          OR posts.content LIKE '%' || 'private://private-post-images/' || storage.objects.name || '%'
        )
        AND (
          posts.user_id = auth.uid()
          OR (
            posts.status = 'published'
            AND NOT COALESCE(posts.hidden_for_review, FALSE)
            AND (
              posts.visibility = 'public'
              OR (
                posts.visibility = 'followers_only'
                AND EXISTS (
                  SELECT 1
                  FROM public.follows
                  WHERE follows.follower_id = auth.uid()
                    AND follows.following_id = posts.user_id
                )
              )
            )
          )
        )
      )
    )
  );

-- ------------------------------------------------------------
-- 3. 举报内容自动风险评估（关键词扫描，白名单同分类同词优先）
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.evaluate_report_content_risk(
  p_target_type TEXT,
  p_target_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_combined TEXT := '';
  v_risk TEXT := 'normal';
  v_score NUMERIC := 0;
  v_matched JSONB := '[]'::jsonb;
  v_categories JSONB := '[]'::jsonb;
  v_row RECORD;
  v_scanned_length INTEGER := 0;
  v_has_high BOOLEAN := FALSE;
  v_has_review BOOLEAN := FALSE;
BEGIN
  IF p_target_type = 'post' THEN
    SELECT COALESCE(title, '') || E'\n' || COALESCE(content, '') || E'\n' || COALESCE(author_note, '')
    INTO v_combined
    FROM public.posts
    WHERE id = p_target_id;
  ELSIF p_target_type = 'comment' THEN
    SELECT COALESCE(content, '')
    INTO v_combined
    FROM public.comments
    WHERE id = p_target_id;
  ELSE
    RETURN jsonb_build_object(
      'risk', 'normal',
      'score', 0,
      'basis', jsonb_build_object(
        'rules_version', 'keyword-v1',
        'scanned_at', NOW(),
        'scanned_length', 0,
        'matched_keywords', '[]'::jsonb,
        'categories', '[]'::jsonb
      )
    );
  END IF;

  v_combined := COALESCE(v_combined, '');
  v_scanned_length := char_length(v_combined);

  FOR v_row IN
    SELECT keyword.id, keyword.pattern, keyword.category, keyword.severity
    FROM public.moderation_rules keyword
    WHERE keyword.rule_type = 'keyword'
      AND keyword.enabled = TRUE
      AND position(lower(keyword.pattern) IN lower(v_combined)) > 0
      AND NOT EXISTS (
        SELECT 1
        FROM public.moderation_rules whitelist
        WHERE whitelist.rule_type = 'whitelist'
          AND whitelist.enabled = TRUE
          AND whitelist.category = keyword.category
          AND lower(whitelist.pattern) = lower(keyword.pattern)
      )
  LOOP
    v_matched := v_matched || jsonb_build_object(
      'rule_id', v_row.id,
      'pattern', v_row.pattern,
      'category', v_row.category,
      'severity', v_row.severity
    );
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(v_categories) c WHERE c = v_row.category
    ) THEN
      v_categories := v_categories || to_jsonb(v_row.category);
    END IF;
    IF v_row.severity = 'high' THEN
      v_has_high := TRUE;
    ELSIF v_row.severity = 'review' THEN
      v_has_review := TRUE;
    END IF;
  END LOOP;

  IF v_has_high THEN
    v_risk := 'high';
    v_score := 70;
  ELSIF v_has_review THEN
    v_risk := 'minor';
    v_score := 30;
  END IF;

  RETURN jsonb_build_object(
    'risk', v_risk,
    'score', v_score,
    'basis', jsonb_build_object(
      'rules_version', 'keyword-v1',
      'scanned_at', NOW(),
      'scanned_length', v_scanned_length,
      'matched_keywords', v_matched,
      'categories', v_categories
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.evaluate_report_content_risk(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.evaluate_report_content_risk(TEXT, UUID)
  TO authenticated, service_role;

-- ------------------------------------------------------------
-- 4. 管理员临时隐藏 / 恢复展示
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_toggle_report_temporary_hide(
  p_case_id UUID,
  p_hidden BOOLEAN,
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
  IF p_case_id IS NULL OR p_hidden IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'invalid_params', 'message', '处理参数无效。');
  END IF;

  SELECT * INTO case_record
  FROM public.moderation_report_cases
  WHERE id = p_case_id;
  IF case_record.id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'case_missing', 'message', '没有找到该举报案件。');
  END IF;
  IF p_hidden AND case_record.target_type NOT IN ('post', 'comment') THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'invalid_target', 'message', '只有作品或评论案件支持暂时隐藏。');
  END IF;
  IF p_hidden AND case_record.status NOT IN ('pending', 'reviewing') THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'already_resolved', 'message', '该举报案件已处理，无需继续隐藏。');
  END IF;

  v_reason := btrim(COALESCE(p_reason, ''));
  IF p_hidden AND v_reason = '' THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'missing_reason', 'message', '请填写隐藏原因，该原因会写入审核记录。');
  END IF;

  IF case_record.target_type = 'post' THEN
    UPDATE public.posts
    SET hidden_for_review = p_hidden,
        hidden_for_review_at = CASE WHEN p_hidden THEN now_ts ELSE NULL END,
        hidden_for_review_by = CASE WHEN p_hidden THEN admin_id ELSE NULL END,
        hidden_for_review_reason = CASE WHEN p_hidden THEN v_reason ELSE NULL END
    WHERE id = case_record.target_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', FALSE, 'code', 'target_missing', 'message', '该作品已不存在，无法执行隐藏操作。');
    END IF;
  ELSIF case_record.target_type = 'comment' THEN
    UPDATE public.comments
    SET hidden_for_review = p_hidden,
        hidden_for_review_at = CASE WHEN p_hidden THEN now_ts ELSE NULL END,
        hidden_for_review_by = CASE WHEN p_hidden THEN admin_id ELSE NULL END,
        hidden_for_review_reason = CASE WHEN p_hidden THEN v_reason ELSE NULL END
    WHERE id = case_record.target_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', FALSE, 'code', 'target_missing', 'message', '该评论已不存在，无法执行隐藏操作。');
    END IF;
  END IF;

  UPDATE public.moderation_report_cases
  SET hidden_for_review = p_hidden,
      metadata = metadata || jsonb_build_object(
        CASE WHEN p_hidden THEN 'temporary_hidden_at' ELSE 'temporary_restored_at' END,
        now_ts::TEXT,
        CASE WHEN p_hidden THEN 'temporary_hidden_by' ELSE 'temporary_restored_by' END,
        admin_id::TEXT,
        'temporary_hide_reason', v_reason
      ),
      updated_at = now_ts
  WHERE id = p_case_id;

  INSERT INTO public.admin_audit_logs (
    admin_id, action, target_type, target_id, note, created_at, metadata
  ) VALUES (
    admin_id,
    CASE WHEN p_hidden THEN 'hide_report_content_temporary' ELSE 'restore_report_content' END,
    'report_case', p_case_id, left(v_reason, 500), now_ts,
    jsonb_build_object(
      'target_type', case_record.target_type,
      'target_id', case_record.target_id,
      'hidden', p_hidden,
      'reason', v_reason
    )
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'case_id', p_case_id,
    'hidden', p_hidden,
    'message', CASE WHEN p_hidden THEN '该内容已暂时隐藏，仅作者本人可见。' ELSE '该内容已恢复公开展示。' END
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', FALSE, 'code', 'update_failed', 'message', '操作失败：' || SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_toggle_report_temporary_hide(UUID, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_toggle_report_temporary_hide(UUID, BOOLEAN, TEXT)
  TO authenticated, service_role;

-- ------------------------------------------------------------
-- 5. submit_report_v1：举报入库时记录自动风险评估（不自动隐藏）
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
  v_risk JSONB;
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

  v_risk := public.evaluate_report_content_risk(p_target_type, p_target_id);

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
      auto_review_risk, risk_score, review_basis,
      metadata
    ) VALUES (
      p_target_type, p_target_id, v_target_user_id, 'pending', 'normal',
      btrim(p_reason_category), 1, now_ts, now_ts,
      v_risk->>'risk', COALESCE((v_risk->>'score')::NUMERIC, 0), v_risk->'basis',
      jsonb_build_object('first_reason_category', btrim(p_reason_category))
    ) RETURNING id INTO v_case_id;
  ELSE
    v_case_id := active_case.id;
    UPDATE public.moderation_report_cases
    SET report_count = report_count + 1,
        last_reported_at = now_ts,
        auto_review_risk = v_risk->>'risk',
        risk_score = COALESCE((v_risk->>'score')::NUMERIC, 0),
        review_basis = v_risk->'basis',
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
    user_id, total_reports, pending_reports, reports_last_24h, reports_last_30d,
    last_report_at, updated_at
  ) VALUES (
    v_reporter_id, 1, 1, 1, 1, now_ts, now_ts
  )
  ON CONFLICT (user_id) DO UPDATE
    SET total_reports = public.user_reporter_stats.total_reports + 1,
        pending_reports = public.user_reporter_stats.pending_reports + 1,
        reports_last_24h = CASE
          WHEN public.user_reporter_stats.last_report_at IS NOT NULL
            AND public.user_reporter_stats.last_report_at > now_ts - interval '24 hours'
          THEN public.user_reporter_stats.reports_last_24h + 1
          ELSE 1 END,
        reports_last_30d = CASE
          WHEN public.user_reporter_stats.last_report_at IS NOT NULL
            AND public.user_reporter_stats.last_report_at > now_ts - interval '30 days'
          THEN public.user_reporter_stats.reports_last_30d + 1
          ELSE 1 END,
        last_report_at = now_ts,
        updated_at = now_ts;

  -- 第二级：自动评估长期低质量举报者，并将其待处理案件同步到低质量队列
  PERFORM public.sync_reporter_low_quality(v_reporter_id);

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

-- ------------------------------------------------------------
-- 6. admin_resolve_report_case：非删除处理结果自动恢复暂隐内容
-- ------------------------------------------------------------

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

  -- 非删除处理结果自动恢复被暂隐的内容
  IF p_action <> 'delete' AND case_record.target_type IN ('post', 'comment') THEN
    IF case_record.target_type = 'post' THEN
      UPDATE public.posts
      SET hidden_for_review = FALSE,
          hidden_for_review_at = NULL,
          hidden_for_review_by = NULL,
          hidden_for_review_reason = NULL
      WHERE id = case_record.target_id;
    ELSE
      UPDATE public.comments
      SET hidden_for_review = FALSE,
          hidden_for_review_at = NULL,
          hidden_for_review_by = NULL,
          hidden_for_review_reason = NULL
      WHERE id = case_record.target_id;
    END IF;
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

-- ------------------------------------------------------------
-- 7. admin_report_center_v1：暂时隐藏筛选 + 队列排序
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_report_center_v1(
  p_tab TEXT DEFAULT 'cases',
  p_status TEXT DEFAULT 'all',
  p_priority TEXT DEFAULT 'all',
  p_target_type TEXT DEFAULT 'all',
  p_multi_report BOOLEAN DEFAULT NULL,
  p_suspicious BOOLEAN DEFAULT NULL,
  p_service_error BOOLEAN DEFAULT NULL,
  p_low_quality BOOLEAN DEFAULT NULL,
  p_hidden BOOLEAN DEFAULT NULL,
  p_query TEXT DEFAULT '',
  p_limit INTEGER DEFAULT 100
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_query TEXT := btrim(COALESCE(p_query, ''));
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 200);
  v_cases JSONB;
  v_reporters JSONB;
  v_target_users JSONB;
  v_counts JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'not_admin', 'message', '需要管理员权限。');
  END IF;
  IF p_tab NOT IN ('cases', 'reporters', 'target_users') THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'invalid_tab', 'message', '分类参数无效。');
  END IF;

  -- 内容举报案件：保留快照摘要，并综合计算风险与举报者异常
  SELECT COALESCE(jsonb_agg(row_data ORDER BY queue_order, last_reported_at DESC), '[]'::jsonb)
  INTO v_cases
  FROM (
    SELECT jsonb_build_object(
        'id', c.id,
        'target_type', c.target_type,
        'target_id', c.target_id,
        'target_user_id', c.target_user_id,
        'status', c.status,
        'priority', c.priority,
        'effective_priority', CASE
          WHEN c.auto_review_risk = 'urgent' THEN 'urgent'
          WHEN c.auto_review_risk = 'high' THEN 'high'
          ELSE c.priority END,
        'outcome', c.outcome,
        'primary_reason_category', c.primary_reason_category,
        'report_count', c.report_count,
        'first_reported_at', c.first_reported_at,
        'last_reported_at', c.last_reported_at,
        'created_at', c.created_at,
        'resolved_at', c.resolved_at,
        'metadata', c.metadata,
        'target_title', CASE
          WHEN c.target_type = 'post' THEN COALESCE(s.object_snapshot->>'title', '')
          WHEN c.target_type = 'comment' THEN '评论于《' || COALESCE(s.context_snapshot->>'post_title', '未知作品') || '》'
          ELSE COALESCE(s.object_snapshot->>'nickname', '') END,
        'target_summary', left(
          btrim(regexp_replace(
            COALESCE(
              CASE WHEN c.target_type = 'post' THEN s.object_snapshot->>'content'
                   WHEN c.target_type = 'comment' THEN s.object_snapshot->>'content'
                   ELSE s.object_snapshot->>'bio' END,
              ''
            ),
            '!\[[^\]]*\]\([^)]*\)', '', 'g'
          )),
          160
        ),
        'target_nickname', COALESCE(
          CASE WHEN c.target_type = 'post' THEN s.context_snapshot->>'author_nickname'
               WHEN c.target_type = 'comment' THEN s.context_snapshot->>'comment_author_nickname'
               ELSE s.object_snapshot->>'nickname' END,
          ''
        ),
        'auto_review_risk', COALESCE(NULLIF(c.auto_review_risk, ''), 'normal'),
        'risk_score', c.risk_score,
        'suspicious_report', COALESCE(c.suspicious_report, FALSE)
          OR EXISTS (
            SELECT 1 FROM public.user_reporter_stats rs
            WHERE rs.user_id IN (
              SELECT cr.reporter_id FROM public.content_reports cr WHERE cr.case_id = c.id
              UNION
              SELECT cm.reporter_id FROM public.comment_reports cm WHERE cm.case_id = c.id
            )
            AND (rs.invalid_reports >= 5 OR rs.duplicate_attempts >= 3
                 OR (rs.total_reports >= 8 AND rs.invalid_reports::numeric / GREATEST(rs.total_reports, 1) >= 0.7))
          ),
        'multi_report', c.report_count >= 3,
        'service_error', COALESCE(c.service_error, FALSE)
          OR COALESCE(c.review_basis->>'service_error', 'false') = 'true',
        'low_quality_queue', COALESCE(c.low_quality_queue, FALSE),
        'hidden_for_review', COALESCE(c.hidden_for_review, FALSE),
        'recent_confirmed_violations', (
          SELECT COUNT(*)::INTEGER FROM public.user_violations uv
          WHERE uv.user_id = c.target_user_id AND uv.status = 'active'
            AND uv.confirmed_at > NOW() - interval '90 days'
        ),
        'reporter_anomalies', COALESCE((
          SELECT jsonb_agg(flag) FROM (
            SELECT flag FROM (
              SELECT CASE WHEN rs.duplicate_attempts >= 3 THEN '重复举报较多' END AS flag
              FROM public.user_reporter_stats rs
              WHERE rs.user_id IN (
                SELECT cr.reporter_id FROM public.content_reports cr WHERE cr.case_id = c.id
                UNION
                SELECT cm.reporter_id FROM public.comment_reports cm WHERE cm.case_id = c.id
              )
              UNION ALL
              SELECT CASE WHEN rs.invalid_reports >= 5
                AND rs.invalid_reports::numeric / GREATEST(rs.total_reports, 1) >= 0.7 THEN '成立率低' END AS flag
              FROM public.user_reporter_stats rs
              WHERE rs.user_id IN (
                SELECT cr.reporter_id FROM public.content_reports cr WHERE cr.case_id = c.id
                UNION
                SELECT cm.reporter_id FROM public.comment_reports cm WHERE cm.case_id = c.id
              )
              UNION ALL
              SELECT CASE WHEN rs.report_restricted_until IS NOT NULL
                AND rs.report_restricted_until > NOW() THEN '举报受限' END AS flag
              FROM public.user_reporter_stats rs
              WHERE rs.user_id IN (
                SELECT cr.reporter_id FROM public.content_reports cr WHERE cr.case_id = c.id
                UNION
                SELECT cm.reporter_id FROM public.comment_reports cm WHERE cm.case_id = c.id
              )
              UNION ALL
              SELECT CASE WHEN rs.reports_last_24h >= 10 THEN '短时举报集中' END AS flag
              FROM public.user_reporter_stats rs
              WHERE rs.user_id IN (
                SELECT cr.reporter_id FROM public.content_reports cr WHERE cr.case_id = c.id
                UNION
                SELECT cm.reporter_id FROM public.comment_reports cm WHERE cm.case_id = c.id
              )
            ) flags
            WHERE flag IS NOT NULL
          ) f
        ), '[]'::jsonb)
    ) AS row_data,
    CASE
      WHEN c.auto_review_risk = 'urgent' THEN 1
      WHEN c.auto_review_risk = 'high' THEN 2
      WHEN COALESCE(c.hidden_for_review, FALSE) THEN 3
      WHEN COALESCE(c.low_quality_queue, FALSE) THEN 4
      ELSE 5 END AS queue_order,
    c.last_reported_at
    FROM public.moderation_report_cases c
    LEFT JOIN public.moderation_report_snapshots s ON s.case_id = c.id
    WHERE (
        p_status = 'all'
        OR (p_status = 'pending' AND c.status IN ('pending', 'reviewing'))
        OR (p_status IN ('kept', 'reminded', 'deleted') AND c.status = 'resolved' AND c.outcome = p_status)
      )
      AND (
        p_priority = 'all'
        OR CASE
          WHEN c.auto_review_risk = 'urgent' THEN 'urgent'
          WHEN c.auto_review_risk = 'high' THEN 'high'
          ELSE c.priority END = p_priority
      )
      AND (p_target_type = 'all' OR c.target_type = p_target_type)
      AND (p_multi_report IS NULL OR (p_multi_report AND c.report_count >= 3))
      AND (
        p_suspicious IS NULL
        OR (
          p_suspicious
          AND (
            COALESCE(c.suspicious_report, FALSE)
            OR EXISTS (
              SELECT 1 FROM public.user_reporter_stats rs
              WHERE rs.user_id IN (
                SELECT cr.reporter_id FROM public.content_reports cr WHERE cr.case_id = c.id
                UNION
                SELECT cm.reporter_id FROM public.comment_reports cm WHERE cm.case_id = c.id
              )
              AND (rs.invalid_reports >= 5 OR rs.duplicate_attempts >= 3
                   OR (rs.total_reports >= 8 AND rs.invalid_reports::numeric / GREATEST(rs.total_reports, 1) >= 0.7))
            )
          )
        )
      )
      AND (
        p_service_error IS NULL
        OR (p_service_error AND (
          COALESCE(c.service_error, FALSE)
          OR COALESCE(c.review_basis->>'service_error', 'false') = 'true'
        ))
      )
      AND (p_low_quality IS NULL OR COALESCE(c.low_quality_queue, FALSE) = p_low_quality)
      AND (p_hidden IS NULL OR COALESCE(c.hidden_for_review, FALSE) = p_hidden)
      AND (
        v_query = ''
        OR COALESCE(c.primary_reason_category, '') ILIKE '%' || v_query || '%'
        OR COALESCE(s.object_snapshot->>'title', '') ILIKE '%' || v_query || '%'
        OR COALESCE(s.object_snapshot->>'nickname', '') ILIKE '%' || v_query || '%'
        OR COALESCE(s.context_snapshot->>'post_title', '') ILIKE '%' || v_query || '%'
        OR c.id::TEXT ILIKE v_query || '%'
    )
    LIMIT v_limit
  ) sub;

  -- 举报者风险：统计、异常标记、集中举报对象
  SELECT COALESCE(jsonb_agg(row_data ORDER BY risk_score DESC), '[]'::jsonb)
  INTO v_reporters
  FROM (
    SELECT jsonb_build_object(
        'user_id', p.id,
        'nickname', p.nickname,
        'avatar_url', p.avatar_url,
        'moderation_status', p.moderation_status,
        'created_at', p.created_at,
        'total_reports', COALESCE(rs.total_reports, 0),
        'pending_reports', COALESCE(rs.pending_reports, 0),
        'valid_reports', COALESCE(rs.valid_reports, 0),
        'invalid_reports', COALESCE(rs.invalid_reports, 0),
        'duplicate_attempts', COALESCE(rs.duplicate_attempts, 0),
        'reports_last_24h', COALESCE(rs.reports_last_24h, 0),
        'reports_last_30d', COALESCE(rs.reports_last_30d, (
          SELECT COUNT(*)::INTEGER FROM (
            SELECT 1 FROM public.content_reports cr WHERE cr.reporter_id = p.id AND cr.created_at > NOW() - interval '30 days'
            UNION ALL
            SELECT 1 FROM public.comment_reports cm WHERE cm.reporter_id = p.id AND cm.created_at > NOW() - interval '30 days'
          ) recent
        )),
        'report_restricted_until', rs.report_restricted_until,
        'low_quality', COALESCE((rs.metadata->>'low_quality')::BOOLEAN, FALSE),
        'distinct_target_users', (
          SELECT COUNT(*)::INTEGER FROM (
            SELECT DISTINCT target_user_id FROM (
              SELECT CASE WHEN cr.target_type = 'post' THEN (SELECT po.user_id FROM public.posts po WHERE po.id = cr.target_id)
                          WHEN cr.target_type = 'comment' THEN (SELECT co.user_id FROM public.comments co WHERE co.id = cr.target_id)
                          ELSE cr.target_id END AS target_user_id
              FROM public.content_reports cr WHERE cr.reporter_id = p.id
              UNION ALL
              SELECT co.user_id FROM public.comment_reports cm JOIN public.comments co ON co.id = cm.comment_id
              WHERE cm.reporter_id = p.id
            ) t
            WHERE target_user_id IS NOT NULL
          ) d
        ),
        'focused_target', (
          SELECT jsonb_build_object(
            'target_user_id', target_user_id,
            'nickname', COALESCE((SELECT nickname FROM public.profiles WHERE id = target_user_id), ''),
            'count', cnt
          )
          FROM (
            SELECT target_user_id, COUNT(*) AS cnt
            FROM (
              SELECT CASE WHEN cr.target_type = 'post' THEN (SELECT po.user_id FROM public.posts po WHERE po.id = cr.target_id)
                          WHEN cr.target_type = 'comment' THEN (SELECT co.user_id FROM public.comments co WHERE co.id = cr.target_id)
                          ELSE cr.target_id END AS target_user_id
              FROM public.content_reports cr WHERE cr.reporter_id = p.id
              UNION ALL
              SELECT co.user_id FROM public.comment_reports cm JOIN public.comments co ON co.id = cm.comment_id
              WHERE cm.reporter_id = p.id
            ) t
            WHERE target_user_id IS NOT NULL
            GROUP BY target_user_id
            ORDER BY cnt DESC
            LIMIT 1
          ) f
          WHERE cnt >= 3
        ),
        'risk_score', ROUND((
          CASE WHEN COALESCE(rs.total_reports, 0) >= 8
            THEN (COALESCE(rs.invalid_reports, 0)::numeric / GREATEST(rs.total_reports, 1)) * 40 ELSE 0 END
          + LEAST(COALESCE(rs.reports_last_24h, 0)::numeric / 20, 1) * 25
          + LEAST(COALESCE(rs.duplicate_attempts, 0)::numeric / 5, 1) * 20
          + CASE WHEN COALESCE((rs.metadata->>'low_quality')::BOOLEAN, FALSE) THEN 10 ELSE 0 END
          + CASE WHEN rs.report_restricted_until IS NOT NULL AND rs.report_restricted_until > NOW() THEN 5 ELSE 0 END
        ), 1),
        'risk_level', CASE
          WHEN COALESCE(rs.total_reports, 0) = 0 THEN 'normal'
          WHEN (
            COALESCE(rs.invalid_reports, 0)::numeric / GREATEST(rs.total_reports, 1) >= 0.85
            OR COALESCE(rs.reports_last_24h, 0) >= 15
            OR COALESCE((rs.metadata->>'low_quality')::BOOLEAN, FALSE)
          ) AND (
            COALESCE(rs.duplicate_attempts, 0) >= 3
            OR COALESCE(rs.invalid_reports, 0) >= 8
            OR rs.report_restricted_until IS NOT NULL
          ) THEN 'urgent'
          WHEN COALESCE(rs.invalid_reports, 0) >= 5
            AND COALESCE(rs.invalid_reports, 0)::numeric / GREATEST(rs.total_reports, 1) >= 0.7 THEN 'high'
          WHEN COALESCE(rs.duplicate_attempts, 0) >= 3
            OR COALESCE(rs.reports_last_24h, 0) >= 10 THEN 'high'
          ELSE 'normal' END,
        'suspicious_flags', COALESCE((
          SELECT jsonb_agg(flag) FROM (
            SELECT flag FROM (
              SELECT CASE WHEN COALESCE(rs.duplicate_attempts, 0) >= 3 THEN '重复举报较多' END AS flag
              UNION ALL
              SELECT CASE WHEN COALESCE(rs.invalid_reports, 0) >= 5
                AND COALESCE(rs.invalid_reports, 0)::numeric / GREATEST(COALESCE(rs.total_reports, 1), 1) >= 0.7 THEN '成立率低' END
              UNION ALL
              SELECT CASE WHEN COALESCE(rs.reports_last_24h, 0) >= 10 THEN '短时举报集中' END
              UNION ALL
              SELECT CASE WHEN COALESCE((rs.metadata->>'low_quality')::BOOLEAN, FALSE) THEN '低质量举报队列' END
              UNION ALL
              SELECT CASE WHEN rs.report_restricted_until IS NOT NULL AND rs.report_restricted_until > NOW() THEN '举报功能受限' END
            ) flags
            WHERE flag IS NOT NULL
          ) f
        ), '[]'::jsonb)
    ) AS row_data, ROUND((
      CASE WHEN COALESCE(rs.total_reports, 0) >= 8
        THEN (COALESCE(rs.invalid_reports, 0)::numeric / GREATEST(rs.total_reports, 1)) * 40 ELSE 0 END
      + LEAST(COALESCE(rs.reports_last_24h, 0)::numeric / 20, 1) * 25
      + LEAST(COALESCE(rs.duplicate_attempts, 0)::numeric / 5, 1) * 20
      + CASE WHEN COALESCE((rs.metadata->>'low_quality')::BOOLEAN, FALSE) THEN 10 ELSE 0 END
      + CASE WHEN rs.report_restricted_until IS NOT NULL AND rs.report_restricted_until > NOW() THEN 5 ELSE 0 END
    ), 1) AS risk_score
    FROM public.profiles p
    LEFT JOIN public.user_reporter_stats rs ON rs.user_id = p.id
    WHERE (
        v_query = ''
        OR p.nickname ILIKE '%' || v_query || '%'
        OR p.id::TEXT ILIKE v_query || '%'
      )
      AND (
        p_suspicious IS NULL
        OR (
          p_suspicious
          AND (
            COALESCE(rs.invalid_reports, 0) >= 5
            OR COALESCE(rs.duplicate_attempts, 0) >= 3
            OR COALESCE(rs.reports_last_24h, 0) >= 10
            OR COALESCE((rs.metadata->>'low_quality')::BOOLEAN, FALSE)
          )
        )
      )
    AND (rs.user_id IS NOT NULL OR v_query <> '')
    LIMIT v_limit
  ) sub;

  -- 被举报用户风险：案件、确认违规、限制与近期风险
  SELECT COALESCE(jsonb_agg(row_data ORDER BY risk_score DESC), '[]'::jsonb)
  INTO v_target_users
  FROM (
    SELECT jsonb_build_object(
        'user_id', p.id,
        'nickname', p.nickname,
        'avatar_url', p.avatar_url,
        'moderation_status', p.moderation_status,
        'created_at', p.created_at,
        'total_cases', (
          SELECT COUNT(*)::INTEGER FROM public.moderation_report_cases mc WHERE mc.target_user_id = p.id
        ),
        'pending_cases', (
          SELECT COUNT(*)::INTEGER FROM public.moderation_report_cases mc
          WHERE mc.target_user_id = p.id AND mc.status IN ('pending', 'reviewing')
        ),
        'recent30_cases', (
          SELECT COUNT(*)::INTEGER FROM public.moderation_report_cases mc
          WHERE mc.target_user_id = p.id AND mc.last_reported_at > NOW() - interval '30 days'
        ),
        'recent90_cases', (
          SELECT COUNT(*)::INTEGER FROM public.moderation_report_cases mc
          WHERE mc.target_user_id = p.id AND mc.last_reported_at > NOW() - interval '90 days'
        ),
        'recent_confirmed_violations', (
          SELECT COUNT(*)::INTEGER FROM public.user_violations uv
          WHERE uv.user_id = p.id AND uv.status = 'active'
            AND uv.confirmed_at > NOW() - interval '90 days'
        ),
        'active_violations', (
          SELECT COUNT(*)::INTEGER FROM public.user_violations uv
          WHERE uv.user_id = p.id AND uv.status = 'active'
        ),
        'deleted_items', (
          SELECT COUNT(*)::INTEGER FROM public.user_violations uv
          WHERE uv.user_id = p.id AND uv.metadata->>'action' = 'delete'
        ),
        'active_restrictions', (
          SELECT COUNT(*)::INTEGER FROM public.user_restrictions ur
          WHERE ur.user_id = p.id AND ur.status = 'active'
            AND (ur.ends_at IS NULL OR ur.ends_at > NOW())
        ),
        'latest_case_at', (
          SELECT MAX(mc.last_reported_at) FROM public.moderation_report_cases mc WHERE mc.target_user_id = p.id
        ),
        'latest_priority', (
          SELECT mc.priority FROM public.moderation_report_cases mc
          WHERE mc.target_user_id = p.id AND mc.status IN ('pending', 'reviewing')
          ORDER BY mc.last_reported_at DESC LIMIT 1
        ),
        'risk_score', ROUND((
          LEAST((
            SELECT COUNT(*)::numeric FROM public.moderation_report_cases mc
            WHERE mc.target_user_id = p.id AND mc.last_reported_at > NOW() - interval '30 days'
          ) / 10, 1) * 30
          + LEAST((
            SELECT COUNT(*)::numeric FROM public.user_violations uv
            WHERE uv.user_id = p.id AND uv.status = 'active'
              AND uv.confirmed_at > NOW() - interval '90 days'
          ) / 5, 1) * 40
          + LEAST((
            SELECT COUNT(*)::numeric FROM public.user_restrictions ur
            WHERE ur.user_id = p.id AND ur.status = 'active'
              AND (ur.ends_at IS NULL OR ur.ends_at > NOW())
          ), 1) * 20
          + CASE WHEN (
            SELECT COUNT(*) FROM public.moderation_report_cases mc
            WHERE mc.target_user_id = p.id AND mc.status IN ('pending', 'reviewing')
              AND mc.priority IN ('high', 'urgent')
          ) > 0 THEN 10 ELSE 0 END
        ), 1),
        'risk_level', CASE
          WHEN (
            SELECT COUNT(*) FROM public.user_violations uv
            WHERE uv.user_id = p.id AND uv.status = 'active'
              AND uv.confirmed_at > NOW() - interval '90 days'
          ) >= 3 THEN 'urgent'
          WHEN (
            SELECT COUNT(*) FROM public.moderation_report_cases mc
            WHERE mc.target_user_id = p.id AND mc.status IN ('pending', 'reviewing')
              AND mc.priority IN ('high', 'urgent')
          ) > 0 THEN 'high'
          WHEN (
            SELECT COUNT(*) FROM public.user_violations uv
            WHERE uv.user_id = p.id AND uv.status = 'active'
              AND uv.confirmed_at > NOW() - interval '90 days'
          ) > 0 THEN 'high'
          WHEN (
            SELECT COUNT(*) FROM public.moderation_report_cases mc
            WHERE mc.target_user_id = p.id AND mc.status IN ('pending', 'reviewing')
          ) > 0 THEN 'normal'
          ELSE 'normal' END
    ) AS row_data, ROUND((
      LEAST((
        SELECT COUNT(*)::numeric FROM public.moderation_report_cases mc
        WHERE mc.target_user_id = p.id AND mc.last_reported_at > NOW() - interval '30 days'
      ) / 10, 1) * 30
      + LEAST((
        SELECT COUNT(*)::numeric FROM public.user_violations uv
        WHERE uv.user_id = p.id AND uv.status = 'active'
          AND uv.confirmed_at > NOW() - interval '90 days'
      ) / 5, 1) * 40
      + LEAST((
        SELECT COUNT(*)::numeric FROM public.user_restrictions ur
        WHERE ur.user_id = p.id AND ur.status = 'active'
          AND (ur.ends_at IS NULL OR ur.ends_at > NOW())
      ), 1) * 20
      + CASE WHEN (
        SELECT COUNT(*) FROM public.moderation_report_cases mc
        WHERE mc.target_user_id = p.id AND mc.status IN ('pending', 'reviewing')
          AND mc.priority IN ('high', 'urgent')
      ) > 0 THEN 10 ELSE 0 END
    ), 1) AS risk_score
    FROM public.profiles p
    WHERE (
        v_query = ''
        OR p.nickname ILIKE '%' || v_query || '%'
        OR p.id::TEXT ILIKE v_query || '%'
      )
      AND (
        p_suspicious IS NULL
        OR (
          p_suspicious
          AND EXISTS (
            SELECT 1 FROM public.moderation_report_cases mc
            WHERE mc.target_user_id = p.id
              AND (COALESCE(mc.suspicious_report, FALSE) OR mc.report_count >= 3)
          )
        )
      )
      AND (
        EXISTS (
          SELECT 1 FROM public.moderation_report_cases mc WHERE mc.target_user_id = p.id
        )
        OR EXISTS (
          SELECT 1 FROM public.user_violations uv WHERE uv.user_id = p.id
        )
        OR EXISTS (
          SELECT 1 FROM public.user_restrictions ur WHERE ur.user_id = p.id
        )
    )
    LIMIT v_limit
  ) sub;

  SELECT jsonb_build_object(
    'pending_cases', (
      SELECT COUNT(*)::INTEGER FROM public.moderation_report_cases c
      WHERE c.status IN ('pending', 'reviewing')
    ),
    'kept_cases', (
      SELECT COUNT(*)::INTEGER FROM public.moderation_report_cases c
      WHERE c.status = 'resolved' AND c.outcome = 'kept'
    ),
    'reminded_cases', (
      SELECT COUNT(*)::INTEGER FROM public.moderation_report_cases c
      WHERE c.status = 'resolved' AND c.outcome = 'reminded'
    ),
    'deleted_cases', (
      SELECT COUNT(*)::INTEGER FROM public.moderation_report_cases c
      WHERE c.status = 'resolved' AND c.outcome = 'deleted'
    ),
    'reporter_risk_count', (
      SELECT COUNT(*)::INTEGER FROM public.user_reporter_stats rs
      WHERE rs.invalid_reports >= 5 OR rs.duplicate_attempts >= 3
        OR rs.reports_last_24h >= 10 OR COALESCE((rs.metadata->>'low_quality')::BOOLEAN, FALSE)
    ),
    'target_user_risk_count', (
      SELECT COUNT(*)::INTEGER FROM public.profiles p
      WHERE EXISTS (
        SELECT 1 FROM public.moderation_report_cases mc WHERE mc.target_user_id = p.id
      )
      OR EXISTS (
        SELECT 1 FROM public.user_violations uv WHERE uv.user_id = p.id
      )
    )
  ) INTO v_counts;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'tab', p_tab,
    'cases', v_cases,
    'reporters', v_reporters,
    'target_users', v_target_users,
    'counts', v_counts,
    'filtered', jsonb_build_object(
      'cases', jsonb_array_length(v_cases),
      'reporters', jsonb_array_length(v_reporters),
      'target_users', jsonb_array_length(v_target_users)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_report_center_v1(
  TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, TEXT, INTEGER
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_report_center_v1(
  TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, TEXT, INTEGER
) TO authenticated, service_role;

-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 8. admin_report_center_v2：同步暂时隐藏筛选
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_report_center_v2(
  p_tab TEXT DEFAULT 'cases',
  p_status TEXT DEFAULT 'all',
  p_priority TEXT DEFAULT 'all',
  p_target_type TEXT DEFAULT 'all',
  p_multi_report BOOLEAN DEFAULT NULL,
  p_suspicious BOOLEAN DEFAULT NULL,
  p_service_error BOOLEAN DEFAULT NULL,
  p_low_quality BOOLEAN DEFAULT NULL,
  p_hidden BOOLEAN DEFAULT NULL,
  p_query TEXT DEFAULT '',
  p_limit INTEGER DEFAULT 100
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base JSONB;
  v_cases JSONB;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'not_admin', 'message', '需要管理员权限。');
  END IF;
  IF p_status IN ('all', 'pending', 'kept', 'reminded', 'deleted') THEN
    RETURN public.admin_report_center_v1(
      p_tab, p_status, p_priority, p_target_type,
      p_multi_report, p_suspicious, p_service_error, p_low_quality, p_hidden,
      p_query, p_limit
    );
  END IF;
  IF p_status NOT IN ('reviewing', 'no_violation', 'content_case', 'profile_changes', 'warned', 'restricted', 'suspended', 'banned') THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'invalid_status', 'message', '筛选状态无效。');
  END IF;

  v_base := public.admin_report_center_v1(
    p_tab, 'all', p_priority, p_target_type,
    p_multi_report, p_suspicious, p_service_error, p_low_quality, p_hidden,
    p_query, p_limit
  );
  SELECT COALESCE(jsonb_agg(x || jsonb_build_object(
      'target_moderation_status', COALESCE((
        SELECT p.moderation_status FROM public.profiles p
        WHERE p.id = (x->>'target_user_id')::UUID
      ), ''),
      'active_restrictions', COALESCE((
        SELECT COUNT(*)::INTEGER FROM public.user_restrictions ur
        WHERE ur.user_id = (x->>'target_user_id')::UUID
          AND ur.status = 'active'
          AND (ur.ends_at IS NULL OR ur.ends_at > NOW())
      ), 0)
    )), '[]'::jsonb) INTO v_cases
  FROM jsonb_array_elements(v_base->'cases') AS x
  WHERE CASE
    WHEN p_status = 'reviewing' THEN x->>'status' = 'reviewing'
    ELSE x->>'outcome' = p_status END;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'tab', p_tab,
    'cases', v_cases,
    'reporters', v_base->'reporters',
    'target_users', v_base->'target_users',
    'counts', v_base->'counts',
    'filtered', jsonb_build_object(
      'cases', jsonb_array_length(v_cases),
      'reporters', jsonb_array_length(v_base->'reporters'),
      'target_users', jsonb_array_length(v_base->'target_users')
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_report_center_v2(
  TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, TEXT, INTEGER
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_report_center_v2(
  TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, TEXT, INTEGER
) TO authenticated, service_role;


COMMIT;
