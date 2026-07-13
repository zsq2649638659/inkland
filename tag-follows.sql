-- ============================================
-- 标签关注表
-- 在 Supabase SQL Editor 中执行
-- ============================================

CREATE TABLE IF NOT EXISTS tag_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_tag_follows_user ON tag_follows(user_id);
CREATE INDEX IF NOT EXISTS idx_tag_follows_tag ON tag_follows(tag_id);

ALTER TABLE tag_follows ENABLE ROW LEVEL SECURITY;

-- 公开可读
CREATE POLICY "tag_follows_public_read" ON tag_follows FOR SELECT USING (true);
-- 本人可写
CREATE POLICY "tag_follows_self_all" ON tag_follows FOR ALL USING (auth.uid() = user_id);