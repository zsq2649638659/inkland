-- Inkland 重复提交拦截与后台内容比对 v1
--
-- 前置：admin-moderation-v1-foundation.sql、text-review-closure-v1.sql
--       （均由用户在 Supabase SQL Editor 执行过）
--
-- 本迁移只做增量添加，不删除作品、用户、版本或审核记录。
-- 目标：
-- 1. 管理员打回后，作者未修改内容时禁止再次提交审核（数据库层真实拦截）；
-- 2. 后台审核详情页通过 compare_post_submission 查询“与上次打回内容是否一致”。

BEGIN;

-- ============================================================
-- 一、内容规范化辅助函数
-- ============================================================

CREATE OR REPLACE FUNCTION public.normalize_content_for_compare(input_text TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT btrim(regexp_replace(
    replace(COALESCE(input_text, ''), chr(12288), ' '),
    E'\\s+', ' ', 'g'
  ));
$$;

COMMENT ON FUNCTION public.normalize_content_for_compare(TEXT)
  IS '打回后重新提交的内容比对用：折叠连续空白、忽略首尾空白。';

-- ============================================================
-- 二、数据库层拦截：未修改的违规作品不能重新发布
-- ============================================================

CREATE OR REPLACE FUNCTION public.posts_guard_unchanged_resubmission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  previous public.post_versions%ROWTYPE;
BEGIN
  -- 只拦截进入审核队列的公开提交；私密作品与草稿不受影响。
  IF NEW.review_status IS DISTINCT FROM 'pending'
     OR COALESCE(NEW.visibility, 'public') = 'private' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND (OLD.review_status = 'rejected' OR OLD.pending_review_status = 'rejected') THEN
    -- 同一作品重新提交：优先取 pending_version_id 指向的冻结版本，兜底取最近一次打回版本。
    IF OLD.pending_version_id IS NOT NULL THEN
      SELECT * INTO previous
      FROM public.post_versions
      WHERE id = OLD.pending_version_id
        AND post_id = OLD.id;
    END IF;
    IF previous.id IS NULL THEN
      SELECT v.* INTO previous
      FROM public.post_versions v
      JOIN public.moderation_review_cases c ON c.post_version_id = v.id
      WHERE v.post_id = OLD.id
        AND c.status = 'changes_requested'
      ORDER BY v.submitted_at DESC, v.version_number DESC
      LIMIT 1;
    END IF;
  ELSE
    -- 新建作品：防止把同一违规内容换个作品重新发布。
    SELECT v.* INTO previous
    FROM public.post_versions v
    JOIN public.moderation_review_cases c ON c.post_version_id = v.id
    WHERE v.author_id = NEW.user_id
      AND c.status = 'changes_requested'
    ORDER BY v.submitted_at DESC, v.version_number DESC
    LIMIT 1;
  END IF;

  IF previous.id IS NOT NULL
     AND public.normalize_content_for_compare(NEW.title)
       = public.normalize_content_for_compare(previous.title)
     AND public.normalize_content_for_compare(NEW.content)
       = public.normalize_content_for_compare(previous.content)
     AND public.normalize_content_for_compare(NEW.author_note)
       = public.normalize_content_for_compare(previous.author_note)
     AND COALESCE(NEW.series_name, '') = COALESCE(previous.series_name, '')
     AND COALESCE(NEW.chapter_number, 0) = COALESCE(previous.chapter_number, 0)
     AND COALESCE(NEW.chapter_title, '') = COALESCE(previous.chapter_title, '')
     AND COALESCE(NEW.post_type, '') = COALESCE(previous.post_type, '') THEN
    RAISE EXCEPTION 'ERR_SAME_AS_REJECTED: 作品内容与上次打回时相同，请修改后再提交审核。';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS posts_guard_unchanged_resubmission ON public.posts;
CREATE TRIGGER posts_guard_unchanged_resubmission
BEFORE INSERT OR UPDATE OF title, content, review_status, author_note,
  series_name, chapter_number, chapter_title, post_type
ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.posts_guard_unchanged_resubmission();

-- 同名表上的 BEFORE 触发器按名称字母序执行：
-- posts_guard_unchanged_resubmission（g）先于 posts_screen_submission（s），
-- 因此拦截时读到的是作者提交的原始内容，而不是筛查后改写的内容。

-- ============================================================
-- 三、后台内容比对：查询本次提交与最近一次打回是否一致
-- ============================================================

CREATE OR REPLACE FUNCTION public.compare_post_submission(
  target_post_id UUID,
  target_version_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current public.post_versions%ROWTYPE;
  previous public.post_versions%ROWTYPE;
  changed_fields TEXT[] := '{}';
  identical BOOLEAN := TRUE;
BEGIN
  SELECT * INTO current
  FROM public.post_versions
  WHERE id = target_version_id;

  IF current.id IS NULL THEN
    RETURN jsonb_build_object('available', FALSE, 'error', 'version_not_found');
  END IF;

  SELECT v.* INTO previous
  FROM public.post_versions v
  JOIN public.moderation_review_cases c ON c.post_version_id = v.id
  WHERE v.post_id = target_post_id
    AND c.status = 'changes_requested'
    AND v.submission_number IS NOT NULL
    AND current.submission_number IS NOT NULL
    AND v.submission_number < current.submission_number
  ORDER BY v.submitted_at DESC, v.version_number DESC
  LIMIT 1;

  IF previous.id IS NULL THEN
    RETURN jsonb_build_object(
      'available', FALSE,
      'current_submission_number', current.submission_number
    );
  END IF;

  IF public.normalize_content_for_compare(current.title)
     <> public.normalize_content_for_compare(previous.title) THEN
    changed_fields := changed_fields || 'title';
    identical := FALSE;
  END IF;
  IF public.normalize_content_for_compare(current.content)
     <> public.normalize_content_for_compare(previous.content) THEN
    changed_fields := changed_fields || 'content';
    identical := FALSE;
  END IF;
  IF public.normalize_content_for_compare(current.author_note)
     <> public.normalize_content_for_compare(previous.author_note) THEN
    changed_fields := changed_fields || 'author_note';
    identical := FALSE;
  END IF;
  IF COALESCE(current.series_name, '') <> COALESCE(previous.series_name, '') THEN
    changed_fields := changed_fields || 'series_name';
    identical := FALSE;
  END IF;
  IF COALESCE(current.chapter_number, 0) <> COALESCE(previous.chapter_number, 0) THEN
    changed_fields := changed_fields || 'chapter_number';
    identical := FALSE;
  END IF;
  IF COALESCE(current.chapter_title, '') <> COALESCE(previous.chapter_title, '') THEN
    changed_fields := changed_fields || 'chapter_title';
    identical := FALSE;
  END IF;
  IF COALESCE(current.post_type, '') <> COALESCE(previous.post_type, '') THEN
    changed_fields := changed_fields || 'post_type';
    identical := FALSE;
  END IF;

  RETURN jsonb_build_object(
    'available', TRUE,
    'is_identical', identical,
    'changed_fields', changed_fields,
    'current_submission_number', current.submission_number,
    'previous_submission_number', previous.submission_number,
    'previous_version_id', previous.id,
    'previous_submitted_at', previous.submitted_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.compare_post_submission(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.compare_post_submission(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.compare_post_submission(UUID, UUID)
  TO authenticated, service_role;

COMMIT;

-- 执行后只读核验（单独运行）：
-- SELECT proname FROM pg_proc
-- WHERE proname IN ('normalize_content_for_compare', 'posts_guard_unchanged_resubmission', 'compare_post_submission');
-- SELECT tgname FROM pg_trigger
-- WHERE tgrelid = 'public.posts'::regclass AND NOT tgisinternal;
