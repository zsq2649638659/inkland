-- Inkland 业务编号体系 v1
--
-- 规则：
-- 1. 现有 UUID 不回填、不修改；只有新记录自动获得业务编号。
-- 2. 编号格式为英文字母前缀 + 至少 4 位数字，不足 4 位补零。
-- 3. 用户保留 U0001-U1000，正常用户从 U1001 开始。
-- 4. 作品、连载及后台业务记录从各自序列的 0001 开始。
-- 5. 业务编号用于后台展示、搜索和复制；UUID 继续作为内部关联主键。

BEGIN;

-- 每个业务类型使用独立序列，删除后不回收编号。
CREATE SEQUENCE IF NOT EXISTS public.user_public_id_seq AS BIGINT MINVALUE 1001 START WITH 1001;
CREATE SEQUENCE IF NOT EXISTS public.post_public_id_seq AS BIGINT MINVALUE 1 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public.series_public_id_seq AS BIGINT MINVALUE 1 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public.comment_public_id_seq AS BIGINT MINVALUE 1 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public.report_public_id_seq AS BIGINT MINVALUE 1 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public.report_case_public_id_seq AS BIGINT MINVALUE 1 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public.review_case_public_id_seq AS BIGINT MINVALUE 1 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public.post_version_public_id_seq AS BIGINT MINVALUE 1 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public.feedback_public_id_seq AS BIGINT MINVALUE 1 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public.moderation_rule_public_id_seq AS BIGINT MINVALUE 1 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public.user_violation_public_id_seq AS BIGINT MINVALUE 1 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public.user_restriction_public_id_seq AS BIGINT MINVALUE 1 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public.profile_revision_public_id_seq AS BIGINT MINVALUE 1 START WITH 1;

CREATE OR REPLACE FUNCTION public.assign_business_public_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  next_number BIGINT;
BEGIN
  IF NEW.public_id IS NULL OR btrim(NEW.public_id) = '' THEN
    next_number := nextval(TG_ARGV[1]::regclass);
    NEW.public_id := TG_ARGV[0] || lpad(next_number::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

-- 只增加新字段，不改现有 id 和外键类型。
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS public_id TEXT;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS public_id TEXT;
ALTER TABLE public.series ADD COLUMN IF NOT EXISTS public_id TEXT;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS public_id TEXT;
ALTER TABLE public.content_reports ADD COLUMN IF NOT EXISTS public_id TEXT;
ALTER TABLE public.comment_reports ADD COLUMN IF NOT EXISTS public_id TEXT;
ALTER TABLE public.moderation_report_cases ADD COLUMN IF NOT EXISTS public_id TEXT;
ALTER TABLE public.moderation_review_cases ADD COLUMN IF NOT EXISTS public_id TEXT;
ALTER TABLE public.series_moderation_review_cases ADD COLUMN IF NOT EXISTS public_id TEXT;
ALTER TABLE public.comment_moderation_review_cases ADD COLUMN IF NOT EXISTS public_id TEXT;
ALTER TABLE public.post_versions ADD COLUMN IF NOT EXISTS public_id TEXT;
ALTER TABLE public.feedbacks ADD COLUMN IF NOT EXISTS public_id TEXT;
ALTER TABLE public.moderation_rules ADD COLUMN IF NOT EXISTS public_id TEXT;
ALTER TABLE public.user_violations ADD COLUMN IF NOT EXISTS public_id TEXT;
ALTER TABLE public.user_restrictions ADD COLUMN IF NOT EXISTS public_id TEXT;
ALTER TABLE public.profile_revision_requests ADD COLUMN IF NOT EXISTS public_id TEXT;

-- 允许历史记录为空；新记录由触发器生成合法业务编号。
DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'profiles', 'posts', 'series', 'comments', 'content_reports', 'comment_reports',
    'moderation_report_cases', 'moderation_review_cases', 'series_moderation_review_cases',
    'comment_moderation_review_cases', 'post_versions', 'feedbacks', 'moderation_rules',
    'user_violations', 'user_restrictions', 'profile_revision_requests'
  ]
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I',
      table_name,
      table_name || '_public_id_format_check'
    );
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (public_id IS NULL OR public_id ~ ''^[A-Z]{1,3}[0-9]+$'')',
      table_name,
      table_name || '_public_id_format_check'
    );
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.%I (public_id) WHERE public_id IS NOT NULL',
      table_name || '_public_id_unique_idx',
      table_name
    );
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS profiles_assign_public_id ON public.profiles;
CREATE TRIGGER profiles_assign_public_id
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.assign_business_public_id('U', 'public.user_public_id_seq');

DROP TRIGGER IF EXISTS posts_assign_public_id ON public.posts;
CREATE TRIGGER posts_assign_public_id
BEFORE INSERT ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.assign_business_public_id('W', 'public.post_public_id_seq');

DROP TRIGGER IF EXISTS series_assign_public_id ON public.series;
CREATE TRIGGER series_assign_public_id
BEFORE INSERT ON public.series
FOR EACH ROW EXECUTE FUNCTION public.assign_business_public_id('S', 'public.series_public_id_seq');

DROP TRIGGER IF EXISTS comments_assign_public_id ON public.comments;
CREATE TRIGGER comments_assign_public_id
BEFORE INSERT ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.assign_business_public_id('C', 'public.comment_public_id_seq');

DROP TRIGGER IF EXISTS content_reports_assign_public_id ON public.content_reports;
CREATE TRIGGER content_reports_assign_public_id
BEFORE INSERT ON public.content_reports
FOR EACH ROW EXECUTE FUNCTION public.assign_business_public_id('R', 'public.report_public_id_seq');

DROP TRIGGER IF EXISTS comment_reports_assign_public_id ON public.comment_reports;
CREATE TRIGGER comment_reports_assign_public_id
BEFORE INSERT ON public.comment_reports
FOR EACH ROW EXECUTE FUNCTION public.assign_business_public_id('R', 'public.report_public_id_seq');

DROP TRIGGER IF EXISTS moderation_report_cases_assign_public_id ON public.moderation_report_cases;
CREATE TRIGGER moderation_report_cases_assign_public_id
BEFORE INSERT ON public.moderation_report_cases
FOR EACH ROW EXECUTE FUNCTION public.assign_business_public_id('RC', 'public.report_case_public_id_seq');

DROP TRIGGER IF EXISTS moderation_review_cases_assign_public_id ON public.moderation_review_cases;
CREATE TRIGGER moderation_review_cases_assign_public_id
BEFORE INSERT ON public.moderation_review_cases
FOR EACH ROW EXECUTE FUNCTION public.assign_business_public_id('RV', 'public.review_case_public_id_seq');

DROP TRIGGER IF EXISTS series_moderation_review_cases_assign_public_id ON public.series_moderation_review_cases;
CREATE TRIGGER series_moderation_review_cases_assign_public_id
BEFORE INSERT ON public.series_moderation_review_cases
FOR EACH ROW EXECUTE FUNCTION public.assign_business_public_id('RV', 'public.review_case_public_id_seq');

DROP TRIGGER IF EXISTS comment_moderation_review_cases_assign_public_id ON public.comment_moderation_review_cases;
CREATE TRIGGER comment_moderation_review_cases_assign_public_id
BEFORE INSERT ON public.comment_moderation_review_cases
FOR EACH ROW EXECUTE FUNCTION public.assign_business_public_id('RV', 'public.review_case_public_id_seq');

DROP TRIGGER IF EXISTS post_versions_assign_public_id ON public.post_versions;
CREATE TRIGGER post_versions_assign_public_id
BEFORE INSERT ON public.post_versions
FOR EACH ROW EXECUTE FUNCTION public.assign_business_public_id('V', 'public.post_version_public_id_seq');

DROP TRIGGER IF EXISTS feedbacks_assign_public_id ON public.feedbacks;
CREATE TRIGGER feedbacks_assign_public_id
BEFORE INSERT ON public.feedbacks
FOR EACH ROW EXECUTE FUNCTION public.assign_business_public_id('F', 'public.feedback_public_id_seq');

DROP TRIGGER IF EXISTS moderation_rules_assign_public_id ON public.moderation_rules;
CREATE TRIGGER moderation_rules_assign_public_id
BEFORE INSERT ON public.moderation_rules
FOR EACH ROW EXECUTE FUNCTION public.assign_business_public_id('MR', 'public.moderation_rule_public_id_seq');

DROP TRIGGER IF EXISTS user_violations_assign_public_id ON public.user_violations;
CREATE TRIGGER user_violations_assign_public_id
BEFORE INSERT ON public.user_violations
FOR EACH ROW EXECUTE FUNCTION public.assign_business_public_id('UV', 'public.user_violation_public_id_seq');

DROP TRIGGER IF EXISTS user_restrictions_assign_public_id ON public.user_restrictions;
CREATE TRIGGER user_restrictions_assign_public_id
BEFORE INSERT ON public.user_restrictions
FOR EACH ROW EXECUTE FUNCTION public.assign_business_public_id('UR', 'public.user_restriction_public_id_seq');

DROP TRIGGER IF EXISTS profile_revision_requests_assign_public_id ON public.profile_revision_requests;
CREATE TRIGGER profile_revision_requests_assign_public_id
BEFORE INSERT ON public.profile_revision_requests
FOR EACH ROW EXECUTE FUNCTION public.assign_business_public_id('PR', 'public.profile_revision_public_id_seq');

COMMIT;

-- 执行后核验（单独运行）：
-- SELECT tgname, tgrelid::regclass
-- FROM pg_trigger
-- WHERE NOT tgisinternal AND tgname LIKE '%assign_public_id%'
-- ORDER BY tgrelid::regclass::text;
-- SELECT public_id FROM public.profiles ORDER BY created_at DESC LIMIT 5;
