-- 修复文字作品命中词库时的外键时序问题
--
-- posts 的 BEFORE INSERT 触发器需要先创建 post_versions 和审核案件，
-- 但 moderation_review_cases.post_id 原先立即检查外键，导致作品尚未
-- 完成 INSERT 时就报 moderation_review_cases_post_id_fkey。
-- 这里只调整外键为事务结束时检查，不改图片审核函数和审核结果逻辑。

BEGIN;

ALTER TABLE public.moderation_review_cases
  DROP CONSTRAINT IF EXISTS moderation_review_cases_post_id_fkey;

ALTER TABLE public.moderation_review_cases
  ADD CONSTRAINT moderation_review_cases_post_id_fkey
  FOREIGN KEY (post_id)
  REFERENCES public.posts(id)
  ON DELETE CASCADE
  DEFERRABLE INITIALLY DEFERRED;

COMMIT;

-- 执行后核验：应返回 condeferrable=true、condeferred=true
-- SELECT conname, condeferrable, condeferred
-- FROM pg_constraint
-- WHERE conname = 'moderation_review_cases_post_id_fkey';
