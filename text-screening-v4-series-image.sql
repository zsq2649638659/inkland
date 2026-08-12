-- Inkland 文字审核 v4
-- 目的：
-- 1. 图片作品的标题、说明也走违规词库；
-- 2. 长篇章节沿用 posts 的文字审核；
-- 3. 连载名称、简介使用独立审核记录；
-- 4. 不覆盖 NSFWJS/NudeNet 的 v3 语义，只扩展图片审核回写逻辑。
--
-- 本迁移是增量迁移，不删除作品、用户或已有审核记录。

SET lock_timeout = '10s';

-- ============================================================
-- 一、连载元数据审核基础字段与记录表
-- ============================================================

ALTER TABLE public.series
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS review_reason TEXT,
  ADD COLUMN IF NOT EXISTS review_submission_number INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.series'::regclass
      AND conname = 'series_review_status_check'
  ) THEN
    ALTER TABLE public.series
      ADD CONSTRAINT series_review_status_check
      CHECK (review_status IN ('approved', 'pending', 'rejected'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.series_moderation_review_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES public.series(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'normal',
  route_reason TEXT NOT NULL DEFAULT '连载信息命中审核关键词',
  screening_status TEXT NOT NULL DEFAULT 'completed',
  screening_sources TEXT[] NOT NULL DEFAULT ARRAY['keyword'],
  screening_result JSONB NOT NULL DEFAULT '{}'::jsonb,
  rules_version TEXT NOT NULL DEFAULT 'keyword-v1',
  submission_number INTEGER NOT NULL DEFAULT 1,
  decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT series_review_cases_status_check CHECK (status IN ('pending', 'reviewing', 'approved', 'changes_requested', 'cancelled')),
  CONSTRAINT series_review_cases_priority_check CHECK (priority IN ('normal', 'high'))
);

CREATE UNIQUE INDEX IF NOT EXISTS series_review_cases_active_idx
  ON public.series_moderation_review_cases (series_id)
  WHERE status IN ('pending', 'reviewing');

CREATE TABLE IF NOT EXISTS public.series_moderation_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_case_id UUID NOT NULL REFERENCES public.series_moderation_review_cases(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'keyword',
  category TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'review',
  location_type TEXT NOT NULL DEFAULT 'text_range',
  start_offset INTEGER,
  end_offset INTEGER,
  quoted_text TEXT,
  details TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 审核记录只允许后台管理员读取/处理；service_role 用于服务端写入。
ALTER TABLE public.series_moderation_review_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.series_moderation_findings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'series_moderation_review_cases'
      AND policyname = 'series_review_cases_admin_all'
  ) THEN
    CREATE POLICY series_review_cases_admin_all ON public.series_moderation_review_cases
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'series_moderation_findings'
      AND policyname = 'series_review_findings_admin_all'
  ) THEN
    CREATE POLICY series_review_findings_admin_all ON public.series_moderation_findings
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.screen_series_submission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  combined_text TEXT;
  next_submission INTEGER;
  case_id UUID;
  rule_row RECORD;
  match_offset INTEGER;
  matched_count INTEGER := 0;
  has_high_risk BOOLEAN := FALSE;
BEGIN
  -- 兼容早期曾创建过的 BEFORE 版本触发器：让它只放行，真正审核交给下面的 AFTER 触发器。
  IF EXISTS (
    SELECT 1
    FROM pg_trigger trigger_row
    WHERE trigger_row.tgrelid = 'public.series'::regclass
      AND trigger_row.tgname = TG_NAME
      AND NOT trigger_row.tgisinternal
      AND pg_get_triggerdef(trigger_row.oid) ILIKE '% BEFORE %'
  ) THEN
    RETURN NEW;
  END IF;

  combined_text := COALESCE(NEW.name, '') || E'\n' || COALESCE(NEW.description, '');
  next_submission := GREATEST(COALESCE(NEW.review_submission_number, 0), 0) + 1;
  -- 修改后重新提交时，关闭上一轮未完成案件，避免同一个连载同时存在多个活动案件。
  UPDATE public.series_moderation_review_cases
  SET status = 'cancelled', updated_at = NOW()
  WHERE series_id = NEW.id
    AND status IN ('pending', 'reviewing');

  FOR rule_row IN
    SELECT keyword.id, keyword.pattern, keyword.category, keyword.severity
    FROM public.moderation_rules keyword
    WHERE keyword.rule_type = 'keyword'
      AND keyword.enabled = TRUE
      AND position(lower(keyword.pattern) IN lower(combined_text)) > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.moderation_rules whitelist
        WHERE whitelist.rule_type = 'whitelist'
          AND whitelist.enabled = TRUE
          AND whitelist.category = keyword.category
          AND lower(whitelist.pattern) = lower(keyword.pattern)
      )
  LOOP
    IF case_id IS NULL THEN
      INSERT INTO public.series_moderation_review_cases (
        series_id, author_id, status, priority, route_reason,
        screening_status, screening_sources, screening_result,
        rules_version, submission_number
      ) VALUES (
        NEW.id, NEW.user_id, 'pending',
        CASE WHEN rule_row.severity = 'high' THEN 'high' ELSE 'normal' END,
        '连载名称或简介命中审核关键词', 'completed', ARRAY['keyword'],
        jsonb_build_object('engine', 'keyword-v1'), 'keyword-v1', next_submission
      ) RETURNING id INTO case_id;
    END IF;

    match_offset := position(lower(rule_row.pattern) IN lower(combined_text));
    INSERT INTO public.series_moderation_findings (
      review_case_id, category, severity, start_offset, end_offset,
      quoted_text, details, metadata
    ) VALUES (
      case_id, rule_row.category, rule_row.severity,
      match_offset - 1,
      match_offset - 1 + char_length(rule_row.pattern),
      rule_row.pattern, '连载名称或简介命中审核关键词',
      jsonb_build_object('rule_id', rule_row.id, 'pattern', rule_row.pattern)
    );
    matched_count := matched_count + 1;
    has_high_risk := has_high_risk OR rule_row.severity = 'high';
    UPDATE public.moderation_rules
    SET hit_count = hit_count + 1, last_hit_at = NOW()
    WHERE id = rule_row.id;
  END LOOP;

  IF matched_count > 0 THEN
    UPDATE public.series
    SET review_status = 'pending',
        review_reason = '连载名称或简介已进入人工审核。',
        review_submission_number = next_submission,
        reviewed_at = NULL
    WHERE id = NEW.id;
  ELSE
    UPDATE public.series
    SET review_status = 'approved',
        review_reason = NULL,
        review_submission_number = next_submission,
        reviewed_at = NOW()
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.series'::regclass
      AND tgname = 'series_screen_submission_after'
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER series_screen_submission_after
    AFTER INSERT OR UPDATE OF name, description ON public.series
    FOR EACH ROW EXECUTE FUNCTION public.screen_series_submission();
  END IF;
END $$;

-- 让未审核连载不出现在公共页面，但作者本人仍可查看和继续编辑。
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'series'
      AND policyname = 'series_public_read'
  ) THEN
    ALTER POLICY series_public_read ON public.series
    USING (review_status = 'approved' OR auth.uid() = user_id);
  ELSE
    CREATE POLICY series_public_read ON public.series
    FOR SELECT USING (review_status = 'approved' OR auth.uid() = user_id);
  END IF;
END $$;

-- ============================================================
-- 二、图片标题/说明与章节文字审核
-- ============================================================

CREATE OR REPLACE FUNCTION public.screen_post_submission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  combined_text TEXT;
  next_version_number INTEGER;
  next_submission_number INTEGER;
  version_id UUID;
  review_case_id UUID;
  rule_row RECORD;
  match_offset INTEGER;
  matched_count INTEGER := 0;
  has_high_risk BOOLEAN := FALSE;
  requested_visibility TEXT;
BEGIN
  IF NEW.review_status IS DISTINCT FROM 'pending'
     OR COALESCE(NEW.visibility, 'public') = 'private' THEN
    RETURN NEW;
  END IF;

  requested_visibility := CASE
    WHEN NEW.pending_visibility IN ('public', 'followers_only', 'private') THEN NEW.pending_visibility
    WHEN NEW.visibility IN ('public', 'followers_only', 'private') THEN NEW.visibility
    ELSE 'public'
  END;
  combined_text := COALESCE(NEW.title, '') || E'\n' || COALESCE(NEW.content, '');
  next_version_number := CASE
    WHEN TG_OP = 'INSERT' THEN GREATEST(COALESCE(NEW.current_version_number, 1), 1)
    ELSE GREATEST(COALESCE(NEW.current_version_number, 0), 0) + 1
  END;
  next_submission_number := GREATEST(COALESCE(NEW.review_submission_number, 0), 0) + 1;
  NEW.current_version_number := next_version_number;
  NEW.review_submission_number := next_submission_number;

  INSERT INTO public.post_versions (
    post_id, author_id, version_number, submission_number, title, content,
    visibility, post_type, snapshot, submitted_at
  ) VALUES (
    NEW.id, NEW.user_id, next_version_number, next_submission_number,
    COALESCE(NEW.title, ''), COALESCE(NEW.content, ''), requested_visibility,
    NEW.post_type,
    jsonb_build_object('title', NEW.title, 'content', NEW.content, 'post_type', NEW.post_type, 'visibility', requested_visibility),
    NOW()
  ) RETURNING id INTO version_id;

  FOR rule_row IN
    SELECT keyword.id, keyword.pattern, keyword.category, keyword.severity
    FROM public.moderation_rules keyword
    WHERE keyword.rule_type = 'keyword'
      AND keyword.enabled = TRUE
      AND position(lower(keyword.pattern) IN lower(combined_text)) > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.moderation_rules whitelist
        WHERE whitelist.rule_type = 'whitelist'
          AND whitelist.enabled = TRUE
          AND whitelist.category = keyword.category
          AND lower(whitelist.pattern) = lower(keyword.pattern)
      )
  LOOP
    IF review_case_id IS NULL THEN
      INSERT INTO public.moderation_review_cases (
        post_id, post_version_id, author_id, status, priority, route_reason,
        screening_status, screening_sources, screening_result, rules_version,
        submission_number
      ) VALUES (
        NEW.id, version_id, NEW.user_id, 'pending',
        CASE WHEN rule_row.severity = 'high' THEN 'high' ELSE 'normal' END,
        CASE WHEN NEW.post_type = 'illustration' THEN '图片标题或说明命中审核关键词' ELSE '关键词初筛命中' END,
        'completed', ARRAY['keyword'], jsonb_build_object('engine', 'keyword-v1'),
        'keyword-v1', next_submission_number
      ) RETURNING id INTO review_case_id;
    END IF;

    match_offset := position(lower(rule_row.pattern) IN lower(combined_text));
    INSERT INTO public.moderation_findings (
      review_case_id, source, category, severity, location_type,
      start_offset, end_offset, quoted_text, details, metadata
    ) VALUES (
      review_case_id, 'keyword', rule_row.category, rule_row.severity, 'text_range',
      match_offset - 1, match_offset - 1 + char_length(rule_row.pattern), rule_row.pattern,
      CASE WHEN NEW.post_type = 'illustration' THEN '图片标题或说明命中审核关键词' ELSE '命中审核关键词' END,
      jsonb_build_object('rule_id', rule_row.id, 'pattern', rule_row.pattern)
    );
    matched_count := matched_count + 1;
    has_high_risk := has_high_risk OR rule_row.severity = 'high';
    UPDATE public.moderation_rules SET hit_count = hit_count + 1, last_hit_at = NOW() WHERE id = rule_row.id;
  END LOOP;

  IF NEW.post_type = 'illustration' THEN
    NEW.pending_visibility := requested_visibility;
    NEW.visibility := 'private';
    NEW.status := 'published';
    NEW.review_reason := CASE WHEN matched_count > 0 THEN '图片标题或说明已进入人工审核。' ELSE '图片正在自动审核。' END;
    RETURN NEW;
  END IF;

  IF matched_count = 0 THEN
    NEW.review_status := 'approved';
    NEW.status := 'published';
    NEW.review_reason := NULL;
  ELSE
    IF has_high_risk THEN UPDATE public.moderation_review_cases SET priority = 'high' WHERE id = review_case_id; END IF;
    NEW.status := 'draft';
    NEW.review_reason := '作品已进入人工审核。';
  END IF;
  RETURN NEW;
END;
$$;

-- 确保文字审核触发器存在；已有同名触发器会继续使用上面刚替换的函数。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.posts'::regclass
      AND tgname = 'posts_screen_submission'
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER posts_screen_submission
    BEFORE INSERT OR UPDATE OF title, content, review_status ON public.posts
    FOR EACH ROW EXECUTE FUNCTION public.screen_post_submission();
  END IF;
END $$;

-- v3 回写函数的增量修复：图片模型通过时，如果标题/说明已有词库案件，不能直接放行。
CREATE OR REPLACE FUNCTION public.complete_image_screening(
  post_id_input UUID, outcome TEXT, result JSONB, findings JSONB DEFAULT '[]'::jsonb
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  post_row public.posts%ROWTYPE;
  version_id UUID;
  case_id UUID;
  finding JSONB;
  finding_source TEXT;
  final_visibility TEXT;
  case_sources TEXT[] := ARRAY['nudenet_modelscope'];
BEGIN
  SELECT * INTO post_row FROM public.posts WHERE id = post_id_input FOR UPDATE;
  IF post_row.id IS NULL OR post_row.post_type <> 'illustration' OR post_row.review_status <> 'pending' THEN RETURN; END IF;
  SELECT id INTO version_id FROM public.post_versions WHERE post_id = post_id_input ORDER BY version_number DESC LIMIT 1;

  SELECT id INTO case_id FROM public.moderation_review_cases
  WHERE post_id = post_id_input AND post_version_id = version_id AND status IN ('pending', 'reviewing', 'service_error')
  ORDER BY created_at ASC LIMIT 1;

  IF outcome = 'approved' AND case_id IS NULL THEN
    final_visibility := COALESCE(post_row.pending_visibility, 'public');
    UPDATE public.posts SET review_status = 'approved', status = 'published', visibility = final_visibility,
      pending_visibility = NULL, review_reason = NULL, reviewed_at = NOW() WHERE id = post_id_input;
    RETURN;
  ELSIF outcome = 'approved' THEN
    UPDATE public.posts SET status = 'published', visibility = 'private', review_reason = '图片标题或说明需要人工审核。', reviewed_at = NULL WHERE id = post_id_input;
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM jsonb_array_elements(findings) item WHERE item->>'source' = 'nsfwjs_client') THEN
    case_sources := array_append(case_sources, 'nsfwjs_client');
  END IF;

  IF case_id IS NULL THEN
    INSERT INTO public.moderation_review_cases (
      post_id, post_version_id, author_id, status, priority, route_reason,
      screening_status, screening_sources, screening_result, rules_version, submission_number
    ) VALUES (
      post_id_input, version_id, post_row.user_id,
      CASE WHEN outcome = 'service_error' THEN 'service_error' ELSE 'pending' END,
      CASE WHEN outcome = 'flagged' THEN 'high' ELSE 'normal' END,
      CASE WHEN outcome = 'flagged' THEN '图片自动审核发现风险' ELSE '图片审核服务异常' END,
      CASE WHEN outcome = 'service_error' THEN 'failed' ELSE 'completed' END,
      case_sources, result, 'nudenet-modelscope-v1+nsfwjs-client-v1', post_row.review_submission_number
    ) RETURNING id INTO case_id;
  ELSE
    UPDATE public.moderation_review_cases SET screening_sources = ARRAY(SELECT DISTINCT unnest(screening_sources || case_sources)),
      screening_status = CASE WHEN outcome = 'service_error' THEN 'failed' ELSE 'completed' END,
      screening_result = result, status = CASE WHEN outcome = 'service_error' THEN 'service_error' ELSE 'pending' END,
      route_reason = CASE WHEN outcome = 'flagged' THEN '图片自动审核发现风险' ELSE route_reason END
    WHERE id = case_id;
  END IF;

  FOR finding IN SELECT value FROM jsonb_array_elements(findings) LOOP
    finding_source := COALESCE(finding->>'source', 'nudenet_modelscope');
    IF finding_source NOT IN ('nudenet_modelscope', 'nsfwjs_client') THEN finding_source := 'nudenet_modelscope'; END IF;
    INSERT INTO public.moderation_findings (review_case_id, source, category, severity, location_type, image_index, details, metadata)
    VALUES (case_id, finding_source, finding->>'category', COALESCE(finding->>'severity', 'high'), 'image',
      COALESCE((finding->>'image_index')::INTEGER, 0), COALESCE(finding->>'details', '图片审核模型标记风险'), finding);
  END LOOP;
  UPDATE public.posts SET status = 'published', visibility = 'private',
    review_reason = CASE WHEN outcome = 'service_error' THEN '图片审核服务异常，已转入人工审核。' ELSE '图片已进入人工审核。' END,
    reviewed_at = NULL WHERE id = post_id_input;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_image_screening(UUID, TEXT, JSONB, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.complete_image_screening(UUID, TEXT, JSONB, JSONB) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_image_screening(UUID, TEXT, JSONB, JSONB) TO service_role;
