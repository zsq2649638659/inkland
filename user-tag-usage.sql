-- Inkland: 用户近期使用标签记录
CREATE TABLE IF NOT EXISTS user_tag_usage (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, tag_id)
);

ALTER TABLE user_tag_usage ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'user_tag_usage_self_read') THEN
    CREATE POLICY "user_tag_usage_self_read" ON user_tag_usage
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'user_tag_usage_self_insert') THEN
    CREATE POLICY "user_tag_usage_self_insert" ON user_tag_usage
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'user_tag_usage_self_update') THEN
    CREATE POLICY "user_tag_usage_self_update" ON user_tag_usage
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS user_tag_usage_recent_idx
  ON user_tag_usage (user_id, last_used_at DESC);

-- 将已有作品的标签回填到近期使用记录，保留每位用户对每个标签的最近使用时间。
INSERT INTO user_tag_usage (user_id, tag_id, last_used_at)
SELECT
  p.user_id,
  pt.tag_id,
  MAX(COALESCE(p.published_at, p.created_at)) AS last_used_at
FROM post_tags pt
JOIN posts p ON p.id = pt.post_id
GROUP BY p.user_id, pt.tag_id
ON CONFLICT (user_id, tag_id) DO UPDATE
SET last_used_at = GREATEST(user_tag_usage.last_used_at, EXCLUDED.last_used_at);
