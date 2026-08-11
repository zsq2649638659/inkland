-- 图片自动审核 v3：允许 NSFWJS 作为“只升级、不放行”的辅助风险来源。
-- 先执行约束更新，再替换写回函数。该迁移不会删除作品或用户数据。

ALTER TABLE public.moderation_findings
  DROP CONSTRAINT IF EXISTS moderation_findings_source_check;

ALTER TABLE public.moderation_findings
  ADD CONSTRAINT moderation_findings_source_check
  CHECK (source IN ('keyword', 'moderation_api', 'nudenet_modelscope', 'nsfwjs_client', 'rating_rule', 'admin'));

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

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(findings) item
    WHERE item->>'source' = 'nsfwjs_client'
  ) THEN
    case_sources := array_append(case_sources, 'nsfwjs_client');
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
    case_sources,
    result,
    'nudenet-modelscope-v1+nsfwjs-client-v1',
    post_row.review_submission_number
  )
  RETURNING id INTO case_id;

  FOR finding IN SELECT value FROM jsonb_array_elements(findings) LOOP
    finding_source := COALESCE(finding->>'source', 'nudenet_modelscope');
    IF finding_source NOT IN ('nudenet_modelscope', 'nsfwjs_client') THEN
      finding_source := 'nudenet_modelscope';
    END IF;

    INSERT INTO public.moderation_findings (
      review_case_id, source, category, severity, location_type,
      image_index, details, metadata
    )
    VALUES (
      case_id,
      finding_source,
      finding->>'category',
      COALESCE(finding->>'severity', 'high'),
      'image',
      COALESCE((finding->>'image_index')::INTEGER, 0),
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
      reviewed_at = NULL
  WHERE id = post_id_input;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_image_screening(UUID, TEXT, JSONB, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.complete_image_screening(UUID, TEXT, JSONB, JSONB) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_image_screening(UUID, TEXT, JSONB, JSONB) TO service_role;
