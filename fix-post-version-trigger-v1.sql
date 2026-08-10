-- 修复审核触发器：BEFORE INSERT 阶段需要先创建作品版本，
-- 因此将外键校验延后到同一笔作品发布事务结束时执行。
-- 不删除任何用户、作品或审核记录。

BEGIN;

ALTER TABLE public.post_versions
  DROP CONSTRAINT IF EXISTS post_versions_post_id_fkey;

ALTER TABLE public.post_versions
  ADD CONSTRAINT post_versions_post_id_fkey
  FOREIGN KEY (post_id)
  REFERENCES public.posts(id)
  ON DELETE CASCADE
  DEFERRABLE INITIALLY DEFERRED;

COMMIT;

-- 执行后核验：
-- SELECT condeferrable, condeferred
-- FROM pg_constraint
-- WHERE conname = 'post_versions_post_id_fkey';
