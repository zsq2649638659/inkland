-- Inkland 文字审核详情与版本闭环 v1
--
-- 前置：admin-moderation-v1-foundation.sql、admin-backoffice.sql、
--       post-screening-v1.sql、text-screening-v4-series-image.sql、
--       author-note-screening-v1.sql、image-screening-v3-client-assist.sql
--
-- 本迁移是增量迁移，不删除作品、用户、版本或历史审核记录。
-- 目标：
-- 1. 审核详情页读取冻结版本（post_versions），不依赖 posts 实时内容；
-- 2. 关键词命中按 标题/正文/作者的话 字段级定位到段落与偏移；
-- 3. 图片 OCR 结果（paddleocr_modelscope）与 NudeNet/NSFWJS 一起进入审核案件；
-- 4. 管理员通过 admin_decide_post_review 原子化放行/打回；
-- 5. 已发布作品修改被拦截时旧版本继续公开，新版本冻结在 pending 等待审核。

SET lock_timeout = '10s';

BEGIN;

-- ============================================================
-- 一、冻结版本补充字段
-- ============================================================

ALTER TABLE public.post_versions
  ADD COLUMN IF NOT EXISTS author_note TEXT;
ALTER TABLE public.post_versions
  ADD COLUMN IF NOT EXISTS series_name TEXT;
ALTER TABLE public.post_versions
  ADD COLUMN IF NOT EXISTS chapter_number INTEGER;
ALTER TABLE public.post_versions
  ADD COLUMN IF NOT EXISTS chapter_title TEXT;
ALTER TABLE public.post_versions
  ADD COLUMN IF NOT EXISTS word_count INTEGER;
ALTER TABLE public.post_versions
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- ============================================================
-- 二、posts 的发布版本指针与待审状态
-- ============================================================

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS published_version_number INTEGER;
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS pending_version_id UUID
  REFERENCES public.post_versions(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS pending_review_status TEXT;
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS pending_review_reason TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.posts'::regclass
      AND conname = 'posts_pending_review_status_check'
  ) THEN
    ALTER TABLE public.posts
      ADD CONSTRAINT posts_pending_review_status_check
      CHECK (pending_review_status IS NULL OR pending_review_status IN ('pending', 'rejected', 'approved'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS posts_pending_version_idx
  ON public.posts (pending_version_id)
  WHERE pending_version_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS posts_pending_review_status_idx
  ON public.posts (pending_review_status, created_at)
  WHERE pending_review_status IS NOT NULL;

-- ============================================================
-- 三、审核标记支持字段与 OCR 来源
-- ============================================================

ALTER TABLE public.moderation_findings
  ADD COLUMN IF NOT EXISTS field_name TEXT;

ALTER TABLE public.moderation_findings
  DROP CONSTRAINT IF EXISTS moderation_findings_source_check;
ALTER TABLE public.moderation_findings
  ADD CONSTRAINT moderation_findings_source_check
  CHECK (source IN (
    'keyword', 'moderation_api', 'nudenet_modelscope', 'nsfwjs_client',
    'rating_rule', 'admin', 'paddleocr_modelscope'
  ));

-- OCR 命中定位在图片内的文字区域，使用 image_ocr 与整图标记（image）区分。
ALTER TABLE public.moderation_findings
  DROP CONSTRAINT IF EXISTS moderation_findings_location_type_check;
ALTER TABLE public.moderation_findings
  ADD CONSTRAINT moderation_findings_location_type_check
  CHECK (location_type IN ('whole_work', 'paragraph', 'text_range', 'image', 'image_ocr'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.moderation_findings'::regclass
      AND conname = 'moderation_findings_field_name_check'
  ) THEN
    ALTER TABLE public.moderation_findings
      ADD CONSTRAINT moderation_findings_field_name_check
      CHECK (field_name IS NULL OR field_name IN ('title', 'content', 'author_note', 'image_ocr', 'image'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS moderation_findings_case_field_idx
  ON public.moderation_findings (review_case_id, field_name, status);

-- ============================================================
-- 四、重写提交审核触发器：字段级定位 + 版本冻结
-- ============================================================

CREATE OR REPLACE FUNCTION public.screen_post_submission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_version_number INTEGER;
  next_submission_number INTEGER;
  version_id UUID;
  review_case_id UUID;
  rule_row RECORD;
  matched_count INTEGER := 0;
  has_high_risk BOOLEAN := FALSE;
  requested_visibility TEXT;
  content_without_note TEXT;
  paragraphs TEXT[];
  paragraph_text TEXT;
  paragraph_index INTEGER;
  base_offset INTEGER := 0;
  match_offset INTEGER;
  published_before BOOLEAN := FALSE;
  keyword_detail TEXT;
  pending_message TEXT;
BEGIN
  -- 只有作者主动提交审核的新作品/新版本进入筛查；草稿与私密作品不受影响。
  IF NEW.review_status IS DISTINCT FROM 'pending' OR COALESCE(NEW.visibility, 'public') = 'private' THEN
    RETURN NEW;
  END IF;

  requested_visibility := CASE
    WHEN NEW.pending_visibility IN ('public', 'followers_only', 'private') THEN NEW.pending_visibility
    WHEN NEW.visibility IN ('public', 'followers_only', 'private') THEN NEW.visibility
    ELSE 'public'
  END;

  next_version_number := CASE
    WHEN TG_OP = 'INSERT' THEN GREATEST(COALESCE(NEW.current_version_number, 1), 1)
    ELSE GREATEST(COALESCE(NEW.current_version_number, 0), 0) + 1
  END;
  next_submission_number := GREATEST(COALESCE(NEW.review_submission_number, 0), 0) + 1;
  NEW.current_version_number := next_version_number;
  NEW.review_submission_number := next_submission_number;

  published_before := TG_OP = 'UPDATE'
    AND (OLD.status = 'published' OR OLD.published_version_number IS NOT NULL);

  -- 作者重新提交时，关闭上一轮未完成案件，避免同一版本出现多个有效审核任务。
  UPDATE public.moderation_review_cases
  SET status = 'cancelled', updated_at = NOW()
  WHERE post_id = NEW.id
    AND status IN ('pending', 'reviewing', 'service_error');

  -- 正文快照去掉作者的话 HTML 注释，作者的话单独作为字段审核。
  content_without_note := regexp_replace(
    COALESCE(NEW.content, ''),
    E'<!--\\s*作者的话：[\\s\\S]*?-->',
    '',
    'g'
  );

  INSERT INTO public.post_versions (
    post_id, author_id, version_number, submission_number, title, content,
    author_note, series_name, chapter_number, chapter_title, word_count,
    published_at, visibility, post_type, snapshot, submitted_at
  ) VALUES (
    NEW.id, NEW.user_id, next_version_number, next_submission_number,
    COALESCE(NEW.title, ''), COALESCE(NEW.content, ''), NEW.author_note,
    NEW.series_name, NEW.chapter_number, NEW.chapter_title, NEW.word_count,
    NEW.published_at, requested_visibility, NEW.post_type,
    jsonb_build_object(
      'title', NEW.title, 'content', NEW.content, 'author_note', NEW.author_note,
      'series_name', NEW.series_name, 'chapter_number', NEW.chapter_number,
      'chapter_title', NEW.chapter_title, 'word_count', NEW.word_count,
      'published_at', NEW.published_at, 'post_type', NEW.post_type,
      'visibility', requested_visibility
    ),
    NOW()
  ) RETURNING id INTO version_id;

  -- ---- 标题字段 ----
  IF COALESCE(NEW.title, '') <> '' THEN
    FOR rule_row IN
      SELECT keyword.id, keyword.pattern, keyword.category, keyword.severity
      FROM public.moderation_rules keyword
      WHERE keyword.rule_type = 'keyword'
        AND keyword.enabled = TRUE
        AND position(lower(keyword.pattern) IN lower(COALESCE(NEW.title, ''))) > 0
        AND NOT EXISTS (
          SELECT 1 FROM public.moderation_rules whitelist
          WHERE whitelist.rule_type = 'whitelist'
            AND whitelist.enabled = TRUE
            AND whitelist.category = keyword.category
            AND lower(whitelist.pattern) = lower(keyword.pattern)
        )
    LOOP
      match_offset := position(lower(rule_row.pattern) IN lower(COALESCE(NEW.title, '')));
      keyword_detail := CASE WHEN NEW.post_type = 'illustration' THEN '图片标题命中审核关键词' ELSE '标题命中审核关键词' END;
      IF review_case_id IS NULL THEN
        INSERT INTO public.moderation_review_cases (
          post_id, post_version_id, author_id, status, priority, route_reason,
          screening_status, screening_sources, screening_result, rules_version,
          submission_number
        ) VALUES (
          NEW.id, version_id, NEW.user_id, 'pending',
          CASE WHEN rule_row.severity = 'high' THEN 'high' ELSE 'normal' END,
          keyword_detail, 'completed', ARRAY['keyword'],
          jsonb_build_object('engine', 'keyword-v1'), 'keyword-v1', next_submission_number
        ) RETURNING id INTO review_case_id;
      END IF;
      INSERT INTO public.moderation_findings (
        review_case_id, source, category, severity, location_type, field_name,
        paragraph_index, start_offset, end_offset, quoted_text, details, metadata
      ) VALUES (
        review_case_id, 'keyword', rule_row.category, rule_row.severity, 'text_range', 'title',
        1, match_offset - 1, match_offset - 1 + char_length(rule_row.pattern),
        rule_row.pattern, keyword_detail,
        jsonb_build_object('rule_id', rule_row.id, 'pattern', rule_row.pattern)
      );
      matched_count := matched_count + 1;
      has_high_risk := has_high_risk OR rule_row.severity = 'high';
      UPDATE public.moderation_rules
      SET hit_count = hit_count + 1, last_hit_at = NOW()
      WHERE id = rule_row.id;
    END LOOP;
  END IF;

  -- ---- 正文字段（按段落定位） ----
  IF COALESCE(content_without_note, '') <> '' THEN
    paragraphs := string_to_array(content_without_note, E'\n\n');
    base_offset := 0;
    IF paragraphs IS NOT NULL THEN
      FOR paragraph_index IN 1 .. array_length(paragraphs, 1) LOOP
        paragraph_text := COALESCE(paragraphs[paragraph_index], '');
        IF paragraph_text = '' THEN
          base_offset := base_offset + 2;
          CONTINUE;
        END IF;
        FOR rule_row IN
          SELECT keyword.id, keyword.pattern, keyword.category, keyword.severity
          FROM public.moderation_rules keyword
          WHERE keyword.rule_type = 'keyword'
            AND keyword.enabled = TRUE
            AND position(lower(keyword.pattern) IN lower(paragraph_text)) > 0
            AND NOT EXISTS (
              SELECT 1 FROM public.moderation_rules whitelist
              WHERE whitelist.rule_type = 'whitelist'
                AND whitelist.enabled = TRUE
                AND whitelist.category = keyword.category
                AND lower(whitelist.pattern) = lower(keyword.pattern)
            )
        LOOP
          match_offset := position(lower(rule_row.pattern) IN lower(paragraph_text));
          keyword_detail := CASE WHEN NEW.post_type = 'illustration' THEN '图片说明命中审核关键词' ELSE '正文命中审核关键词' END;
          IF review_case_id IS NULL THEN
            INSERT INTO public.moderation_review_cases (
              post_id, post_version_id, author_id, status, priority, route_reason,
              screening_status, screening_sources, screening_result, rules_version,
              submission_number
            ) VALUES (
              NEW.id, version_id, NEW.user_id, 'pending',
              CASE WHEN rule_row.severity = 'high' THEN 'high' ELSE 'normal' END,
              keyword_detail, 'completed', ARRAY['keyword'],
              jsonb_build_object('engine', 'keyword-v1'), 'keyword-v1', next_submission_number
            ) RETURNING id INTO review_case_id;
          END IF;
          INSERT INTO public.moderation_findings (
            review_case_id, source, category, severity, location_type, field_name,
            paragraph_index, start_offset, end_offset, quoted_text, details, metadata
          ) VALUES (
            review_case_id, 'keyword', rule_row.category, rule_row.severity, 'paragraph', 'content',
            paragraph_index, base_offset + match_offset - 1,
            base_offset + match_offset - 1 + char_length(rule_row.pattern),
            rule_row.pattern, keyword_detail,
            jsonb_build_object('rule_id', rule_row.id, 'pattern', rule_row.pattern)
          );
          matched_count := matched_count + 1;
          has_high_risk := has_high_risk OR rule_row.severity = 'high';
          UPDATE public.moderation_rules
          SET hit_count = hit_count + 1, last_hit_at = NOW()
          WHERE id = rule_row.id;
        END LOOP;
        base_offset := base_offset + char_length(paragraph_text) + 2;
      END LOOP;
    END IF;
  END IF;

  -- ---- 作者的话字段 ----
  IF COALESCE(NEW.author_note, '') <> '' THEN
    FOR rule_row IN
      SELECT keyword.id, keyword.pattern, keyword.category, keyword.severity
      FROM public.moderation_rules keyword
      WHERE keyword.rule_type = 'keyword'
        AND keyword.enabled = TRUE
        AND position(lower(keyword.pattern) IN lower(COALESCE(NEW.author_note, ''))) > 0
        AND NOT EXISTS (
          SELECT 1 FROM public.moderation_rules whitelist
          WHERE whitelist.rule_type = 'whitelist'
            AND whitelist.enabled = TRUE
            AND whitelist.category = keyword.category
            AND lower(whitelist.pattern) = lower(keyword.pattern)
        )
    LOOP
      match_offset := position(lower(rule_row.pattern) IN lower(COALESCE(NEW.author_note, '')));
      keyword_detail := '作者的话命中审核关键词';
      IF review_case_id IS NULL THEN
        INSERT INTO public.moderation_review_cases (
          post_id, post_version_id, author_id, status, priority, route_reason,
          screening_status, screening_sources, screening_result, rules_version,
          submission_number
        ) VALUES (
          NEW.id, version_id, NEW.user_id, 'pending',
          CASE WHEN rule_row.severity = 'high' THEN 'high' ELSE 'normal' END,
          keyword_detail, 'completed', ARRAY['keyword'],
          jsonb_build_object('engine', 'keyword-v1'), 'keyword-v1', next_submission_number
        ) RETURNING id INTO review_case_id;
      END IF;
      INSERT INTO public.moderation_findings (
        review_case_id, source, category, severity, location_type, field_name,
        paragraph_index, start_offset, end_offset, quoted_text, details, metadata
      ) VALUES (
        review_case_id, 'keyword', rule_row.category, rule_row.severity, 'text_range', 'author_note',
        1, match_offset - 1, match_offset - 1 + char_length(rule_row.pattern),
        rule_row.pattern, keyword_detail,
        jsonb_build_object('rule_id', rule_row.id, 'pattern', rule_row.pattern)
      );
      matched_count := matched_count + 1;
      has_high_risk := has_high_risk OR rule_row.severity = 'high';
      UPDATE public.moderation_rules
      SET hit_count = hit_count + 1, last_hit_at = NOW()
      WHERE id = rule_row.id;
    END LOOP;
  END IF;

  IF has_high_risk AND review_case_id IS NOT NULL THEN
    UPDATE public.moderation_review_cases SET priority = 'high' WHERE id = review_case_id;
  END IF;

  -- ---- 图片作品：作者可见、公众不可见，等待服务端图片/OCR 审核 ----
  IF NEW.post_type = 'illustration' THEN
    NEW.pending_visibility := requested_visibility;
    NEW.visibility := 'private';
    NEW.status := 'published';
    NEW.review_status := 'pending';
    NEW.pending_version_id := version_id;
    NEW.pending_review_status := 'pending';
    IF published_before THEN
      NEW.title := OLD.title;
      NEW.content := OLD.content;
      NEW.author_note := OLD.author_note;
      NEW.series_name := OLD.series_name;
      NEW.chapter_number := OLD.chapter_number;
      NEW.chapter_title := OLD.chapter_title;
      NEW.word_count := OLD.word_count;
      NEW.published_at := OLD.published_at;
      NEW.visibility := OLD.visibility;
      NEW.review_reason := '图片修改已进入人工审核，旧版本继续公开。';
    ELSE
      NEW.review_reason := CASE
        WHEN matched_count > 0 THEN '图片标题或说明已进入人工审核。'
        ELSE '图片正在自动审核。'
      END;
    END IF;
    NEW.pending_review_reason := NEW.review_reason;
    RETURN NEW;
  END IF;

  -- ---- 文字/连载章节 ----
  IF matched_count = 0 THEN
    NEW.review_status := 'approved';
    NEW.status := 'published';
    NEW.review_reason := NULL;
    NEW.published_version_number := next_version_number;
    NEW.pending_version_id := NULL;
    NEW.pending_review_status := NULL;
    NEW.pending_review_reason := NULL;
    NEW.pending_visibility := NULL;
    RETURN NEW;
  END IF;

  NEW.pending_version_id := version_id;
  NEW.pending_review_status := 'pending';
  IF published_before THEN
    -- 已发布作品的新版本被拦截：旧版本继续公开，新版本冻结等待审核。
    NEW.title := OLD.title;
    NEW.content := OLD.content;
    NEW.author_note := OLD.author_note;
    NEW.series_name := OLD.series_name;
    NEW.chapter_number := OLD.chapter_number;
    NEW.chapter_title := OLD.chapter_title;
    NEW.word_count := OLD.word_count;
    NEW.published_at := OLD.published_at;
    NEW.visibility := OLD.visibility;
    NEW.status := 'published';
    NEW.review_status := 'pending';
    pending_message := '作品修改已进入人工审核，旧版本继续公开。';
    NEW.review_reason := pending_message;
    NEW.pending_review_reason := pending_message;
  ELSE
    NEW.status := 'draft';
    NEW.review_status := 'pending';
    pending_message := '作品已进入人工审核。';
    NEW.review_reason := pending_message;
    NEW.pending_review_reason := pending_message;
  END IF;
  RETURN NEW;
END;
$$;

-- 确保触发器存在；已有同名触发器会继续使用刚替换的函数。
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

-- ============================================================
-- 五、图片异步审核回写：与冻结版本保持一致
-- ============================================================

CREATE OR REPLACE FUNCTION public.complete_image_screening(
  post_id_input UUID, outcome TEXT, result JSONB, findings JSONB DEFAULT '[]'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  post_row public.posts%ROWTYPE;
  version_row public.post_versions%ROWTYPE;
  case_id UUID;
  finding JSONB;
  finding_source TEXT;
  final_visibility TEXT;
  case_sources TEXT[] := ARRAY['nudenet_modelscope'];
BEGIN
  SELECT * INTO post_row
  FROM public.posts
  WHERE id = post_id_input
  FOR UPDATE;

  IF post_row.id IS NULL OR post_row.post_type <> 'illustration'
     OR post_row.review_status <> 'pending' THEN
    RETURN;
  END IF;

  SELECT * INTO version_row
  FROM public.post_versions
  WHERE post_id = post_id_input
  ORDER BY version_number DESC
  LIMIT 1;
  IF version_row.id IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO case_id
  FROM public.moderation_review_cases
  WHERE post_id = post_id_input
    AND post_version_id = version_row.id
    AND status IN ('pending', 'reviewing', 'service_error')
  ORDER BY created_at ASC
  LIMIT 1;

  -- 图片与文字都通过：发布冻结版本。
  IF outcome = 'approved' AND case_id IS NULL THEN
    final_visibility := COALESCE(post_row.pending_visibility, 'public');
    UPDATE public.posts
    SET review_status = 'approved',
        status = 'published',
        visibility = final_visibility,
        pending_visibility = NULL,
        review_reason = NULL,
        reviewed_at = NOW(),
        published_version_number = version_row.version_number,
        pending_version_id = NULL,
        pending_review_status = NULL,
        pending_review_reason = NULL
    WHERE id = post_id_input;
    RETURN;
  ELSIF outcome = 'approved' THEN
    -- 已有关键词案件：图片先保持私密，等待人工决定。
    UPDATE public.posts
    SET status = 'published',
        visibility = 'private',
        review_reason = '图片标题或说明需要人工审核。',
        reviewed_at = NULL,
        pending_review_status = 'pending',
        pending_review_reason = '图片标题或说明需要人工审核。'
    WHERE id = post_id_input;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(findings) item
    WHERE item->>'source' = 'nsfwjs_client'
  ) THEN
    case_sources := array_append(case_sources, 'nsfwjs_client');
  END IF;

  IF case_id IS NULL THEN
    INSERT INTO public.moderation_review_cases (
      post_id, post_version_id, author_id, status, priority, route_reason,
      screening_status, screening_sources, screening_result, rules_version,
      submission_number
    ) VALUES (
      post_id_input, version_row.id, post_row.user_id,
      CASE WHEN outcome = 'service_error' THEN 'service_error' ELSE 'pending' END,
      CASE WHEN outcome = 'flagged' THEN 'high' ELSE 'normal' END,
      CASE WHEN outcome = 'flagged' THEN '图片自动审核发现风险' ELSE '图片审核服务异常' END,
      CASE WHEN outcome = 'service_error' THEN 'failed' ELSE 'completed' END,
      case_sources, result, 'nudenet-modelscope-v1+nsfwjs-client-v1',
      post_row.review_submission_number
    ) RETURNING id INTO case_id;
  ELSE
    UPDATE public.moderation_review_cases
    SET screening_sources = ARRAY(SELECT DISTINCT unnest(screening_sources || case_sources)),
        screening_status = CASE WHEN outcome = 'service_error' THEN 'failed' ELSE 'completed' END,
        screening_result = result,
        status = CASE WHEN outcome = 'service_error' THEN 'service_error' ELSE 'pending' END,
        route_reason = CASE WHEN outcome = 'flagged' THEN '图片自动审核发现风险' ELSE route_reason END
    WHERE id = case_id;
  END IF;

  FOR finding IN SELECT value FROM jsonb_array_elements(findings) LOOP
    finding_source := COALESCE(finding->>'source', 'nudenet_modelscope');
    IF finding_source NOT IN ('nudenet_modelscope', 'nsfwjs_client', 'paddleocr_modelscope') THEN
      finding_source := 'nudenet_modelscope';
    END IF;
    INSERT INTO public.moderation_findings (
      review_case_id, source, category, severity, location_type,
      image_index, quoted_text, details, metadata
    ) VALUES (
      case_id, finding_source, COALESCE(NULLIF(finding->>'category', ''), '待确认问题'),
      COALESCE(finding->>'severity', 'high'),
      CASE WHEN finding_source = 'paddleocr_modelscope' THEN 'image_ocr' ELSE 'image' END,
      COALESCE((finding->>'image_index')::INTEGER, 0),
      finding->>'quoted_text',
      COALESCE(finding->>'details', '图片审核模型标记风险'),
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
      reviewed_at = NULL,
      pending_review_status = 'pending',
      pending_review_reason = CASE
        WHEN outcome = 'service_error' THEN '图片审核服务异常，已转入人工审核。'
        ELSE '图片已进入人工审核。'
      END
  WHERE id = post_id_input;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_image_screening(UUID, TEXT, JSONB, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.complete_image_screening(UUID, TEXT, JSONB, JSONB) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_image_screening(UUID, TEXT, JSONB, JSONB) TO service_role;

-- ============================================================
-- 六、管理员原子化放行/打回
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_decide_post_review(
  review_case_id UUID,
  admin_id UUID,
  decision TEXT,
  reason TEXT DEFAULT NULL,
  confirmed_finding_ids UUID[] DEFAULT ARRAY[]::UUID[],
  dismissed_finding_ids UUID[] DEFAULT ARRAY[]::UUID[],
  manual_findings JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  review_case public.moderation_review_cases%ROWTYPE;
  version_row public.post_versions%ROWTYPE;
  post_row public.posts%ROWTYPE;
  manual_finding JSONB;
  issues JSONB := '[]'::jsonb;
  rejected BOOLEAN;
  notification_template TEXT;
  notification_content TEXT;
  notification_meta JSONB;
  action_url TEXT;
  action_label TEXT;
  published_before BOOLEAN;
  confirmed_count INTEGER;
  manual_count INTEGER;
  final_reason TEXT;
BEGIN
  IF admin_id IS NULL THEN
    RAISE EXCEPTION 'admin_required';
  END IF;
  IF decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'invalid_decision';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  rejected := decision = 'rejected';
  final_reason := NULLIF(btrim(COALESCE(reason, '')), '');

  SELECT * INTO review_case
  FROM public.moderation_review_cases
  WHERE id = review_case_id
  FOR UPDATE;
  IF review_case.id IS NULL THEN
    RAISE EXCEPTION 'review_case_not_found';
  END IF;
  IF review_case.status NOT IN ('pending', 'reviewing', 'service_error') THEN
    RAISE EXCEPTION 'review_case_not_actionable';
  END IF;

  SELECT * INTO version_row
  FROM public.post_versions
  WHERE id = review_case.post_version_id;
  IF version_row.id IS NULL THEN
    RAISE EXCEPTION 'post_version_not_found';
  END IF;

  SELECT * INTO post_row
  FROM public.posts
  WHERE id = review_case.post_id
  FOR UPDATE;
  IF post_row.id IS NULL THEN
    RAISE EXCEPTION 'post_not_found';
  END IF;

  published_before := post_row.status = 'published' OR post_row.published_version_number IS NOT NULL;
  manual_count := 0;

  -- 管理员新增人工标记，直接作为已确认问题。
  FOR manual_finding IN SELECT value FROM jsonb_array_elements(COALESCE(manual_findings, '[]'::jsonb)) LOOP
    INSERT INTO public.moderation_findings (
      review_case_id, source, category, severity, location_type, field_name,
      paragraph_index, start_offset, end_offset, image_index, quoted_text,
      details, metadata, status, confirmed_by, confirmed_at
    ) VALUES (
      review_case_id, 'admin',
      COALESCE(NULLIF(btrim(COALESCE(manual_finding->>'category', '')), ''), '其他违规'),
      COALESCE(NULLIF(manual_finding->>'severity', ''), 'high'),
      COALESCE(NULLIF(manual_finding->>'location_type', ''), 'text_range'),
      NULLIF(manual_finding->>'field_name', ''),
      NULLIF((manual_finding->>'paragraph_index')::TEXT, '')::INTEGER,
      NULLIF((manual_finding->>'start_offset')::TEXT, '')::INTEGER,
      NULLIF((manual_finding->>'end_offset')::TEXT, '')::INTEGER,
      NULLIF((manual_finding->>'image_index')::TEXT, '')::INTEGER,
      NULLIF(manual_finding->>'quoted_text', ''),
      COALESCE(NULLIF(manual_finding->>'details', ''), '管理员标记问题'),
      manual_finding, 'confirmed', admin_id, NOW()
    );
    manual_count := manual_count + 1;
  END LOOP;

  IF rejected THEN
    IF final_reason IS NULL THEN
      RAISE EXCEPTION 'reject_reason_required';
    END IF;
    IF COALESCE(array_length(confirmed_finding_ids, 1), 0) = 0 AND manual_count = 0 THEN
      RAISE EXCEPTION 'confirmed_finding_required';
    END IF;

    IF confirmed_finding_ids IS NOT NULL THEN
      UPDATE public.moderation_findings
      SET status = 'confirmed', confirmed_by = admin_id, confirmed_at = NOW()
      WHERE id = ANY(confirmed_finding_ids)
        AND review_case_id = review_case.id
        AND status = 'suggested';
    END IF;

    IF dismissed_finding_ids IS NOT NULL THEN
      UPDATE public.moderation_findings
      SET status = 'dismissed', confirmed_by = admin_id, confirmed_at = NOW()
      WHERE id = ANY(dismissed_finding_ids)
        AND review_case_id = review_case.id
        AND status IN ('suggested', 'confirmed');
    END IF;

    -- 案件关闭后，其余未处理建议一并归档。
    UPDATE public.moderation_findings
    SET status = 'dismissed'
    WHERE review_case_id = review_case.id
      AND status = 'suggested';

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', f.id,
      'category', f.category,
      'field_name', f.field_name,
      'location_type', f.location_type,
      'paragraph_index', f.paragraph_index,
      'start_offset', f.start_offset,
      'end_offset', f.end_offset,
      'image_index', f.image_index,
      'quoted_text', f.quoted_text,
      'details', f.details
    ) ORDER BY f.created_at), '[]'::jsonb)
    INTO issues
    FROM public.moderation_findings f
    WHERE f.review_case_id = review_case.id
      AND f.status = 'confirmed';

    UPDATE public.moderation_review_cases
    SET status = 'changes_requested',
        decided_by = admin_id,
        decided_at = NOW()
    WHERE id = review_case.id;

    IF published_before THEN
      -- 旧版本继续公开，仅记录待审版本被打回。
      UPDATE public.posts
      SET review_status = 'approved',
          review_reason = NULL,
          pending_review_status = 'rejected',
          pending_review_reason = final_reason,
          reviewed_at = NOW(),
          reviewed_by = admin_id
      WHERE id = post_row.id;
    ELSE
      UPDATE public.posts
      SET review_status = 'rejected',
          status = 'draft',
          review_reason = final_reason,
          pending_review_status = 'rejected',
          pending_review_reason = final_reason,
          reviewed_at = NOW(),
          reviewed_by = admin_id
      WHERE id = post_row.id;
    END IF;

    notification_template := 'post_review_rejected';
    notification_content := '你的作品《' || COALESCE(version_row.title, '无标题') || '》未通过本次审核，共标记 '
      || (SELECT COUNT(*) FROM jsonb_array_elements(issues))::TEXT || ' 个问题。请修改后重新提交审核。';
    action_url := '/create?editPost=' || post_row.id::TEXT;
    action_label := '查看问题并修改';
  ELSE
    -- 放行：归档未确认建议。
    UPDATE public.moderation_findings
    SET status = 'dismissed'
    WHERE review_case_id = review_case.id
      AND status = 'suggested';

    UPDATE public.moderation_review_cases
    SET status = 'approved',
        decided_by = admin_id,
        decided_at = NOW()
    WHERE id = review_case.id;

    -- 发布冻结版本。
    UPDATE public.posts
    SET title = version_row.title,
        content = version_row.content,
        author_note = version_row.author_note,
        series_name = version_row.series_name,
        chapter_number = version_row.chapter_number,
        chapter_title = version_row.chapter_title,
        word_count = version_row.word_count,
        published_at = COALESCE(version_row.published_at, post_row.published_at, NOW()),
        content_rating = COALESCE(version_row.content_rating, post_row.content_rating),
        post_type = COALESCE(version_row.post_type, post_row.post_type),
        visibility = COALESCE(post_row.pending_visibility, version_row.visibility, post_row.visibility, 'public'),
        pending_visibility = NULL,
        status = 'published',
        review_status = 'approved',
        review_reason = NULL,
        reviewed_at = NOW(),
        reviewed_by = admin_id,
        published_version_number = version_row.version_number,
        pending_version_id = NULL,
        pending_review_status = NULL,
        pending_review_reason = NULL
    WHERE id = post_row.id;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', f.id,
      'category', f.category,
      'field_name', f.field_name,
      'location_type', f.location_type,
      'paragraph_index', f.paragraph_index,
      'start_offset', f.start_offset,
      'end_offset', f.end_offset,
      'image_index', f.image_index,
      'quoted_text', f.quoted_text
    ) ORDER BY f.created_at), '[]'::jsonb)
    INTO issues
    FROM public.moderation_findings f
    WHERE f.review_case_id = review_case.id
      AND f.status = 'confirmed';

    notification_template := 'post_review_approved';
    notification_content := '你的作品《' || COALESCE(version_row.title, '无标题') || '》已通过审核并发布。';
    action_url := '/read/' || post_row.id::TEXT;
    action_label := '查看作品';
  END IF;

  notification_meta := jsonb_build_object(
    'action_url', action_url,
    'action_label', action_label,
    'issues', issues,
    'reason', final_reason,
    'submission_number', review_case.submission_number,
    'decided_at', to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'decision', decision
  );

  IF NOT EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = post_row.user_id
      AND template_key = notification_template
      AND related_entity_id = post_row.id
      AND metadata->>'submission_number' = review_case.submission_number::TEXT
  ) THEN
    INSERT INTO public.notifications (
      user_id, type, actor_id, post_id, content, read,
      template_key, related_entity_type, related_entity_id,
      metadata, delivery_status, sent_at
    ) VALUES (
      post_row.user_id, 'system', NULL, post_row.id, notification_content, FALSE,
      notification_template, 'post', post_row.id,
      notification_meta, 'sent', NOW()
    );
  END IF;

  INSERT INTO public.admin_audit_logs (
    admin_id, action, target_type, target_id, note, metadata
  ) VALUES (
    admin_id,
    CASE WHEN rejected THEN 'reject_post' ELSE 'approve_post' END,
    'post', post_row.id, final_reason,
    jsonb_build_object(
      'review_case_id', review_case.id,
      'post_version_id', version_row.id,
      'submission_number', review_case.submission_number,
      'decision', decision,
      'confirmed_finding_ids', confirmed_finding_ids,
      'dismissed_finding_ids', dismissed_finding_ids,
      'manual_findings_count', manual_count,
      'issues', issues
    )
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'post_id', post_row.id,
    'review_case_id', review_case.id,
    'post_version_id', version_row.id,
    'decision', decision,
    'issues', issues
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_decide_post_review(
  UUID, UUID, TEXT, TEXT, UUID[], UUID[], JSONB
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_decide_post_review(
  UUID, UUID, TEXT, TEXT, UUID[], UUID[], JSONB
) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_decide_post_review(
  UUID, UUID, TEXT, TEXT, UUID[], UUID[], JSONB
) TO authenticated, service_role;

COMMIT;

-- ============================================================
-- 执行后只读核验（单独运行）
-- ============================================================
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'post_versions'
-- ORDER BY ordinal_position;
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'posts'
-- AND column_name IN ('published_version_number', 'pending_version_id', 'pending_review_status', 'pending_review_reason');
-- SELECT proname FROM pg_proc WHERE proname IN ('screen_post_submission', 'complete_image_screening', 'admin_decide_post_review');
