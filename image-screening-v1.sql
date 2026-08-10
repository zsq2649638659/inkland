-- 图片 Moderation 回调：由登录作者调用，函数在数据库内安全更新审核状态。
BEGIN;

CREATE OR REPLACE FUNCTION public.complete_image_screening(post_id_input UUID, outcome TEXT, result JSONB, findings JSONB DEFAULT '[]'::jsonb)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE post_row public.posts%ROWTYPE; version_id UUID; case_id UUID; finding JSONB;
BEGIN
  SELECT * INTO post_row FROM public.posts WHERE id = post_id_input FOR UPDATE;
  IF post_row.id IS NULL OR post_row.user_id <> auth.uid() THEN RAISE EXCEPTION '无权处理此作品'; END IF;
  IF post_row.post_type <> 'illustration' OR post_row.review_status <> 'pending' THEN RETURN; END IF;
  SELECT id INTO version_id FROM public.post_versions WHERE post_id = post_id_input ORDER BY version_number DESC LIMIT 1;
  IF outcome = 'approved' THEN
    UPDATE public.posts SET review_status='approved', status='published', review_reason=NULL WHERE id=post_id_input;
    RETURN;
  END IF;
  INSERT INTO public.moderation_review_cases (post_id,post_version_id,author_id,status,priority,route_reason,screening_status,screening_sources,screening_result,rules_version,submission_number)
  VALUES (post_id_input,version_id,post_row.user_id,CASE WHEN outcome='service_error' THEN 'service_error' ELSE 'pending' END,
    CASE WHEN outcome='flagged' THEN 'high' ELSE 'normal' END,
    CASE WHEN outcome='flagged' THEN '图片自动审核发现风险' ELSE '图片审核服务异常' END,
    CASE WHEN outcome='service_error' THEN 'failed' ELSE 'completed' END,ARRAY['moderation_api'],result,'omni-moderation-latest',post_row.review_submission_number)
  RETURNING id INTO case_id;
  FOR finding IN SELECT value FROM jsonb_array_elements(findings) LOOP
    INSERT INTO public.moderation_findings (review_case_id,source,category,severity,location_type,image_index,details,metadata)
    VALUES (case_id,'moderation_api',finding->>'category','high','image',COALESCE((finding->>'image_index')::INTEGER,0),'图片审核接口标记风险',finding);
  END LOOP;
  UPDATE public.posts SET status='draft', review_reason=CASE WHEN outcome='service_error' THEN '图片审核服务异常，等待人工处理。' ELSE '图片已进入人工审核。' END WHERE id=post_id_input;
END; $$;

GRANT EXECUTE ON FUNCTION public.complete_image_screening(UUID,TEXT,JSONB,JSONB) TO authenticated;

-- 替换图片分支：保存版本后等待服务端调用 Moderation，不立即建人工案件。
CREATE OR REPLACE FUNCTION public.screen_post_submission()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE combined_text TEXT; next_version_number INTEGER; next_submission_number INTEGER; version_id UUID; review_case_id UUID; rule_row RECORD; match_offset INTEGER; matched_count INTEGER := 0; has_high_risk BOOLEAN := FALSE;
BEGIN
  IF NEW.review_status IS DISTINCT FROM 'pending' OR COALESCE(NEW.visibility,'public')='private' THEN RETURN NEW; END IF;
  combined_text:=COALESCE(NEW.title,'')||E'\n'||COALESCE(NEW.content,'');
  next_version_number:=CASE WHEN TG_OP='INSERT' THEN GREATEST(COALESCE(NEW.current_version_number,1),1) ELSE GREATEST(COALESCE(NEW.current_version_number,0),0)+1 END;
  next_submission_number:=GREATEST(COALESCE(NEW.review_submission_number,0),0)+1; NEW.current_version_number:=next_version_number; NEW.review_submission_number:=next_submission_number;
  INSERT INTO public.post_versions (post_id,author_id,version_number,submission_number,title,content,visibility,post_type,snapshot,submitted_at) VALUES (NEW.id,NEW.user_id,next_version_number,next_submission_number,COALESCE(NEW.title,''),COALESCE(NEW.content,''),NEW.visibility,NEW.post_type,jsonb_build_object('title',NEW.title,'content',NEW.content),NOW()) RETURNING id INTO version_id;
  IF NEW.post_type='illustration' THEN NEW.status:='draft'; NEW.review_reason:='图片正在自动审核。'; RETURN NEW; END IF;
  FOR rule_row IN SELECT keyword.id,keyword.pattern,keyword.category,keyword.severity FROM public.moderation_rules keyword WHERE keyword.rule_type='keyword' AND keyword.enabled AND position(lower(keyword.pattern) IN lower(combined_text))>0 LOOP
    IF review_case_id IS NULL THEN INSERT INTO public.moderation_review_cases(post_id,post_version_id,author_id,status,priority,route_reason,screening_status,screening_sources,screening_result,rules_version,submission_number) VALUES(NEW.id,version_id,NEW.user_id,'pending',CASE WHEN rule_row.severity='high' THEN 'high' ELSE 'normal' END,'关键词初筛命中','completed',ARRAY['keyword'],jsonb_build_object('engine','keyword-v1'),'keyword-v1',next_submission_number) RETURNING id INTO review_case_id; END IF;
    match_offset:=position(lower(rule_row.pattern) IN lower(combined_text)); INSERT INTO public.moderation_findings(review_case_id,source,category,severity,location_type,start_offset,end_offset,quoted_text,details,metadata) VALUES(review_case_id,'keyword',rule_row.category,rule_row.severity,'text_range',match_offset-1,match_offset-1+char_length(rule_row.pattern),rule_row.pattern,'命中审核关键词',jsonb_build_object('rule_id',rule_row.id)); matched_count:=matched_count+1; has_high_risk:=has_high_risk OR rule_row.severity='high'; UPDATE public.moderation_rules SET hit_count=hit_count+1,last_hit_at=NOW() WHERE id=rule_row.id;
  END LOOP;
  IF matched_count=0 THEN NEW.review_status:='approved'; NEW.status:='published'; NEW.review_reason:=NULL; ELSE NEW.status:='draft'; NEW.review_reason:='作品已进入人工审核。'; END IF; RETURN NEW;
END; $$;
COMMIT;
