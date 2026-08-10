-- Inkland 第一版：作品发布关键词初筛
-- 前置：admin-moderation-v1-foundation.sql 已成功执行。
--
-- 规则说明：
-- 1. 仅处理作者主动提交审核的作品（review_status = 'pending'）。保存草稿、私密作品不受影响。
-- 2. 未命中启用关键词：自动放行发布。
-- 3. 命中启用关键词：保留为审核中，并建立作品版本、审核案件和命中位置。
-- 4. 白名单当前用于停用“同一分类、同一词语”的关键词规则；复杂的语境白名单在后续版本加入。
-- 5. 本脚本不回填旧作品，不删除任何作品、用户或历史审核记录。

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.moderation_rules') IS NULL
    OR to_regclass('public.post_versions') IS NULL
    OR to_regclass('public.moderation_review_cases') IS NULL
    OR to_regclass('public.moderation_findings') IS NULL THEN
    RAISE EXCEPTION '缺少审核基础表：请先执行 admin-moderation-v1-foundation.sql';
  END IF;
END $$;

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
BEGIN
  -- 只有作者点击“提交审核”的新作品或新版本才会进入筛查。
  IF NEW.review_status IS DISTINCT FROM 'pending' OR COALESCE(NEW.visibility, 'public') = 'private' THEN
    RETURN NEW;
  END IF;

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
    COALESCE(NEW.title, ''), COALESCE(NEW.content, ''), NEW.visibility, NEW.post_type,
    jsonb_build_object('title', NEW.title, 'content', NEW.content, 'post_type', NEW.post_type, 'visibility', NEW.visibility),
    NOW()
  ) RETURNING id INTO version_id;

  -- 第一版没有接入图片内容识别。图片作品不能假装已经自动审核，统一进入人工队列。
  IF NEW.post_type = 'illustration' THEN
    INSERT INTO public.moderation_review_cases (
      post_id, post_version_id, author_id, status, priority, route_reason,
      screening_status, screening_sources, screening_result, rules_version, submission_number
    ) VALUES (
      NEW.id, version_id, NEW.user_id, 'pending', 'normal',
      '图片自动审核未配置，需人工查看原图', 'not_configured', ARRAY['image_manual'],
      jsonb_build_object('engine', 'manual-image-v1'), 'manual-image-v1', next_submission_number
    );
    NEW.status := 'draft';
    NEW.review_reason := '图片作品需要人工审核。';
    RETURN NEW;
  END IF;

  FOR rule_row IN
    SELECT keyword.id, keyword.pattern, keyword.category, keyword.severity
    FROM public.moderation_rules keyword
    WHERE keyword.rule_type = 'keyword'
      AND keyword.enabled = TRUE
      AND position(lower(keyword.pattern) IN lower(combined_text)) > 0
      AND NOT EXISTS (
        SELECT 1
        FROM public.moderation_rules whitelist
        WHERE whitelist.rule_type = 'whitelist'
          AND whitelist.enabled = TRUE
          AND whitelist.category = keyword.category
          AND lower(whitelist.pattern) = lower(keyword.pattern)
      )
  LOOP
    IF review_case_id IS NULL THEN
      INSERT INTO public.moderation_review_cases (
        post_id, post_version_id, author_id, status, priority, route_reason,
        screening_status, screening_sources, screening_result, rules_version, submission_number
      ) VALUES (
        NEW.id, version_id, NEW.user_id, 'pending',
        CASE WHEN rule_row.severity = 'high' THEN 'high' ELSE 'normal' END,
        '关键词初筛命中', 'completed', ARRAY['keyword'],
        jsonb_build_object('engine', 'keyword-v1'), 'keyword-v1', next_submission_number
      ) RETURNING id INTO review_case_id;
    END IF;

    match_offset := position(lower(rule_row.pattern) IN lower(combined_text));
    INSERT INTO public.moderation_findings (
      review_case_id, source, category, severity, location_type,
      start_offset, end_offset, quoted_text, details, metadata
    ) VALUES (
      review_case_id, 'keyword', rule_row.category, rule_row.severity, 'text_range',
      match_offset - 1, match_offset - 1 + char_length(rule_row.pattern), rule_row.pattern,
      '命中审核关键词', jsonb_build_object('rule_id', rule_row.id, 'pattern', rule_row.pattern)
    );
    matched_count := matched_count + 1;
    has_high_risk := has_high_risk OR rule_row.severity = 'high';
    UPDATE public.moderation_rules SET hit_count = hit_count + 1, last_hit_at = NOW() WHERE id = rule_row.id;
  END LOOP;

  IF matched_count = 0 THEN
    NEW.review_status := 'approved';
    NEW.status := 'published';
    NEW.review_reason := NULL;
  ELSE
    IF has_high_risk THEN
      UPDATE public.moderation_review_cases SET priority = 'high' WHERE id = review_case_id;
    END IF;
    NEW.status := 'draft';
    NEW.review_reason := '作品已进入人工审核。';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS posts_screen_submission ON public.posts;
CREATE TRIGGER posts_screen_submission
BEFORE INSERT OR UPDATE OF title, content, review_status ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.screen_post_submission();

COMMIT;

-- 执行后核验：
-- SELECT tgname FROM pg_trigger WHERE tgname = 'posts_screen_submission';
-- SELECT proname FROM pg_proc WHERE proname = 'screen_post_submission';
