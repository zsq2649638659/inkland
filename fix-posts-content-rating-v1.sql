-- Inkland 修复：posts 表补充 content_rating 列
-- 背景：text-review-closure-v1.sql 的审核详情页与放行逻辑使用 posts.content_rating，
-- 但此前只有 post_versions 表有该列，posts 表从未添加，导致：
--   1. 后台审核详情页查询 posts 时报 "column posts.content_rating does not exist"，
--      PostgREST 返回 400，详情页判定无作品后显示 404；
--   2. 管理员放行时 admin_decide_post_review 更新 posts.content_rating 也会报错。
-- 本迁移为增量修复，不删除数据，可重复执行。

BEGIN;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS content_rating TEXT;

-- 用最新冻结版本回填已有作品的评级，避免历史作品显示“未评级”。
UPDATE public.posts p
SET content_rating = latest.content_rating
FROM (
  SELECT DISTINCT ON (post_id) post_id, content_rating
  FROM public.post_versions
  WHERE content_rating IS NOT NULL
  ORDER BY post_id, version_number DESC
) latest
WHERE latest.post_id = p.id
  AND p.content_rating IS NULL;

COMMIT;

-- 核验（返回 t 即成功）：
-- SELECT to_regclass('public.posts') IS NOT NULL
--   AND EXISTS (
--     SELECT 1 FROM information_schema.columns
--     WHERE table_schema = 'public' AND table_name = 'posts'
--       AND column_name = 'content_rating'
--   ) AS posts_content_rating_ok;
