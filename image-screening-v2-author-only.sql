-- 图片自动审核 v2：作者可见、公众不可见
--
-- 图片作品提交后保留 status = published，方便作者在作品详情/工作室中看到；
-- 同时把实际可见范围临时改为 private，直到服务端审核通过。
-- 原始可见范围保存在 pending_visibility 中。

-- 分开提交每条 DDL，避免在整份迁移期间一直持有 posts 表锁。
-- 如果 Supabase 当前有页面正在读取 posts，锁等待超过 10 秒就直接失败，
-- 不让迁移和业务查询互相等待形成死锁。
SET lock_timeout = '10s';

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS pending_visibility TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.posts'::regclass
      AND conname = 'posts_pending_visibility_check'
  ) THEN
    ALTER TABLE public.posts
      ADD CONSTRAINT posts_pending_visibility_check
      CHECK (pending_visibility IS NULL OR pending_visibility IN ('public', 'followers_only', 'private'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.complete_image_screening(
  post_id_input UUID,
  outcome TEXT,
  result JSONB,
  findings JSONB DEFAULT '[]'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  post_row public.posts%ROWTYPE;
  version_id UUID;
  case_id UUID;
  finding JSONB;
  final_visibility TEXT;
BEGIN
  SELECT * INTO post_row
  FROM public.posts
  WHERE id = post_id_input
  FOR UPDATE;

  IF post_row.id IS NULL OR post_row.post_type <> 'illustration'
     OR post_row.review_status <> 'pending' THEN
    RETURN;
  END IF;

  SELECT id INTO version_id
  FROM public.post_versions
  WHERE post_id = post_id_input
  ORDER BY version_number DESC
  LIMIT 1;

  IF outcome = 'approved' THEN
    final_visibility := COALESCE(post_row.pending_visibility, 'public');
    UPDATE public.posts
    SET review_status = 'approved',
        status = 'published',
        visibility = final_visibility,
        pending_visibility = NULL,
        review_reason = NULL,
        reviewed_at = NOW()
    WHERE id = post_id_input;
    RETURN;
  END IF;

  INSERT INTO public.moderation_review_cases (
    post_id, post_version_id, author_id, status, priority, route_reason,
    screening_status, screening_sources, screening_result, rules_version,
    submission_number
  )
  VALUES (
    post_id_input,
    version_id,
    post_row.user_id,
    CASE WHEN outcome = 'service_error' THEN 'service_error' ELSE 'pending' END,
    CASE WHEN outcome = 'flagged' THEN 'high' ELSE 'normal' END,
    CASE WHEN outcome = 'flagged' THEN '图片自动审核发现风险' ELSE '图片审核服务异常' END,
    CASE WHEN outcome = 'service_error' THEN 'failed' ELSE 'completed' END,
    ARRAY['nudenet_modelscope'],
    result,
    'nudenet-modelscope-v1',
    post_row.review_submission_number
  )
  RETURNING id INTO case_id;

  FOR finding IN SELECT value FROM jsonb_array_elements(findings) LOOP
    INSERT INTO public.moderation_findings (
      review_case_id, source, category, severity, location_type,
      image_index, details, metadata
    )
    VALUES (
      case_id,
      'nudenet_modelscope',
      finding->>'category',
      COALESCE(finding->>'severity', 'high'),
      'image',
      COALESCE((finding->>'image_index')::INTEGER, 0),
      COALESCE(finding->>'details', '服务端图片审核标记风险'),
      finding
    );
  END LOOP;

  UPDATE public.posts
  SET status = 'published',
      visibility = 'private',
      review_reason = CASE
        WHEN outcome = 'service_error' THEN '图片审核服务异常，已转入人工审核。'
        ELSE '图片已进入人工审核。'
      END,
      reviewed_at = NULL
  WHERE id = post_id_input;
END;
$$;

-- 只有服务端使用的 service_role 可以写入自动审核结果。
REVOKE ALL ON FUNCTION public.complete_image_screening(UUID, TEXT, JSONB, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.complete_image_screening(UUID, TEXT, JSONB, JSONB) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_image_screening(UUID, TEXT, JSONB, JSONB) TO service_role;

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

  IF NEW.post_type = 'illustration' THEN
    NEW.pending_visibility := requested_visibility;
    NEW.visibility := 'private';
    NEW.status := 'published';
    NEW.review_reason := '图片正在自动审核。';

    INSERT INTO public.post_versions (
      post_id, author_id, version_number, submission_number, title, content,
      visibility, post_type, snapshot, submitted_at
    ) VALUES (
      NEW.id, NEW.user_id, next_version_number, next_submission_number,
      COALESCE(NEW.title, ''), COALESCE(NEW.content, ''), requested_visibility,
      NEW.post_type,
      jsonb_build_object('title', NEW.title, 'content', NEW.content, 'post_type', NEW.post_type, 'visibility', requested_visibility),
      NOW()
    );
    RETURN NEW;
  END IF;

  INSERT INTO public.post_versions (
    post_id, author_id, version_number, submission_number, title, content,
    visibility, post_type, snapshot, submitted_at
  ) VALUES (
    NEW.id, NEW.user_id, next_version_number, next_submission_number,
    COALESCE(NEW.title, ''), COALESCE(NEW.content, ''), NEW.visibility, NEW.post_type,
    jsonb_build_object('title', NEW.title, 'content', NEW.content, 'post_type', NEW.post_type, 'visibility', NEW.visibility),
    NOW()
  ) RETURNING id INTO version_id;

  FOR rule_row IN
    SELECT keyword.id, keyword.pattern, keyword.category, keyword.severity
    FROM public.moderation_rules keyword
    WHERE keyword.rule_type = 'keyword'
      AND keyword.enabled = TRUE
      AND position(lower(keyword.pattern) IN lower(combined_text)) > 0
  LOOP
    IF review_case_id IS NULL THEN
      INSERT INTO public.moderation_review_cases (
        post_id, post_version_id, author_id, status, priority, route_reason,
        screening_status, screening_sources, screening_result, rules_version,
        submission_number
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
    UPDATE public.moderation_rules
    SET hit_count = hit_count + 1, last_hit_at = NOW()
    WHERE id = rule_row.id;
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
