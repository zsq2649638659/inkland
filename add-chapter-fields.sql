-- ============================================
-- 添加章节字段到 posts 表
-- 在 Supabase SQL Editor 中执行
-- ============================================

-- 添加章节序号
ALTER TABLE posts ADD COLUMN IF NOT EXISTS chapter_number INT;

-- 添加章节标题
ALTER TABLE posts ADD COLUMN IF NOT EXISTS chapter_title TEXT;

-- 为系列作品添加索引
CREATE INDEX IF NOT EXISTS idx_posts_series ON posts(series_name);
CREATE INDEX IF NOT EXISTS idx_posts_chapter ON posts(series_name, chapter_number);