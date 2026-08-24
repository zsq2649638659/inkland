-- Inkland 敏感词风险分级与最低命中次数 v1
-- 文件：moderation-risk-thresholds-v1.sql
-- 前置：moderation-rules-bulk-import-v1.sql、text-review-closure-v1.sql、
--       text-screening-v4-series-image.sql 已按顺序执行。
--
-- 本迁移做四件事：
--   1. moderation_rules 增加 risk_level（low/medium/high）与 min_hits（1..999）；
--      保留 severity 供审核详情/举报模块兼容，风险等级变化时自动同步；
--   2. 重写 screen_post_submission()：
--      标题 + 正文 + 作者的话整篇累计，不区分大小写、不重叠计数、白名单优先；
--      高风险同一词累计 1 次、中风险 3 次、低风险 5 次进人工审核；
--      同一篇命中 5 个及以上不同低风险词同样进一次人工审核；
--   3. 重写 screen_series_submission()：连载名称 + 简介使用同一套风险阈值；
--   4. 重写 admin_bulk_import_moderation_rules()：
--      批量导入支持低/中/高风险与自定义最低命中次数。
--
-- 旧数据回填规则：severity='high' 回填为 high/1；旧 severity='review' 回填为
-- medium/3（比新的低风险更接近旧的“命中即审核”，又不等于高风险）。
-- 幂等：全部使用 IF NOT EXISTS / IF EXISTS，可重复执行。

SET lock_timeout = '10s';

BEGIN;

-- ============================================================
-- 一、moderation_rules 增加风险等级与阈值字段
-- ============================================================

ALTER TABLE public.moderation_rules
  ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT 'low';
ALTER TABLE public.moderation_rules
  ADD COLUMN IF NOT EXISTS min_hits INTEGER DEFAULT 5;

-- 回填旧规则后在列上收紧约束，避免把历史数据置空。
UPDATE public.moderation_rules
SET risk_level = CASE WHEN severity = 'high' THEN 'high' ELSE 'medium' END
WHERE risk_level IS NULL;

UPDATE public.moderation_rules
SET min_hits = CASE
  WHEN COALESCE(risk_level, 'medium') = 'high' THEN 1
  WHEN COALESCE(risk_level, 'medium') = 'low' THEN 5
  ELSE 3
END
WHERE min_hits IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.moderation_rules'::regclass
      AND conname = 'moderation_rules_risk_level_check'
  ) THEN
    ALTER TABLE public.moderation_rules
      ADD CONSTRAINT moderation_rules_risk_level_check
      CHECK (risk_level IN ('low', 'medium', 'high'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.moderation_rules'::regclass
      AND conname = 'moderation_rules_min_hits_check'
  ) THEN
    ALTER TABLE public.moderation_rules
      ADD CONSTRAINT moderation_rules_min_hits_check
      CHECK (min_hits >= 1 AND min_hits <= 999);
  END IF;
END $$;

ALTER TABLE public.moderation_rules
  ALTER COLUMN risk_level SET DEFAULT 'low';
ALTER TABLE public.moderation_rules
  ALTER COLUMN min_hits SET DEFAULT 5;
ALTER TABLE public.moderation_rules
  ALTER COLUMN risk_level SET NOT NULL;
ALTER TABLE public.moderation_rules
  ALTER COLUMN min_hits SET NOT NULL;

-- risk_level 与 severity 保持同步；白名单始终为 review。
CREATE OR REPLACE FUNCTION public.sync_moderation_rule_severity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.rule_type = 'keyword' THEN
    NEW.severity := CASE WHEN NEW.risk_level = 'high' THEN 'high' ELSE 'review' END;
  ELSE
    NEW.severity := 'review';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS moderation_rules_severity_sync ON public.moderation_rules;
CREATE TRIGGER moderation_rules_severity_sync
BEFORE INSERT OR UPDATE OF risk_level, min_hits, rule_type ON public.moderation_rules
FOR EACH ROW EXECUTE FUNCTION public.sync_moderation_rule_severity();

-- ============================================================
-- 二、不重叠文本计数辅助函数
-- ============================================================

CREATE OR REPLACE FUNCTION public.count_non_overlapping_matches(
  haystack TEXT,
  needle TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  v_hay TEXT := lower(COALESCE(haystack, ''));
  v_needle TEXT := lower(COALESCE(needle, ''));
  v_needle_len INTEGER;
  v_position INTEGER := 1;
  v_found INTEGER;
  v_count INTEGER := 0;
BEGIN
  IF v_hay = '' OR v_needle = '' THEN
    RETURN 0;
  END IF;
  v_needle_len := char_length(v_needle);
  LOOP
    v_found := position(v_needle IN v_hay FROM v_position);
    EXIT WHEN v_found = 0;
    v_count := v_count + 1;
    v_position := v_position + v_found + v_needle_len;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.count_non_overlapping_matches(TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.count_non_overlapping_matches(TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.count_non_overlapping_matches(TEXT, TEXT)
  TO authenticated, service_role;

-- ============================================================
-- 三、重写作品提交审核触发器
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
  has_high_risk BOOLEAN := FALSE;
  requested_visibility TEXT;
  content_without_note TEXT;
  paragraphs TEXT[];
  paragraph_text TEXT;
  paragraph_index INTEGER;
  base_offset INTEGER := 0;
  published_before BOOLEAN := FALSE;
  pending_message TEXT;
  segment_text TEXT;
  segment_count INTEGER;
  search_from INTEGER;
  relative_offset INTEGER;
  absolute_offset INTEGER;
  existing_count INTEGER;
  finding_count INTEGER;
  v_finding_cap INTEGER := 30;
  v_segment_field_name TEXT;
  v_segment_location_type TEXT;
  v_segment_paragraph_index INTEGER := 1;
  v_segment_base_offset INTEGER := 0;
  v_segment_details TEXT;
  v_case_triggered BOOLEAN := FALSE;
  v_total_hits INTEGER := 0;
  v_matched_rules INTEGER := 0;
  v_route_reason TEXT;
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

  CREATE TEMP TABLE IF NOT EXISTS tmp_post_moderation_hits (
    rule_id UUID PRIMARY KEY,
    pattern TEXT NOT NULL,
    category TEXT NOT NULL,
    severity TEXT NOT NULL,
    risk_level TEXT NOT NULL,
    min_hits INTEGER NOT NULL,
    hit_count INTEGER NOT NULL DEFAULT 0,
    finding_count INTEGER NOT NULL DEFAULT 0
  ) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS tmp_post_moderation_findings (
    category TEXT NOT NULL,
    severity TEXT NOT NULL,
    location_type TEXT NOT NULL,
    field_name TEXT,
    paragraph_index INTEGER,
    start_offset INTEGER,
    end_offset INTEGER,
    quoted_text TEXT,
    details TEXT,
    metadata JSONB
  ) ON COMMIT DROP;
  DELETE FROM pg_temp.tmp_post_moderation_hits WHERE 1=1;
  DELETE FROM pg_temp.tmp_post_moderation_findings WHERE 1=1;

  -- ---- 标题与作者的话：整段扫描 ----
  FOR segment_text,
      v_segment_field_name,
      v_segment_paragraph_index,
      v_segment_base_offset,
      v_segment_location_type,
      v_segment_details IN
    SELECT COALESCE(NEW.title, ''), 'title', 1, 0, 'text_range',
           CASE WHEN NEW.post_type = 'illustration' THEN '图片标题命中审核关键词' ELSE '标题命中审核关键词' END
    UNION ALL
    SELECT COALESCE(NEW.author_note, ''), 'author_note', 1, 0, 'text_range',
           '作者的话命中审核关键词'
  LOOP
    IF segment_text = '' THEN
      CONTINUE;
    END IF;

    FOR rule_row IN
      SELECT keyword.id, keyword.pattern, keyword.category, keyword.severity,
             COALESCE(keyword.risk_level, 'low') AS risk_level,
             GREATEST(COALESCE(keyword.min_hits, 5), 1) AS min_hits
      FROM public.moderation_rules keyword
      WHERE keyword.rule_type = 'keyword'
        AND keyword.enabled = TRUE
        AND position(lower(keyword.pattern) IN lower(segment_text)) > 0
        AND NOT EXISTS (
          SELECT 1 FROM public.moderation_rules whitelist
          WHERE whitelist.rule_type = 'whitelist'
            AND whitelist.enabled = TRUE
            AND whitelist.category = keyword.category
            AND lower(whitelist.pattern) = lower(keyword.pattern)
        )
    LOOP
      segment_count := public.count_non_overlapping_matches(segment_text, rule_row.pattern);
      IF segment_count <= 0 THEN
        CONTINUE;
      END IF;

      SELECT hit_count INTO existing_count
      FROM pg_temp.tmp_post_moderation_hits
      WHERE rule_id = rule_row.id;
      IF existing_count IS NULL THEN
        INSERT INTO pg_temp.tmp_post_moderation_hits (
          rule_id, pattern, category, severity, risk_level, min_hits,
          hit_count, finding_count
        ) VALUES (
          rule_row.id, rule_row.pattern, rule_row.category, rule_row.severity,
          rule_row.risk_level, rule_row.min_hits, segment_count, 0
        );
      ELSE
        UPDATE pg_temp.tmp_post_moderation_hits
        SET hit_count = hit_count + segment_count
        WHERE rule_id = rule_row.id;
      END IF;

      SELECT h.finding_count INTO finding_count
      FROM pg_temp.tmp_post_moderation_hits h
      WHERE h.rule_id = rule_row.id;

      search_from := 1;
      WHILE search_from <= char_length(segment_text) LOOP
        relative_offset := position(
          lower(rule_row.pattern) IN lower(substr(segment_text, search_from))
        );
        EXIT WHEN relative_offset = 0;
        absolute_offset := search_from + relative_offset - 1;
        IF finding_count < v_finding_cap THEN
          INSERT INTO pg_temp.tmp_post_moderation_findings (
            category, severity, location_type, field_name, paragraph_index,
            start_offset, end_offset, quoted_text, details, metadata
          ) VALUES (
            rule_row.category, rule_row.severity, v_segment_location_type,
            v_segment_field_name, v_segment_paragraph_index,
            v_segment_base_offset + absolute_offset - 1,
            v_segment_base_offset + absolute_offset - 1 + char_length(rule_row.pattern),
            rule_row.pattern, v_segment_details,
            jsonb_build_object('rule_id', rule_row.id, 'pattern', rule_row.pattern)
          );
          UPDATE pg_temp.tmp_post_moderation_hits AS h
          SET finding_count = h.finding_count + 1
          WHERE h.rule_id = rule_row.id;
        END IF;
        search_from := search_from + relative_offset + char_length(rule_row.pattern);
      END LOOP;
    END LOOP;
  END LOOP;

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

        segment_text := paragraph_text;
        v_segment_field_name := 'content';
        v_segment_location_type := 'paragraph';
        v_segment_paragraph_index := paragraph_index;
        v_segment_base_offset := base_offset;
        v_segment_details := CASE
          WHEN NEW.post_type = 'illustration' THEN '图片说明命中审核关键词'
          ELSE '正文命中审核关键词'
        END;

        FOR rule_row IN
          SELECT keyword.id, keyword.pattern, keyword.category, keyword.severity,
                 COALESCE(keyword.risk_level, 'low') AS risk_level,
                 GREATEST(COALESCE(keyword.min_hits, 5), 1) AS min_hits
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
          segment_count := public.count_non_overlapping_matches(paragraph_text, rule_row.pattern);
          IF segment_count <= 0 THEN
            CONTINUE;
          END IF;

          SELECT hit_count INTO existing_count
          FROM pg_temp.tmp_post_moderation_hits
          WHERE rule_id = rule_row.id;
          IF existing_count IS NULL THEN
            INSERT INTO pg_temp.tmp_post_moderation_hits (
              rule_id, pattern, category, severity, risk_level, min_hits,
              hit_count, finding_count
            ) VALUES (
              rule_row.id, rule_row.pattern, rule_row.category, rule_row.severity,
              rule_row.risk_level, rule_row.min_hits, segment_count, 0
            );
          ELSE
            UPDATE pg_temp.tmp_post_moderation_hits
            SET hit_count = hit_count + segment_count
            WHERE rule_id = rule_row.id;
          END IF;

          SELECT h.finding_count INTO finding_count
          FROM pg_temp.tmp_post_moderation_hits h
          WHERE h.rule_id = rule_row.id;

          search_from := 1;
          WHILE search_from <= char_length(paragraph_text) LOOP
            relative_offset := position(
              lower(rule_row.pattern) IN lower(substr(paragraph_text, search_from))
            );
            EXIT WHEN relative_offset = 0;
            absolute_offset := search_from + relative_offset - 1;
            IF finding_count < v_finding_cap THEN
              INSERT INTO pg_temp.tmp_post_moderation_findings (
                category, severity, location_type, field_name, paragraph_index,
                start_offset, end_offset, quoted_text, details, metadata
              ) VALUES (
                rule_row.category, rule_row.severity, v_segment_location_type,
                v_segment_field_name, v_segment_paragraph_index,
                v_segment_base_offset + absolute_offset - 1,
                v_segment_base_offset + absolute_offset - 1 + char_length(rule_row.pattern),
                rule_row.pattern, v_segment_details,
                jsonb_build_object('rule_id', rule_row.id, 'pattern', rule_row.pattern)
              );
              UPDATE pg_temp.tmp_post_moderation_hits AS h
              SET finding_count = h.finding_count + 1
              WHERE h.rule_id = rule_row.id;
            END IF;
            search_from := search_from + relative_offset + char_length(rule_row.pattern);
          END LOOP;
        END LOOP;

        base_offset := base_offset + char_length(paragraph_text) + 2;
      END LOOP;
    END IF;
  END IF;

  -- ---- 按阈值决定是否进入人工审核 ----
  SELECT EXISTS (
    SELECT 1 FROM pg_temp.tmp_post_moderation_hits h
    WHERE h.hit_count >= h.min_hits
  ) INTO v_case_triggered;

  IF NOT v_case_triggered THEN
    SELECT COUNT(DISTINCT h.rule_id) >= 5 INTO v_case_triggered
    FROM pg_temp.tmp_post_moderation_hits h
    WHERE h.risk_level = 'low' AND h.hit_count > 0;
  END IF;

  SELECT COALESCE(SUM(hit_count), 0), COUNT(*)
  INTO v_total_hits, v_matched_rules
  FROM pg_temp.tmp_post_moderation_hits;

  IF v_case_triggered THEN
    SELECT EXISTS (
      SELECT 1 FROM pg_temp.tmp_post_moderation_hits h
      WHERE h.risk_level = 'high' AND h.hit_count >= h.min_hits
    )
    INTO has_high_risk;

    v_route_reason := CASE
      WHEN NEW.post_type = 'illustration' THEN '图片标题或说明命中审核关键词'
      ELSE '作品内容命中审核关键词'
    END;

    INSERT INTO public.moderation_review_cases (
      post_id, post_version_id, author_id, status, priority, route_reason,
      screening_status, screening_sources, screening_result, rules_version,
      submission_number
    ) VALUES (
      NEW.id, version_id, NEW.user_id, 'pending',
      CASE WHEN has_high_risk THEN 'high' ELSE 'normal' END,
      v_route_reason, 'completed', ARRAY['keyword'],
      jsonb_build_object(
        'engine', 'keyword-v2',
        'total_hits', v_total_hits,
        'matched_rules', v_matched_rules
      ),
      'keyword-v2', next_submission_number
    ) RETURNING id INTO review_case_id;

    INSERT INTO public.moderation_findings (
      review_case_id, source, category, severity, location_type, field_name,
      paragraph_index, start_offset, end_offset, quoted_text, details, metadata
    )
    SELECT
      review_case_id, 'keyword', category, severity, location_type, field_name,
      paragraph_index, start_offset, end_offset, quoted_text, details, metadata
    FROM pg_temp.tmp_post_moderation_findings;

    UPDATE public.moderation_rules mr
    SET hit_count = mr.hit_count + h.hit_count, last_hit_at = NOW()
    FROM pg_temp.tmp_post_moderation_hits h
    WHERE mr.id = h.rule_id;
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
        WHEN v_case_triggered THEN '图片标题或说明已进入人工审核。'
        ELSE '图片正在自动审核。'
      END;
    END IF;
    NEW.pending_review_reason := NEW.review_reason;
    RETURN NEW;
  END IF;

  -- ---- 文字/连载章节 ----
  IF NOT v_case_triggered THEN
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

-- 确保作品触发器存在。
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
-- 四、重写连载提交审核触发器
-- ============================================================

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
  segment_text TEXT;
  segment_count INTEGER;
  search_from INTEGER;
  relative_offset INTEGER;
  absolute_offset INTEGER;
  existing_count INTEGER;
  finding_count INTEGER;
  v_finding_cap INTEGER := 30;
  v_segment_field_name TEXT;
  v_segment_location_type TEXT := 'text_range';
  v_segment_paragraph_index INTEGER := 1;
  v_segment_base_offset INTEGER := 0;
  v_segment_details TEXT;
  v_case_triggered BOOLEAN := FALSE;
  v_total_hits INTEGER := 0;
  v_matched_rules INTEGER := 0;
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

  CREATE TEMP TABLE IF NOT EXISTS tmp_series_moderation_hits (
    rule_id UUID PRIMARY KEY,
    pattern TEXT NOT NULL,
    category TEXT NOT NULL,
    severity TEXT NOT NULL,
    risk_level TEXT NOT NULL,
    min_hits INTEGER NOT NULL,
    hit_count INTEGER NOT NULL DEFAULT 0,
    finding_count INTEGER NOT NULL DEFAULT 0
  ) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS tmp_series_moderation_findings (
    category TEXT NOT NULL,
    severity TEXT NOT NULL,
    location_type TEXT NOT NULL,
    field_name TEXT,
    paragraph_index INTEGER,
    start_offset INTEGER,
    end_offset INTEGER,
    quoted_text TEXT,
    details TEXT,
    metadata JSONB
  ) ON COMMIT DROP;
  DELETE FROM pg_temp.tmp_series_moderation_hits WHERE 1=1;
  DELETE FROM pg_temp.tmp_series_moderation_findings WHERE 1=1;

  segment_text := combined_text;
  v_segment_details := '连载名称或简介命中审核关键词';

  IF segment_text <> '' THEN
    FOR rule_row IN
      SELECT keyword.id, keyword.pattern, keyword.category, keyword.severity,
             COALESCE(keyword.risk_level, 'low') AS risk_level,
             GREATEST(COALESCE(keyword.min_hits, 5), 1) AS min_hits
      FROM public.moderation_rules keyword
      WHERE keyword.rule_type = 'keyword'
        AND keyword.enabled = TRUE
        AND position(lower(keyword.pattern) IN lower(segment_text)) > 0
        AND NOT EXISTS (
          SELECT 1 FROM public.moderation_rules whitelist
          WHERE whitelist.rule_type = 'whitelist'
            AND whitelist.enabled = TRUE
            AND whitelist.category = keyword.category
            AND lower(whitelist.pattern) = lower(keyword.pattern)
        )
    LOOP
      segment_count := public.count_non_overlapping_matches(segment_text, rule_row.pattern);
      IF segment_count <= 0 THEN
        CONTINUE;
      END IF;

      SELECT hit_count INTO existing_count
      FROM pg_temp.tmp_series_moderation_hits
      WHERE rule_id = rule_row.id;
      IF existing_count IS NULL THEN
        INSERT INTO pg_temp.tmp_series_moderation_hits (
          rule_id, pattern, category, severity, risk_level, min_hits,
          hit_count, finding_count
        ) VALUES (
          rule_row.id, rule_row.pattern, rule_row.category, rule_row.severity,
          rule_row.risk_level, rule_row.min_hits, segment_count, 0
        );
      ELSE
        UPDATE pg_temp.tmp_series_moderation_hits
        SET hit_count = hit_count + segment_count
        WHERE rule_id = rule_row.id;
      END IF;

      SELECT h.finding_count INTO finding_count
      FROM pg_temp.tmp_series_moderation_hits h
      WHERE h.rule_id = rule_row.id;

      search_from := 1;
      WHILE search_from <= char_length(segment_text) LOOP
        relative_offset := position(
          lower(rule_row.pattern) IN lower(substr(segment_text, search_from))
        );
        EXIT WHEN relative_offset = 0;
        absolute_offset := search_from + relative_offset - 1;
        IF finding_count < v_finding_cap THEN
          INSERT INTO pg_temp.tmp_series_moderation_findings (
            category, severity, location_type, field_name, paragraph_index,
            start_offset, end_offset, quoted_text, details, metadata
          ) VALUES (
            rule_row.category, rule_row.severity, v_segment_location_type,
            v_segment_field_name, v_segment_paragraph_index,
            v_segment_base_offset + absolute_offset - 1,
            v_segment_base_offset + absolute_offset - 1 + char_length(rule_row.pattern),
            rule_row.pattern, v_segment_details,
            jsonb_build_object('rule_id', rule_row.id, 'pattern', rule_row.pattern)
          );
          UPDATE pg_temp.tmp_series_moderation_hits AS h
          SET finding_count = h.finding_count + 1
          WHERE h.rule_id = rule_row.id;
        END IF;
        search_from := search_from + relative_offset + char_length(rule_row.pattern);
      END LOOP;
    END LOOP;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_temp.tmp_series_moderation_hits h
    WHERE h.hit_count >= h.min_hits
  ) INTO v_case_triggered;

  IF NOT v_case_triggered THEN
    SELECT COUNT(DISTINCT h.rule_id) >= 5 INTO v_case_triggered
    FROM pg_temp.tmp_series_moderation_hits h
    WHERE h.risk_level = 'low' AND h.hit_count > 0;
  END IF;

  SELECT COALESCE(SUM(hit_count), 0), COUNT(*)
  INTO v_total_hits, v_matched_rules
  FROM pg_temp.tmp_series_moderation_hits;

  IF v_case_triggered THEN
    SELECT EXISTS (
      SELECT 1 FROM pg_temp.tmp_series_moderation_hits h
      WHERE h.risk_level = 'high' AND h.hit_count >= h.min_hits
    )
    INTO has_high_risk;

    INSERT INTO public.series_moderation_review_cases (
      series_id, author_id, status, priority, route_reason,
      screening_status, screening_sources, screening_result,
      rules_version, submission_number
    ) VALUES (
      NEW.id, NEW.user_id, 'pending',
      CASE WHEN has_high_risk THEN 'high' ELSE 'normal' END,
      '连载名称或简介命中审核关键词', 'completed', ARRAY['keyword'],
      jsonb_build_object(
        'engine', 'keyword-v2',
        'total_hits', v_total_hits,
        'matched_rules', v_matched_rules
      ),
      'keyword-v2', next_submission
    ) RETURNING id INTO case_id;

    INSERT INTO public.series_moderation_findings (
      review_case_id, category, severity, location_type,
      start_offset, end_offset, quoted_text, details, metadata
    )
    SELECT
      case_id, category, severity, location_type,
      start_offset, end_offset, quoted_text, details, metadata
    FROM pg_temp.tmp_series_moderation_findings;

    UPDATE public.moderation_rules mr
    SET hit_count = mr.hit_count + h.hit_count, last_hit_at = NOW()
    FROM pg_temp.tmp_series_moderation_hits h
    WHERE mr.id = h.rule_id;
  END IF;

  IF v_case_triggered THEN
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

-- 确保连载触发器存在。
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

-- ============================================================
-- 五、批量导入函数升级：三档风险 + 自定义最低次数
-- ============================================================

DROP FUNCTION IF EXISTS public.admin_bulk_import_moderation_rules(
  UUID, TEXT[], TEXT, TEXT, TEXT
);

CREATE OR REPLACE FUNCTION public.admin_bulk_import_moderation_rules(
  p_admin_id UUID,
  p_texts TEXT[],
  p_category TEXT,
  p_risk_level TEXT DEFAULT 'low',
  p_min_hits INTEGER DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_input INTEGER;
  v_blank_lines INTEGER := 0;
  v_invalid_lines INTEGER := 0;
  v_invalid_examples TEXT[] := ARRAY[]::TEXT[];
  v_batch_unique TEXT[] := ARRAY[]::TEXT[];
  v_existing_patterns TEXT[] := ARRAY[]::TEXT[];
  v_duplicated_in_batch INTEGER := 0;
  v_skipped INTEGER := 0;
  v_inserted INTEGER := 0;
  v_description TEXT;
  v_min_hits INTEGER;
  v_severity TEXT;
  v_item TEXT;
  v_batch_unique_count INTEGER := 0;
  i INTEGER;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_admin_id OR NOT public.is_admin() THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'code', 'not_admin',
      'message', '需要管理员权限。'
    );
  END IF;

  IF p_category IS NULL OR p_category NOT IN (
    '广告与导流', '诈骗与交易风险', '人身攻击与骚扰',
    '暴力与威胁', '成人与不当内容', '其他'
  ) THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'code', 'invalid_category',
      'message', '问题分类不正确。'
    );
  END IF;

  IF p_risk_level IS NULL OR p_risk_level NOT IN ('low', 'medium', 'high') THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'code', 'invalid_risk_level',
      'message', '风险级别不正确。'
    );
  END IF;

  v_min_hits := CASE p_risk_level
    WHEN 'high' THEN 1
    WHEN 'medium' THEN 3
    ELSE 5
  END;
  IF p_min_hits IS NOT NULL THEN
    IF p_min_hits < 1 OR p_min_hits > 999 THEN
      RETURN jsonb_build_object(
        'ok', FALSE,
        'code', 'invalid_min_hits',
        'message', '最低命中次数必须是 1 至 999。'
      );
    END IF;
    v_min_hits := p_min_hits;
  END IF;
  v_severity := CASE WHEN p_risk_level = 'high' THEN 'high' ELSE 'review' END;

  IF p_texts IS NULL THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'code', 'empty_batch',
      'message', '导入内容为空。'
    );
  END IF;

  v_total_input := array_length(p_texts, 1);
  IF v_total_input IS NULL OR v_total_input <= 0 THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'code', 'empty_batch',
      'message', '导入内容为空。'
    );
  END IF;

  IF v_total_input > 5000 THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'code', 'batch_too_large',
      'message', '单批最多 5000 条，请分批导入。'
    );
  END IF;

  v_description := NULLIF(btrim(COALESCE(p_description, '')), '');
  IF v_description IS NOT NULL AND char_length(v_description) > 500 THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'code', 'description_too_long',
      'message', '备注超过 500 个字符。'
    );
  END IF;

  LOCK TABLE public.moderation_rules IN SHARE ROW EXCLUSIVE MODE;

  SELECT COALESCE(array_agg(DISTINCT lower(pattern)), ARRAY[]::TEXT[])
  INTO v_existing_patterns
  FROM public.moderation_rules
  WHERE rule_type = 'keyword';

  FOR i IN 1..v_total_input LOOP
    v_item := btrim(COALESCE(p_texts[i], ''));
    IF v_item = '' THEN
      v_blank_lines := v_blank_lines + 1;
      CONTINUE;
    END IF;

    IF char_length(v_item) > 500 THEN
      v_invalid_lines := v_invalid_lines + 1;
      IF COALESCE(array_length(v_invalid_examples, 1), 0) < 10 THEN
        v_invalid_examples := v_invalid_examples || v_item;
      END IF;
      CONTINUE;
    END IF;

    IF lower(v_item) = ANY(v_batch_unique) THEN
      v_duplicated_in_batch := v_duplicated_in_batch + 1;
      CONTINUE;
    END IF;

    IF lower(v_item) = ANY(v_existing_patterns) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_batch_unique := v_batch_unique || v_item;
  END LOOP;

  v_batch_unique_count := COALESCE(array_length(v_batch_unique, 1), 0);
  IF v_batch_unique_count > 0 THEN
    INSERT INTO public.moderation_rules (
      rule_type, pattern, category, severity, risk_level, min_hits,
      description, enabled, created_by, updated_by
    )
    SELECT
      'keyword',
      candidate.pattern,
      p_category,
      v_severity,
      p_risk_level,
      v_min_hits,
      v_description,
      TRUE,
      p_admin_id,
      p_admin_id
    FROM unnest(v_batch_unique) AS candidate(pattern)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    v_skipped := v_skipped + (v_batch_unique_count - v_inserted);
  END IF;

  INSERT INTO public.admin_audit_logs (
    admin_id, action, target_type, target_id, note, metadata
  ) VALUES (
    p_admin_id,
    'bulk_import_moderation_rules',
    'moderation_rules',
    NULL,
    '批量导入敏感词：新增 ' || v_inserted || ' 条，跳过 ' || v_skipped || ' 条，无效 ' || v_invalid_lines || ' 条',
    jsonb_build_object(
      'category', p_category,
      'risk_level', p_risk_level,
      'min_hits', v_min_hits,
      'total_input', v_total_input,
      'blank_lines', v_blank_lines,
      'invalid_lines', v_invalid_lines,
      'invalid_examples', v_invalid_examples,
      'duplicated_in_batch', v_duplicated_in_batch,
      'inserted', v_inserted,
      'skipped', v_skipped,
      'batch_unique_count', v_batch_unique_count
    )
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'inserted', v_inserted,
    'skipped', v_skipped,
    'invalid_lines', v_invalid_lines,
    'invalid_examples', v_invalid_examples,
    'ignored_blank_lines', v_blank_lines,
    'duplicated_in_batch', v_duplicated_in_batch,
    'total_input', v_total_input,
    'category', p_category,
    'risk_level', p_risk_level,
    'min_hits', v_min_hits
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_bulk_import_moderation_rules(
  UUID, TEXT[], TEXT, TEXT, INTEGER, TEXT
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_bulk_import_moderation_rules(
  UUID, TEXT[], TEXT, TEXT, INTEGER, TEXT
) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_bulk_import_moderation_rules(
  UUID, TEXT[], TEXT, TEXT, INTEGER, TEXT
) TO authenticated, service_role;

COMMIT;

-- 执行后只读核验（单独运行）：
-- SELECT to_regprocedure('public.admin_bulk_import_moderation_rules(uuid,text[],text,text,integer,text)');
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'moderation_rules'
--   AND column_name IN ('risk_level', 'min_hits');
