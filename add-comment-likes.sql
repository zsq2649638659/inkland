-- ============================
-- 评论点赞表 + 段评增强
-- 在 Supabase SQL Editor 中执行此文件
-- ============================

-- 1. 评论点赞表
CREATE TABLE IF NOT EXISTS comment_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, comment_id)
);

CREATE INDEX IF NOT EXISTS idx_comment_likes_comment ON comment_likes(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_likes_user ON comment_likes(user_id);

-- 2. RLS
ALTER TABLE comment_likes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'comment_likes_public_read') THEN
    CREATE POLICY "comment_likes_public_read" ON comment_likes FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'comment_likes_self_insert') THEN
    CREATE POLICY "comment_likes_self_insert" ON comment_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'comment_likes_self_delete') THEN
    CREATE POLICY "comment_likes_self_delete" ON comment_likes FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- 3. 评论统计视图（包含点赞数）
CREATE OR REPLACE VIEW comment_stats AS
SELECT
  c.id,
  COALESCE(COUNT(DISTINCT cl.id), 0) AS like_count,
  COALESCE(COUNT(DISTINCT r.id), 0) AS reply_count
FROM comments c
LEFT JOIN comment_likes cl ON cl.comment_id = c.id
LEFT JOIN comments r ON r.parent_id = c.id
GROUP BY c.id;

-- 4. 评论的删除/更新 RLS（允许评论作者删除自己的评论）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'comments_self_delete') THEN
    CREATE POLICY "comments_self_delete" ON comments FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;