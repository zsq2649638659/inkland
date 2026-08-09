-- 反馈表：请在 Supabase SQL Editor 中执行一次。
CREATE TABLE IF NOT EXISTS public.feedbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('功能建议', 'Bug 报告', '内容举报', '其他问题')),
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 2 AND 5000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'resolved', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS feedbacks_created_at_idx ON public.feedbacks (created_at DESC);
CREATE INDEX IF NOT EXISTS feedbacks_user_id_idx ON public.feedbacks (user_id);

ALTER TABLE public.feedbacks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS feedbacks_self_insert ON public.feedbacks;
CREATE POLICY feedbacks_self_insert ON public.feedbacks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS feedbacks_self_select ON public.feedbacks;
CREATE POLICY feedbacks_self_select ON public.feedbacks
  FOR SELECT USING (auth.uid() = user_id);
