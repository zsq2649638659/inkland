-- Inkland 举报系统闭环 v1（模块 4 + 5）
--
-- 前置：admin-backoffice.sql 已执行；admin-moderation-v1-foundation.sql
--       建议先执行（本迁移会幂等补齐本模块所需的表/列，可单独执行）。
--
-- 本迁移实现：
-- 1. 统一举报提交 submit_report_v1：未登录/举报自己/重复举报/举报限制拦截；
--    同对象待处理举报合并成案件；保存举报时内容快照；发送“举报受理中”通知。
-- 2. 后台处理 admin_resolve_report_case：评论可保留/保留并提醒/删除，
--    作品可保留/删除，用户举报可驳回/记录处理；发送“举报已处理”通知，
--    删除或提醒时通知内容作者，并写确认违规、举报人统计与审计日志。

BEGIN;

-- ============================================================
-- 一、案件表（幂等补齐；与 foundation 完全一致时直接跳过）
-- ============================================================

CREATE TABLE IF NOT EXISTS public.moderation_report_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type TEXT NOT NULL,
  target_id UUID NOT NULL,
  target_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'normal',
  outcome TEXT,
  primary_reason_category TEXT,
  report_count INTEGER NOT NULL DEFAULT 0,
  first_reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT moderation_report_cases_target_type_check
    CHECK (target_type IN ('post', 'comment', 'user')),
  CONSTRAINT moderation_report_cases_status_check
    CHECK (status IN ('pending', 'reviewing', 'resolved', 'cancelled')),
  CONSTRAINT moderation_report_cases_priority_check
    CHECK (priority IN ('normal', 'high', 'urgent')),
  CONSTRAINT moderation_report_cases_outcome_check
    CHECK (outcome IS NULL OR outcome IN (
      'kept', 'reminded', 'deleted', 'content_case', 'profile_changes',
      'warned', 'restricted', 'suspended', 'banned', 'no_violation'
    )),
  CONSTRAINT moderation_report_cases_count_check CHECK (report_count >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS moderation_report_cases_active_target_idx
  ON public.moderation_report_cases (target_type, target_id)
  WHERE status IN ('pending', 'reviewing');
CREATE INDEX IF NOT EXISTS moderation_report_cases_queue_idx
  ON public.moderation_report_cases (status, priority, last_reported_at);
CREATE INDEX IF NOT EXISTS moderation_report_cases_target_user_idx
  ON public.moderation_report_cases (target_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.moderation_report_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL UNIQUE REFERENCES public.moderation_report_cases(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id UUID NOT NULL,
  author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  post_id UUID REFERENCES public.posts(id) ON DELETE SET NULL,
  object_snapshot JSONB NOT NULL,
  context_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT moderation_report_snapshots_target_type_check
    CHECK (target_type IN ('post', 'comment', 'user'))
);

CREATE INDEX IF NOT EXISTS moderation_report_snapshots_target_idx
  ON public.moderation_report_snapshots (target_type, target_id);

-- ============================================================
-- 二、单次举报表补列与重复举报唯一索引
-- ============================================================

ALTER TABLE public.content_reports
  ADD COLUMN IF NOT EXISTS case_id UUID REFERENCES public.moderation_report_cases(id) ON DELETE SET NULL;
ALTER TABLE public.content_reports
  ADD COLUMN IF NOT EXISTS reason_category TEXT;
ALTER TABLE public.content_reports
  ADD COLUMN IF NOT EXISTS details TEXT;
ALTER TABLE public.content_reports
  ADD COLUMN IF NOT EXISTS evidence JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.comment_reports
  ADD COLUMN IF NOT EXISTS case_id UUID REFERENCES public.moderation_report_cases(id) ON DELETE SET NULL;
ALTER TABLE public.comment_reports
  ADD COLUMN IF NOT EXISTS reason_category TEXT;
ALTER TABLE public.comment_reports
  ADD COLUMN IF NOT EXISTS details TEXT;
ALTER TABLE public.comment_reports
  ADD COLUMN IF NOT EXISTS evidence JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS content_reports_case_idx
  ON public.content_reports (case_id, created_at);
CREATE INDEX IF NOT EXISTS comment_reports_case_idx
  ON public.comment_reports (case_id, created_at);

-- 同一举报人对同一对象只允许存在一个待处理举报；旧数据有重复时跳过该索引，
-- 提交函数仍会做应用层拦截，不会产生新的重复待处理举报。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE relname = 'content_reports_active_duplicate_idx'
      AND relnamespace = 'public'::regnamespace
  ) THEN
    BEGIN
      CREATE UNIQUE INDEX content_reports_active_duplicate_idx
        ON public.content_reports (reporter_id, target_type, target_id)
        WHERE status IN ('pending', 'reviewing');
    EXCEPTION
      WHEN duplicate_table OR unique_violation THEN NULL;
    END;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE relname = 'comment_reports_active_duplicate_idx'
      AND relnamespace = 'public'::regnamespace
  ) THEN
    BEGIN
      CREATE UNIQUE INDEX comment_reports_active_duplicate_idx
        ON public.comment_reports (reporter_id, comment_id)
        WHERE status IN ('pending', 'reviewing');
    EXCEPTION
      WHEN duplicate_table OR unique_violation THEN NULL;
    END;
  END IF;
END $$;

-- ============================================================
-- 三、举报人统计与确认违规/限制（幂等补齐）
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_reporter_stats (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  total_reports INTEGER NOT NULL DEFAULT 0,
  pending_reports INTEGER NOT NULL DEFAULT 0,
  valid_reports INTEGER NOT NULL DEFAULT 0,
  invalid_reports INTEGER NOT NULL DEFAULT 0,
  duplicate_attempts INTEGER NOT NULL DEFAULT 0,
  reports_last_24h INTEGER NOT NULL DEFAULT 0,
  last_report_at TIMESTAMPTZ,
  report_restricted_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_reporter_stats_nonnegative_check CHECK (
    total_reports >= 0 AND pending_reports >= 0 AND valid_reports >= 0
    AND invalid_reports >= 0 AND duplicate_attempts >= 0 AND reports_last_24h >= 0
  )
);

CREATE TABLE IF NOT EXISTS public.user_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id UUID,
  content_type TEXT,
  content_id UUID,
  category TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'standard',
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  confirmed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_violations_source_type_check
    CHECK (source_type IN ('post_review', 'report_case', 'manual')),
  CONSTRAINT user_violations_content_type_check
    CHECK (content_type IS NULL OR content_type IN ('post', 'comment', 'profile', 'account')),
  CONSTRAINT user_violations_severity_check
    CHECK (severity IN ('minor', 'standard', 'serious', 'critical')),
  CONSTRAINT user_violations_status_check
    CHECK (status IN ('active', 'revoked'))
);

CREATE TABLE IF NOT EXISTS public.user_restrictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  restriction_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  reason TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  lifted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  lifted_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_restrictions_type_check
    CHECK (restriction_type IN ('comment', 'publish', 'report', 'account')),
  CONSTRAINT user_restrictions_status_check
    CHECK (status IN ('active', 'expired', 'lifted')),
  CONSTRAINT user_restrictions_time_check
    CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS user_reporter_stats_report_restricted_idx
  ON public.user_reporter_stats (report_restricted_until)
  WHERE report_restricted_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS user_violations_user_time_idx
  ON public.user_violations (user_id, confirmed_at DESC);
CREATE INDEX IF NOT EXISTS user_restrictions_active_user_idx
  ON public.user_restrictions (user_id, restriction_type, ends_at)
  WHERE status = 'active';

-- 通知补列（foundation 已加时直接跳过）
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS template_key TEXT;
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS related_entity_type TEXT;
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS related_entity_id UUID;
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'sent';
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS notifications_related_entity_idx
  ON public.notifications (related_entity_type, related_entity_id, created_at DESC);

ALTER TABLE public.admin_audit_logs
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ============================================================
-- 四、统一举报提交函数
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
  reporter_id UUID;
  target_user_id UUID;
  post_record public.posts%ROWTYPE;
  comment_record public.comments%ROWTYPE;
  profile_record public.profiles%ROWTYPE;
  case_id UUID;
  active_case public.moderation_report_cases%ROWTYPE;
  object_snapshot JSONB;
  context_snapshot JSONB;
  now_ts TIMESTAMPTZ := NOW();
BEGIN
  reporter_id := auth.uid();
  IF reporter_id IS NULL THEN
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
    WHERE user_id = reporter_id
      AND restriction_type = 'report'
      AND status = 'active'
      AND (ends_at IS NULL OR ends_at > now_ts)
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'report_restricted', 'message', '你的举报功能暂时受限，无法提交举报。');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_reporter_stats
    WHERE user_id = reporter_id
      AND report_restricted_until IS NOT NULL
      AND report_restricted_until > now_ts
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'report_restricted', 'message', '你的举报功能暂时受限，无法提交举报。');
  END IF;

  -- 不能举报自己
  IF p_target_type = 'user' THEN
    IF p_target_id = reporter_id THEN
      RETURN jsonb_build_object('ok', FALSE, 'code', 'self_report', 'message', '不能举报自己的账号。');
    END IF;
    SELECT * INTO profile_record FROM public.profiles WHERE id = p_target_id;
    IF profile_record.id IS NULL THEN
      RETURN jsonb_build_object('ok', FALSE, 'code', 'target_missing', 'message', '该用户不存在或已被删除。');
    END IF;
    target_user_id := profile_record.id;
    object_snapshot := jsonb_build_object(
      'nickname', profile_record.nickname,
      'avatar_url', profile_record.avatar_url,
      'bio', profile_record.bio,
      'moderation_status', profile_record.moderation_status,
      'created_at', profile_record.created_at
    );
    context_snapshot := '{}'::jsonb;
  ELSIF p_target_type = 'post' THEN
    SELECT * INTO post_record FROM public.posts WHERE id = p_target_id;
    IF post_record.id IS NULL THEN
      RETURN jsonb_build_object('ok', FALSE, 'code', 'target_missing', 'message', '该作品已不存在，无法继续举报。');
    END IF;
    IF post_record.user_id = reporter_id THEN
      RETURN jsonb_build_object('ok', FALSE, 'code', 'self_report', 'message', '不能举报自己的作品。');
    END IF;
    IF COALESCE(post_record.status, '') <> 'published'
       OR COALESCE(post_record.visibility, 'public') <> 'public' THEN
      RETURN jsonb_build_object('ok', FALSE, 'code', 'target_unavailable', 'message', '该作品已下架，无法继续举报。');
    END IF;
    target_user_id := post_record.user_id;
    object_snapshot := jsonb_build_object(
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
    context_snapshot := jsonb_build_object(
      'author_id', post_record.user_id,
      'author_nickname', profile_record.nickname,
      'author_avatar_url', profile_record.avatar_url
    );
  ELSE
    SELECT * INTO comment_record FROM public.comments WHERE id = p_target_id;
    IF comment_record.id IS NULL THEN
      RETURN jsonb_build_object('ok', FALSE, 'code', 'target_missing', 'message', '该评论已不存在，无法继续举报。');
    END IF;
    IF comment_record.user_id = reporter_id THEN
      RETURN jsonb_build_object('ok', FALSE, 'code', 'self_report', 'message', '不能举报自己的评论。');
    END IF;
    target_user_id := comment_record.user_id;
    object_snapshot := jsonb_build_object(
      'content', comment_record.content,
      'parent_id', comment_record.parent_id,
      'paragraph_index', comment_record.paragraph_index,
      'created_at', comment_record.created_at
    );
    context_snapshot := jsonb_build_object(
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
    context_snapshot := context_snapshot || jsonb_build_object(
      'comment_author_id', comment_record.user_id,
      'comment_author_nickname', profile_record.nickname,
      'comment_author_avatar_url', profile_record.avatar_url
    );
  END IF;

  -- 同一举报人同一对象已有待处理举报
  IF p_target_type = 'comment' THEN
    IF EXISTS (
      SELECT 1 FROM public.comment_reports cr
      WHERE cr.reporter_id = reporter_id AND cr.comment_id = p_target_id
        AND cr.status IN ('pending', 'reviewing')
    ) THEN
      UPDATE public.user_reporter_stats
      SET duplicate_attempts = duplicate_attempts + 1, updated_at = now_ts
      WHERE user_id = reporter_id;
      RETURN jsonb_build_object('ok', FALSE, 'code', 'duplicate', 'message', '你已举报过该内容，平台正在处理中，请勿重复举报。');
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.content_reports cr
      WHERE cr.reporter_id = reporter_id
        AND cr.target_type = p_target_type
        AND cr.target_id = p_target_id
        AND cr.status IN ('pending', 'reviewing')
    ) THEN
      UPDATE public.user_reporter_stats
      SET duplicate_attempts = duplicate_attempts + 1, updated_at = now_ts
      WHERE user_id = reporter_id;
      RETURN jsonb_build_object('ok', FALSE, 'code', 'duplicate', 'message', '你已举报过该内容，平台正在处理中，请勿重复举报。');
    END IF;
  END IF;

  -- 每日举报次数上限（第一版固定 20 次/天，后台可在 user_reporter_stats 调整）
  IF EXISTS (
    SELECT 1 FROM public.user_reporter_stats
    WHERE user_id = reporter_id
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
      p_target_type, p_target_id, target_user_id, 'pending', 'normal',
      btrim(p_reason_category), 1, now_ts, now_ts,
      jsonb_build_object('first_reason_category', btrim(p_reason_category))
    ) RETURNING id INTO case_id;
  ELSE
    case_id := active_case.id;
    UPDATE public.moderation_report_cases
    SET report_count = report_count + 1,
        last_reported_at = now_ts,
        primary_reason_category = COALESCE(primary_reason_category, btrim(p_reason_category)),
        metadata = metadata || jsonb_build_object(
          'last_reason_category', btrim(p_reason_category),
          'last_details', btrim(COALESCE(p_details, ''))
        ),
        updated_at = now_ts
    WHERE id = case_id;
  END IF;

  IF p_target_type = 'comment' THEN
    INSERT INTO public.comment_reports (
      comment_id, reporter_id, reason, reason_category, details, evidence,
      case_id, status, created_at
    ) VALUES (
      p_target_id, reporter_id, btrim(p_reason_category),
      btrim(p_reason_category), btrim(COALESCE(p_details, '')), COALESCE(p_evidence, '{}'::jsonb),
      case_id, 'pending', now_ts
    );
  ELSE
    INSERT INTO public.content_reports (
      target_type, target_id, reporter_id, reason, reason_category, details, evidence,
      case_id, status, created_at
    ) VALUES (
      p_target_type, p_target_id, reporter_id, btrim(p_reason_category),
      btrim(p_reason_category), btrim(COALESCE(p_details, '')), COALESCE(p_evidence, '{}'::jsonb),
      case_id, 'pending', now_ts
    );
  END IF;

  INSERT INTO public.moderation_report_snapshots (
    case_id, target_type, target_id, author_id, post_id, object_snapshot, context_snapshot, captured_at
  ) VALUES (
    case_id, p_target_type, p_target_id,
    CASE WHEN p_target_type = 'comment' THEN comment_record.user_id
         WHEN p_target_type = 'post' THEN post_record.user_id
         ELSE profile_record.id END,
    CASE WHEN p_target_type = 'comment' THEN comment_record.post_id
         WHEN p_target_type = 'post' THEN post_record.id
         ELSE NULL END,
    object_snapshot, context_snapshot, now_ts
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
    reporter_id, 'system', NULL, NULL,
    '你的举报已受理，平台正在处理中。', FALSE, now_ts,
    'report_received', p_target_type, p_target_id,
    jsonb_build_object('case_id', case_id, 'target_type', p_target_type, 'target_id', p_target_id),
    'sent', now_ts
  );

  INSERT INTO public.user_reporter_stats (
    user_id, total_reports, pending_reports, reports_last_24h,
    last_report_at, updated_at
  ) VALUES (
    reporter_id, 1, 1, 1, now_ts, now_ts
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
    'case_id', case_id,
    'message', '举报已提交，我们会尽快处理。'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_report_v1(TEXT, UUID, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_report_v1(TEXT, UUID, TEXT, TEXT, JSONB)
  TO authenticated, service_role;

-- ============================================================
-- 五、后台处理举报案件函数
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
  outcome TEXT;
  now_ts TIMESTAMPTZ := NOW();
  report_ids UUID[] := '{}';
  reporter_ids UUID[] := '{}';
  reporter_count INTEGER := 0;
  reporter_id UUID;
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

  outcome := CASE p_action
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

  -- 删除内容（快照仍保留，供后台查看）
  IF p_action = 'delete' AND case_record.target_type = 'comment' THEN
    DELETE FROM public.comments WHERE id = case_record.target_id;
  ELSIF p_action = 'delete' AND case_record.target_type = 'post' THEN
    DELETE FROM public.posts WHERE id = case_record.target_id;
  END IF;

  UPDATE public.moderation_report_cases
  SET status = 'resolved',
      outcome = outcome,
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
      reporter_count := reporter_count + 1;
    END IF;
  END LOOP;

  -- 举报人统计与“举报已处理”通知
  FOREACH reporter_id IN ARRAY reporter_ids
  LOOP
    INSERT INTO public.user_reporter_stats (
      user_id, total_reports, pending_reports, valid_reports, invalid_reports,
      updated_at
    ) VALUES (
      reporter_id, 0, 0,
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
      reporter_id, 'system', NULL, NULL,
      '你提交的举报已处理完成，感谢你的反馈。', FALSE, now_ts,
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
    'outcome', outcome,
    'message', '举报案件已处理完成。'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_resolve_report_case(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_resolve_report_case(UUID, TEXT, TEXT)
  TO authenticated, service_role;

-- ============================================================
-- 六、RLS 兜底（幂等）
-- ============================================================

ALTER TABLE public.moderation_report_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_report_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_reporter_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_restrictions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS moderation_report_cases_admin_all ON public.moderation_report_cases;
CREATE POLICY moderation_report_cases_admin_all ON public.moderation_report_cases
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS moderation_report_snapshots_admin_all ON public.moderation_report_snapshots;
CREATE POLICY moderation_report_snapshots_admin_all ON public.moderation_report_snapshots
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS user_reporter_stats_admin_select ON public.user_reporter_stats;
CREATE POLICY user_reporter_stats_admin_select ON public.user_reporter_stats
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS user_violations_admin_all ON public.user_violations;
CREATE POLICY user_violations_admin_all ON public.user_violations
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS user_restrictions_self_select ON public.user_restrictions;
CREATE POLICY user_restrictions_self_select ON public.user_restrictions
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());
DROP POLICY IF EXISTS user_restrictions_admin_all ON public.user_restrictions;
CREATE POLICY user_restrictions_admin_all ON public.user_restrictions
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

COMMIT;

-- ============================================================
-- 执行后只读核验（单独运行）
-- ============================================================
-- SELECT proname FROM pg_proc
-- WHERE proname IN ('submit_report_v1', 'admin_resolve_report_case');
-- SELECT to_regclass('public.moderation_report_cases');
-- SELECT to_regclass('public.moderation_report_snapshots');
