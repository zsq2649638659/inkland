-- 在 Supabase SQL Editor 中运行此 SQL

-- 1. 将指定作品改为未过审
UPDATE posts 
SET review_status = 'rejected', review_reason = '内容不符合平台规范'
WHERE id = '3618ef81-21ed-42ea-ace7-d10bcd57b370';

-- 2. 查找连载作品
SELECT id, series_name, title, user_id FROM posts 
WHERE post_type = 'serial' AND series_name IS NOT NULL AND series_name != ''
LIMIT 10;

-- 3. 查找 series 表
SELECT * FROM series LIMIT 10;