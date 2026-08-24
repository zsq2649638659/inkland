-- Inkland 审核触发器性能修复 v1
-- 文件：moderation-screen-performance-fix-v1.sql
-- 前置：moderation-risk-thresholds-v1.sql 已执行（52,725 条规则已入库）。
--
-- 背景：screen_post_submission() / screen_series_submission() 原实现会在每个
-- 标题、作者的话、正文段落里分别对整张 moderation_rules（5 万+条）做全表扫描，
-- 长文批量发布时容易超过语句超时，表现为批量导入“成功 0 篇，失败 4 篇”。
--
-- 修复：新增候选规则临时表，先在“标题 + 正文 + 作者的话”合并文本上对 52k 条
-- 规则做一次预筛选，再只对命中规则逐段定位/计数；匹配、白名单、阈值语义不变。
--
-- 幂等：仅使用 CREATE OR REPLACE FUNCTION，可重复执行。

BEGIN;

-- ============================================================
-- 一、重写作品提交审核触发器（候选规则先行 + 逐段定位）
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
  combined_text TEXT;
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

  -- 候选规则：只对整篇合并文本做一次 52k 条规则扫描，
  -- 之后各段落只检查候选规则，避免段落数 × 规则数的全表扫描。
  CREATE TEMP TABLE IF NOT EXISTS tmp_post_moderation_rule_candidates (
    rule_id UUID PRIMARY KEY,
    pattern TEXT NOT NULL,
    category TEXT NOT NULL,
    severity TEXT NOT NULL,
    risk_level TEXT NOT NULL,
    min_hits INTEGER NOT NULL
  ) ON COMMIT DROP;
  DELETE FROM pg_temp.tmp_post_moderation_rule_candidates WHERE 1=1;

  combined_text := COALESCE(NEW.title, '') || E'\n'
    || COALESCE(content_without_note, '') || E'\n'
    || COALESCE(NEW.author_note, '');

  INSERT INTO pg_temp.tmp_post_moderation_rule_candidates (
    rule_id, pattern, category, severity, risk_level, min_hits
  )
  SELECT keyword.id, keyword.pattern, keyword.category, keyword.severity,
         COALESCE(keyword.risk_level, 'low') AS risk_level,
         GREATEST(COALESCE(keyword.min_hits, 5), 1) AS min_hits
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
    );

  -- ---- 标题与作者的话：只扫描候选规则 ----
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
      SELECT cand.rule_id, cand.pattern, cand.category, cand.severity,
             cand.risk_level, cand.min_hits
      FROM pg_temp.tmp_post_moderation_rule_candidates cand
      WHERE position(lower(cand.pattern) IN lower(segment_text)) > 0
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

      SELECT finding_count INTO finding_count
      FROM pg_temp.tmp_post_moderation_hits
      WHERE rule_id = rule_row.id;

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
          UPDATE pg_temp.tmp_post_moderation_hits
          SET finding_count = finding_count + 1
          WHERE rule_id = rule_row.id;
        END IF;
        search_from := search_from + relative_offset + char_length(rule_row.pattern);
      END LOOP;
    END LOOP;
  END LOOP;

  -- ---- 正文字段（按段落定位，只扫描候选规则） ----
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
          SELECT cand.rule_id, cand.pattern, cand.category, cand.severity,
                 cand.risk_level, cand.min_hits
          FROM pg_temp.tmp_post_moderation_rule_candidates cand
          WHERE position(lower(cand.pattern) IN lower(paragraph_text)) > 0
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

          SELECT finding_count INTO finding_count
          FROM pg_temp.tmp_post_moderation_hits
          WHERE rule_id = rule_row.id;

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
              UPDATE pg_temp.tmp_post_moderation_hits
              SET finding_count = finding_count + 1
              WHERE rule_id = rule_row.id;
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

-- ============================================================
-- 二、重写连载提交审核触发器（候选规则先行）
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

  -- 候选规则：连载名称 + 简介只做一次 52k 条规则扫描。
  CREATE TEMP TABLE IF NOT EXISTS tmp_series_moderation_rule_candidates (
    rule_id UUID PRIMARY KEY,
    pattern TEXT NOT NULL,
    category TEXT NOT NULL,
    severity TEXT NOT NULL,
    risk_level TEXT NOT NULL,
    min_hits INTEGER NOT NULL
  ) ON COMMIT DROP;
  DELETE FROM pg_temp.tmp_series_moderation_rule_candidates WHERE 1=1;

  INSERT INTO pg_temp.tmp_series_moderation_rule_candidates (
    rule_id, pattern, category, severity, risk_level, min_hits
  )
  SELECT keyword.id, keyword.pattern, keyword.category, keyword.severity,
         COALESCE(keyword.risk_level, 'low') AS risk_level,
         GREATEST(COALESCE(keyword.min_hits, 5), 1) AS min_hits
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
    );

  segment_text := combined_text;
  v_segment_details := '连载名称或简介命中审核关键词';

  IF segment_text <> '' THEN
    FOR rule_row IN
      SELECT cand.rule_id, cand.pattern, cand.category, cand.severity,
             cand.risk_level, cand.min_hits
      FROM pg_temp.tmp_series_moderation_rule_candidates cand
      WHERE position(lower(cand.pattern) IN lower(segment_text)) > 0
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

      SELECT finding_count INTO finding_count
      FROM pg_temp.tmp_series_moderation_hits
      WHERE rule_id = rule_row.id;

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
          UPDATE pg_temp.tmp_series_moderation_hits
          SET finding_count = finding_count + 1
          WHERE rule_id = rule_row.id;
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

COMMIT;
