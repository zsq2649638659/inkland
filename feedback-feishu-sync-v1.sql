-- Inkland 用户反馈 → 飞书多维表格同步
-- 请在 Supabase SQL Editor 中执行一次。
-- 本迁移只增加同步状态与处理记录，不会修改已有反馈内容。

ALTER TABLE public.feedbacks
  ADD COLUMN IF NOT EXISTS feishu_record_id TEXT;
ALTER TABLE public.feedbacks
  ADD COLUMN IF NOT EXISTS feishu_sync_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE public.feedbacks
  ADD COLUMN IF NOT EXISTS feishu_sync_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.feedbacks
  ADD COLUMN IF NOT EXISTS feishu_last_attempt_at TIMESTAMPTZ;
ALTER TABLE public.feedbacks
  ADD COLUMN IF NOT EXISTS feishu_synced_at TIMESTAMPTZ;
ALTER TABLE public.feedbacks
  ADD COLUMN IF NOT EXISTS feishu_last_error TEXT;
ALTER TABLE public.feedbacks
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE public.feedbacks
  ADD COLUMN IF NOT EXISTS resolved_by UUID;
ALTER TABLE public.feedbacks
  ADD COLUMN IF NOT EXISTS user_notified_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'feedbacks_feishu_sync_status_check'
      AND conrelid = 'public.feedbacks'::regclass
  ) THEN
    ALTER TABLE public.feedbacks
      ADD CONSTRAINT feedbacks_feishu_sync_status_check
      CHECK (feishu_sync_status IN ('pending', 'synced', 'failed'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS feedbacks_feishu_sync_idx
  ON public.feedbacks (feishu_sync_status, created_at ASC);

-- 反馈处理通知只能有一条，避免管理员重复点击时重复通知用户。
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS template_key TEXT;
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS related_entity_type TEXT;
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS related_entity_id UUID;
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'sent';
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_feedback_resolved_once_idx
  ON public.notifications (user_id, related_entity_type, related_entity_id, template_key)
  WHERE template_key = 'feedback_resolved'
    AND related_entity_type = 'feedback';

CREATE INDEX IF NOT EXISTS notifications_related_entity_idx
  ON public.notifications (related_entity_type, related_entity_id, created_at DESC);

ALTER TABLE public.admin_audit_logs
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
