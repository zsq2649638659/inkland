-- ============================================================
-- inkland 数据库迁移 SQL (修复版)
-- 运行方式：在 Supabase SQL Editor 中执行
-- ============================================================

-- 1. 连载系列元数据表
CREATE TABLE IF NOT EXISTS series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  cover_url TEXT,
  tags TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'ongoing',
  series_type TEXT DEFAULT 'fanfic',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for series
ALTER TABLE series ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'series_public_read') THEN
    CREATE POLICY "series_public_read" ON series FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'series_owner_insert') THEN
    CREATE POLICY "series_owner_insert" ON series FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'series_owner_update') THEN
    CREATE POLICY "series_owner_update" ON series FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'series_owner_delete') THEN
    CREATE POLICY "series_owner_delete" ON series FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- 2. 评论举报表
CREATE TABLE IF NOT EXISTS comment_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID REFERENCES comments(id) ON DELETE CASCADE NOT NULL,
  reporter_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE comment_reports ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'comment_reports_insert') THEN
    CREATE POLICY "comment_reports_insert" ON comment_reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'comment_reports_self_read') THEN
    CREATE POLICY "comment_reports_self_read" ON comment_reports FOR SELECT USING (auth.uid() = reporter_id);
  END IF;
END $$;

-- 3. 用户黑名单表
CREATE TABLE IF NOT EXISTS blocked_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  blocked_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, blocked_user_id)
);

ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'blocked_users_self') THEN
    CREATE POLICY "blocked_users_self" ON blocked_users FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- 4. posts 表新增审核字段
ALTER TABLE posts ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'approved';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS review_reason TEXT;

-- 5. 将现有连载章节迁移到新的 series 表
INSERT INTO series (user_id, name, description, cover_url, status, series_type)
SELECT DISTINCT ON (user_id, series_name)
  user_id,
  series_name,
  COALESCE(
    (SELECT content FROM posts p2 WHERE p2.user_id = posts.user_id AND p2.series_name = posts.series_name AND p2.post_type = 'serial' AND (p2.chapter_number = 0 OR p2.chapter_number IS NULL) LIMIT 1),
    ''
  ),
  COALESCE(
    (SELECT cover_url FROM posts p2 WHERE p2.user_id = posts.user_id AND p2.series_name = posts.series_name AND p2.post_type = 'serial' AND (p2.chapter_number = 0 OR p2.chapter_number IS NULL) LIMIT 1),
    (SELECT cover_url FROM posts p2 WHERE p2.user_id = posts.user_id AND p2.series_name = posts.series_name AND p2.post_type = 'serial' LIMIT 1)
  ),
  'ongoing',
  'fanfic'
FROM posts
WHERE post_type = 'serial'
  AND series_name IS NOT NULL
  AND series_name != ''
ON CONFLICT DO NOTHING;
