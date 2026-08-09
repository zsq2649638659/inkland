-- 成功inkland 管理后台与内容审核基础迁移
-- 执行顺序：基础表/字段 -> RLS -> 存储策略 -> 反馈举报 -> 本文件 -> 连载迁移
-- 请在 Supabase SQL Editor 中执行，并在执行记录中标记：admin-backoffice-v1

CREATE TABLE IF NOT EXISTS public.admin_accounts (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '管理员',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

ALTER TABLE public.admin_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_accounts_self_select ON public.admin_accounts;
CREATE POLICY admin_accounts_self_select ON public.admin_accounts
  FOR SELECT USING (auth.uid() = id);

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS review_reason TEXT;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.content_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('post', 'comment', 'user')),
  target_id UUID NOT NULL,
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 2 AND 2000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'resolved', 'dismissed')),
  resolution_note TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS content_reports_status_created_at_idx
  ON public.content_reports (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id UUID,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_audit_logs_created_at_idx
  ON public.admin_audit_logs (created_at DESC);

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_accounts
    WHERE id = auth.uid() AND status = 'active'
  );
$$;

ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_reports_self_insert ON public.content_reports;
CREATE POLICY content_reports_self_insert ON public.content_reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS content_reports_self_select ON public.content_reports;
CREATE POLICY content_reports_self_select ON public.content_reports
  FOR SELECT USING (auth.uid() = reporter_id OR public.is_admin());

DROP POLICY IF EXISTS content_reports_admin_update ON public.content_reports;
CREATE POLICY content_reports_admin_update ON public.content_reports
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS admin_audit_logs_admin_select ON public.admin_audit_logs;
CREATE POLICY admin_audit_logs_admin_select ON public.admin_audit_logs
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS admin_audit_logs_admin_insert ON public.admin_audit_logs;
CREATE POLICY admin_audit_logs_admin_insert ON public.admin_audit_logs
  FOR INSERT WITH CHECK (public.is_admin() AND auth.uid() = admin_id);

DROP POLICY IF EXISTS posts_admin_select ON public.posts;
CREATE POLICY posts_admin_select ON public.posts
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS posts_admin_update ON public.posts;
CREATE POLICY posts_admin_update ON public.posts
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS feedbacks_admin_select ON public.feedbacks;
CREATE POLICY feedbacks_admin_select ON public.feedbacks
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS feedbacks_admin_update ON public.feedbacks;
CREATE POLICY feedbacks_admin_update ON public.feedbacks
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS comment_reports_admin_select ON public.comment_reports;
CREATE POLICY comment_reports_admin_select ON public.comment_reports
  FOR SELECT USING (auth.uid() = reporter_id OR public.is_admin());

DROP POLICY IF EXISTS comment_reports_admin_update ON public.comment_reports;
CREATE POLICY comment_reports_admin_update ON public.comment_reports
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 首次指定管理员：先在 Supabase Authentication > Users 创建一个后台账号，
-- 再将下面邮箱替换为该“后台账号”的邮箱后执行。
-- 这个邮箱不需要是 Inkland 前台用户账号。
-- INSERT INTO public.admin_accounts (id, email, display_name)
-- SELECT id, email, 'Inkland 管理员'
-- FROM auth.users
-- WHERE email = 'your-admin@example.com'
-- ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, status = 'active';
