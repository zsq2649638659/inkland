-- Inkland 评论审核 v1
-- 目的：为评论、段评和回复建立独立的关键词人工审核链路。
-- 说明：
-- 1. 不复用 moderation_review_cases（作品审核）或 moderation_report_cases（举报案件）。
-- 2. 只处理迁移执行后的新评论，不回填历史评论。
-- 3. 命中规则只进入人工审核，不在触发器中自动删除评论。
-- 4. 低/中/高风险阈值沿用 moderation_rules.risk_level/min_hits。

SET lock_timeout = '10s';

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.comments') IS NULL
    OR to_regclass('public.moderation_rules') IS NULL
    OR to_regclass('public.profiles') IS NULL
    OR to_regclass('public.posts') IS NULL
    OR to_regclass('public.admin_audit_logs') IS NULL
    OR to_regclass('public.notifications') IS NULL THEN
    RAISE EXCEPTION '缺少评论审核前置表，请先执行评论表、审核基础表和后台基础表迁移';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.comment_moderation_review_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID REFERENCES public.comments(id) ON DELETE SET NULL,
  post_id UUID REFERENCES public.posts(id) ON DELETE SET NULL,
  author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'normal',
  route_reason TEXT NOT NULL DEFAULT '评论文本命中审核关键词',
  screening_status TEXT NOT NULL DEFAULT 'completed',
  screening_sources TEXT[] NOT NULL DEFAULT ARRAY['keyword'],
  screening_result JSONB NOT NULL DEFAULT '{}'::jsonb,
  rules_version TEXT NOT NULL DEFAULT 'keyword-v1',
  submission_number INTEGER NOT NULL DEFAULT 1,
  comment_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  decision_reason TEXT,
  decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT comment_review_cases_status_check CHECK (status IN ('pending', 'reviewing', 'approved', 'reminded', 'deleted', 'cancelled')),
  CONSTRAINT comment_review_cases_priority_check CHECK (priority IN ('normal', 'high')),
  CONSTRAINT comment_review_cases_screening_status_check CHECK (screening_status IN ('completed', 'failed'))
);

ALTER TABLE public.comment_moderation_review_cases
  ADD COLUMN IF NOT EXISTS parent_id UUID,
  ADD COLUMN IF NOT EXISTS paragraph_index INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS comment_review_cases_active_idx
  ON public.comment_moderation_review_cases (comment_id)
  WHERE status IN ('pending', 'reviewing') AND comment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS comment_review_cases_queue_idx
  ON public.comment_moderation_review_cases (status, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS comment_review_cases_post_idx
  ON public.comment_moderation_review_cases (post_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.comment_moderation_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_case_id UUID NOT NULL REFERENCES public.comment_moderation_review_cases(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'keyword',
  category TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'review',
  status TEXT NOT NULL DEFAULT 'suggested',
  location_type TEXT NOT NULL DEFAULT 'text_range',
  start_offset INTEGER,
  end_offset INTEGER,
  quoted_text TEXT,
  details TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT comment_findings_status_check CHECK (status IN ('suggested', 'confirmed', 'dismissed')),
  CONSTRAINT comment_findings_severity_check CHECK (severity IN ('review', 'high'))
);

CREATE INDEX IF NOT EXISTS comment_moderation_findings_case_idx
  ON public.comment_moderation_findings (review_case_id, created_at);

CREATE OR REPLACE FUNCTION public.comment_count_non_overlapping_matches(haystack TEXT, needle TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  v_haystack TEXT := lower(COALESCE(haystack, ''));
  v_needle TEXT := lower(COALESCE(needle, ''));
  v_from INTEGER := 1;
  v_found INTEGER;
  v_count INTEGER := 0;
BEGIN
  IF v_haystack = '' OR v_needle = '' THEN
    RETURN 0;
  END IF;
  LOOP
    v_found := position(v_needle IN substr(v_haystack, v_from));
    EXIT WHEN v_found = 0;
    v_count := v_count + 1;
    v_from := v_from + v_found - 1 + char_length(v_needle);
    EXIT WHEN v_from > char_length(v_haystack);
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_comment_review_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comment_review_cases_set_updated_at ON public.comment_moderation_review_cases;
CREATE TRIGGER comment_review_cases_set_updated_at
BEFORE UPDATE ON public.comment_moderation_review_cases
FOR EACH ROW EXECUTE FUNCTION public.set_comment_review_updated_at();

CREATE OR REPLACE FUNCTION public.screen_comment_submission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rule_row RECORD;
  v_match_count INTEGER;
  v_min_hits INTEGER;
  v_qualified_count INTEGER := 0;
  v_total_hits INTEGER := 0;
  v_finding_count INTEGER := 0;
  v_has_high_risk BOOLEAN := FALSE;
  v_case_id UUID;
  v_from INTEGER;
  v_relative_start INTEGER;
  v_absolute_start INTEGER;
  v_priority TEXT := 'normal';
BEGIN
  IF TG_OP <> 'INSERT' OR btrim(COALESCE(NEW.content, '')) = '' THEN
    RETURN NEW;
  END IF;

  -- 先统计命中规则，只有达到该规则阈值的评论才创建人工审核案件。
  FOR rule_row IN
    SELECT keyword.id, keyword.pattern, keyword.category, keyword.severity,
           COALESCE(keyword.risk_level, CASE WHEN keyword.severity = 'high' THEN 'high' ELSE 'medium' END) AS risk_level,
           GREATEST(COALESCE(keyword.min_hits, CASE WHEN keyword.severity = 'high' THEN 1 WHEN keyword.severity = 'review' THEN 3 ELSE 5 END), 1) AS min_hits
    FROM public.moderation_rules keyword
    WHERE keyword.rule_type = 'keyword'
      AND keyword.enabled = TRUE
      AND position(lower(keyword.pattern) IN lower(NEW.content)) > 0
      AND NOT EXISTS (
        SELECT 1
        FROM public.moderation_rules whitelist
        WHERE whitelist.rule_type = 'whitelist'
          AND whitelist.enabled = TRUE
          AND whitelist.category = keyword.category
          AND lower(whitelist.pattern) = lower(keyword.pattern)
      )
  LOOP
    v_match_count := public.comment_count_non_overlapping_matches(NEW.content, rule_row.pattern);
    v_total_hits := v_total_hits + v_match_count;
    UPDATE public.moderation_rules
    SET hit_count = hit_count + v_match_count, last_hit_at = NOW()
    WHERE id = rule_row.id;

    IF v_match_count >= rule_row.min_hits THEN
      v_qualified_count := v_qualified_count + 1;
      v_has_high_risk := v_has_high_risk OR rule_row.risk_level = 'high' OR rule_row.severity = 'high';
    END IF;
  END LOOP;

  IF v_qualified_count = 0 THEN
    RETURN NEW;
  END IF;

  IF v_has_high_risk THEN
    v_priority := 'high';
  END IF;

  INSERT INTO public.comment_moderation_review_cases (
    comment_id, post_id, author_id, parent_id, paragraph_index, status, priority, route_reason,
    screening_status, screening_sources, screening_result, rules_version,
    submission_number, comment_snapshot
  ) VALUES (
    NEW.id, NEW.post_id, NEW.user_id, NEW.parent_id, NEW.paragraph_index, 'pending', v_priority,
    '评论文本命中审核关键词', 'completed', ARRAY['keyword'],
    jsonb_build_object('engine', 'keyword-v1', 'qualified_rules', v_qualified_count, 'total_hits', v_total_hits),
    'keyword-v1', 1,
    jsonb_build_object(
      'id', NEW.id, 'post_id', NEW.post_id, 'user_id', NEW.user_id,
      'parent_id', NEW.parent_id, 'paragraph_index', NEW.paragraph_index,
      'content', NEW.content, 'created_at', NEW.created_at
    )
  ) RETURNING id INTO v_case_id;

  -- 保存达到阈值的规则命中位置，最多保留 50 条，避免单条评论造成过大的审核记录。
  FOR rule_row IN
    SELECT keyword.id, keyword.pattern, keyword.category, keyword.severity,
           COALESCE(keyword.risk_level, CASE WHEN keyword.severity = 'high' THEN 'high' ELSE 'medium' END) AS risk_level,
           GREATEST(COALESCE(keyword.min_hits, CASE WHEN keyword.severity = 'high' THEN 1 WHEN keyword.severity = 'review' THEN 3 ELSE 5 END), 1) AS min_hits
    FROM public.moderation_rules keyword
    WHERE keyword.rule_type = 'keyword'
      AND keyword.enabled = TRUE
      AND position(lower(keyword.pattern) IN lower(NEW.content)) > 0
      AND NOT EXISTS (
        SELECT 1
        FROM public.moderation_rules whitelist
        WHERE whitelist.rule_type = 'whitelist'
          AND whitelist.enabled = TRUE
          AND whitelist.category = keyword.category
          AND lower(whitelist.pattern) = lower(keyword.pattern)
      )
  LOOP
    v_match_count := public.comment_count_non_overlapping_matches(NEW.content, rule_row.pattern);
    IF v_match_count < rule_row.min_hits THEN
      CONTINUE;
    END IF;

    v_from := 1;
    WHILE v_from <= char_length(NEW.content) AND v_finding_count < 50 LOOP
      v_relative_start := position(lower(rule_row.pattern) IN lower(substr(NEW.content, v_from)));
      EXIT WHEN v_relative_start = 0;
      v_absolute_start := v_from + v_relative_start - 2;
      INSERT INTO public.comment_moderation_findings (
        review_case_id, source, category, severity, location_type,
        start_offset, end_offset, quoted_text, details, metadata
      ) VALUES (
        v_case_id, 'keyword', rule_row.category, rule_row.severity, 'text_range',
        v_absolute_start, v_absolute_start + char_length(rule_row.pattern), rule_row.pattern,
        '评论文本命中审核关键词', jsonb_build_object('rule_id', rule_row.id, 'pattern', rule_row.pattern, 'risk_level', rule_row.risk_level)
      );
      v_finding_count := v_finding_count + 1;
      v_from := v_from + v_relative_start - 1 + char_length(rule_row.pattern);
    END LOOP;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comments_screen_submission ON public.comments;
CREATE TRIGGER comments_screen_submission
AFTER INSERT ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.screen_comment_submission();

CREATE OR REPLACE FUNCTION public.admin_decide_comment_review(
  p_case_id UUID,
  p_admin_id UUID,
  p_action TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_case public.comment_moderation_review_cases%ROWTYPE;
  v_comment public.comments%ROWTYPE;
  v_comment_exists BOOLEAN := FALSE;
  v_status TEXT;
  v_note TEXT := left(btrim(COALESCE(p_reason, '')), 200);
  v_action_label TEXT;
  v_template_key TEXT;
  v_notification TEXT;
  v_post_id UUID;
  v_author_id UUID;
  v_comment_id UUID;
BEGIN
  IF p_admin_id IS NULL THEN
    RAISE EXCEPTION 'admin_required';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  IF p_action NOT IN ('approve', 'remind', 'delete') THEN
    RAISE EXCEPTION 'comment_review_action_invalid';
  END IF;

  SELECT * INTO v_case
  FROM public.comment_moderation_review_cases
  WHERE id = p_case_id
  FOR UPDATE;
  IF v_case.id IS NULL THEN
    RAISE EXCEPTION 'comment_review_case_not_found';
  END IF;
  IF v_case.status NOT IN ('pending', 'reviewing') THEN
    RAISE EXCEPTION 'comment_review_case_not_actionable';
  END IF;

  v_comment_id := v_case.comment_id;
  v_post_id := v_case.post_id;
  v_author_id := v_case.author_id;
  IF v_comment_id IS NOT NULL THEN
    SELECT * INTO v_comment FROM public.comments WHERE id = v_comment_id;
    v_comment_exists := v_comment.id IS NOT NULL;
    IF v_comment_exists THEN
      v_post_id := v_comment.post_id;
      v_author_id := v_comment.user_id;
    END IF;
  END IF;

  IF NOT v_comment_exists AND p_action <> 'delete' THEN
    RAISE EXCEPTION 'comment_not_found';
  END IF;

  v_status := CASE p_action WHEN 'approve' THEN 'approved' WHEN 'remind' THEN 'reminded' ELSE 'deleted' END;
  v_action_label := CASE p_action WHEN 'approve' THEN '放行评论' WHEN 'remind' THEN '放行并提醒评论发布者' ELSE '删除评论并警告发布者' END;
  v_template_key := CASE p_action WHEN 'remind' THEN 'comment_civility_reminder' WHEN 'delete' THEN 'comment_deleted' ELSE NULL END;
  v_notification := CASE p_action
    WHEN 'remind' THEN '你的评论已通过审核，但请注意文明交流，避免使用攻击、骚扰或威胁性语言。'
    WHEN 'delete' THEN '你的一条评论因违反社区规则已被删除。'
    ELSE NULL
  END;

  UPDATE public.comment_moderation_review_cases
  SET status = v_status,
      decision_reason = NULLIF(v_note, ''),
      decided_by = p_admin_id,
      decided_at = NOW()
  WHERE id = p_case_id;

  INSERT INTO public.admin_audit_logs (admin_id, action, target_type, target_id, note, metadata)
  VALUES (
    p_admin_id, 'comment_review_' || p_action, 'comment', v_comment_id,
    COALESCE(NULLIF(v_note, ''), v_action_label),
    jsonb_build_object('case_id', p_case_id, 'action', p_action, 'status', v_status)
  );

  IF p_action = 'delete' AND v_comment_exists THEN
    DELETE FROM public.comments WHERE id = v_comment_id;
  END IF;

  IF v_notification IS NOT NULL AND v_author_id IS NOT NULL THEN
    INSERT INTO public.notifications (
      user_id, type, actor_id, post_id, content, read, created_at,
      template_key, related_entity_type, related_entity_id, metadata,
      delivery_status, sent_at
    ) VALUES (
      v_author_id, 'system', NULL, v_post_id, v_notification, FALSE, NOW(),
      v_template_key, 'comment', v_comment_id,
      jsonb_build_object('case_id', p_case_id, 'action', p_action, 'reason', v_note),
      'sent', NOW()
    );
  END IF;

  RETURN jsonb_build_object('ok', TRUE, 'status', v_status, 'action', p_action);
END;
$$;

ALTER TABLE public.comment_moderation_review_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_moderation_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS comment_review_cases_admin_all ON public.comment_moderation_review_cases;
CREATE POLICY comment_review_cases_admin_all ON public.comment_moderation_review_cases
FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS comment_review_findings_admin_all ON public.comment_moderation_findings;
CREATE POLICY comment_review_findings_admin_all ON public.comment_moderation_findings
FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

REVOKE ALL ON FUNCTION public.comment_count_non_overlapping_matches(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.screen_comment_submission() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_decide_comment_review(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_decide_comment_review(UUID, UUID, TEXT, TEXT) TO authenticated, service_role;

COMMIT;

-- 执行后核验：
-- SELECT to_regclass('public.comment_moderation_review_cases');
-- SELECT to_regclass('public.comment_moderation_findings');
-- SELECT tgname FROM pg_trigger WHERE tgname = 'comments_screen_submission';
-- SELECT to_regprocedure('public.admin_decide_comment_review(uuid,uuid,text,text)');
