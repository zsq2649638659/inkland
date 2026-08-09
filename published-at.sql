-- Inkland: 记录作品实际公开时间
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- 为已有已发布作品补齐公开时间，沿用原创建时间。
UPDATE posts
SET published_at = created_at
WHERE status = 'published'
  AND published_at IS NULL;

CREATE INDEX IF NOT EXISTS posts_published_at_idx
  ON posts (published_at DESC);
