-- ============================================================
-- 3.3 线上测试数据隔离
-- 使用方式：在 Supabase SQL Editor 中执行一次。
--
-- 约定：
--   1. profiles.is_test_account 是测试账号的唯一开关；
--   2. posts / series 的 is_test_data 由数据库触发器根据作者自动维护；
--   3. notifications 的 is_test_data 根据触发者或关联作品自动维护；
--   4. 公共查询只读取 is_test_data = false，创作者自己的工作区不受影响。
--
-- 标记测试账号示例（请由管理员按实际 UUID 执行，不把账号密码写进代码或 SQL）：
-- UPDATE public.profiles SET is_test_account = TRUE WHERE id = '测试账号 UUID';
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_test_account BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.series
  ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT FALSE;

-- 先回填已有测试账号创建的作品，再安装触发器，避免历史数据继续进入公共链路。
UPDATE public.posts AS p
SET is_test_data = TRUE
WHERE EXISTS (
  SELECT 1
  FROM public.profiles AS profile
  WHERE profile.id = p.user_id
    AND profile.is_test_account = TRUE
);

UPDATE public.series AS s
SET is_test_data = TRUE
WHERE EXISTS (
  SELECT 1
  FROM public.profiles AS profile
  WHERE profile.id = s.user_id
    AND profile.is_test_account = TRUE
);

UPDATE public.notifications AS n
SET is_test_data = TRUE
WHERE EXISTS (
  SELECT 1
  FROM public.profiles AS actor
  WHERE actor.id = n.actor_id
    AND actor.is_test_account = TRUE
)
OR EXISTS (
  SELECT 1
  FROM public.posts AS post
  WHERE post.id = n.post_id
    AND post.is_test_data = TRUE
);

CREATE OR REPLACE FUNCTION public.apply_test_data_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_is_test BOOLEAN := FALSE;
  actor_is_test BOOLEAN := FALSE;
  post_is_test BOOLEAN := FALSE;
BEGIN
  IF TG_TABLE_NAME = 'posts' THEN
    SELECT COALESCE((
      SELECT is_test_account
      FROM public.profiles
      WHERE id = NEW.user_id
    ), FALSE)
    INTO owner_is_test;
    NEW.is_test_data := owner_is_test;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'series' THEN
    SELECT COALESCE((
      SELECT is_test_account
      FROM public.profiles
      WHERE id = NEW.user_id
    ), FALSE)
    INTO owner_is_test;
    NEW.is_test_data := owner_is_test;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'notifications' THEN
    SELECT COALESCE((
      SELECT is_test_account
      FROM public.profiles
      WHERE id = NEW.actor_id
    ), FALSE)
    INTO actor_is_test;

    SELECT COALESCE((
      SELECT is_test_data
      FROM public.posts
      WHERE id = NEW.post_id
    ), FALSE)
    INTO post_is_test;

    NEW.is_test_data := actor_is_test OR post_is_test;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS posts_apply_test_data_flag ON public.posts;
CREATE TRIGGER posts_apply_test_data_flag
  BEFORE INSERT OR UPDATE ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_test_data_flag();

DROP TRIGGER IF EXISTS series_apply_test_data_flag ON public.series;
CREATE TRIGGER series_apply_test_data_flag
  BEFORE INSERT OR UPDATE ON public.series
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_test_data_flag();

DROP TRIGGER IF EXISTS notifications_apply_test_data_flag ON public.notifications;
CREATE TRIGGER notifications_apply_test_data_flag
  BEFORE INSERT OR UPDATE ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_test_data_flag();

CREATE OR REPLACE FUNCTION public.sync_test_account_data()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_test_account IS DISTINCT FROM OLD.is_test_account THEN
    UPDATE public.posts
    SET is_test_data = NEW.is_test_account
    WHERE user_id = NEW.id;

    UPDATE public.series
    SET is_test_data = NEW.is_test_account
    WHERE user_id = NEW.id;

    UPDATE public.notifications AS notification
    SET is_test_data = (
      EXISTS (
        SELECT 1
        FROM public.profiles AS actor
        WHERE actor.id = notification.actor_id
          AND actor.is_test_account = TRUE
      )
      OR EXISTS (
        SELECT 1
        FROM public.posts AS post
        WHERE post.id = notification.post_id
          AND post.is_test_data = TRUE
      )
    )
    WHERE notification.actor_id = NEW.id
       OR EXISTS (
         SELECT 1
         FROM public.posts AS post
         WHERE post.id = notification.post_id
           AND post.user_id = NEW.id
       );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_sync_test_account_data ON public.profiles;
CREATE TRIGGER profiles_sync_test_account_data
  AFTER UPDATE OF is_test_account ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_test_account_data();

CREATE INDEX IF NOT EXISTS posts_public_test_filter_idx
  ON public.posts (status, is_test_data, created_at DESC);

CREATE INDEX IF NOT EXISTS posts_public_series_test_filter_idx
  ON public.posts (series_name, status, is_test_data, chapter_number);

CREATE INDEX IF NOT EXISTS series_public_test_filter_idx
  ON public.series (is_test_data, name);

CREATE INDEX IF NOT EXISTS profiles_public_test_filter_idx
  ON public.profiles (is_test_account, nickname);

CREATE INDEX IF NOT EXISTS notifications_public_test_filter_idx
  ON public.notifications (user_id, read, is_test_data, created_at DESC);

-- post_stats 是平台现有的统计视图。重建后，测试账号产生的互动不会再抬高公共作品热度。
CREATE OR REPLACE VIEW public.post_stats AS
SELECT
  p.id,
  (
    SELECT COUNT(*)
    FROM public.likes AS l
    WHERE l.post_id = p.id
      AND NOT EXISTS (
        SELECT 1
        FROM public.profiles AS actor
        WHERE actor.id = l.user_id
          AND actor.is_test_account = TRUE
          AND (auth.uid() IS NULL OR l.user_id <> auth.uid())
      )
  ) AS like_count,
  (
    SELECT COUNT(*)
    FROM public.comments AS c
    WHERE c.post_id = p.id
      AND NOT EXISTS (
        SELECT 1
        FROM public.profiles AS actor
        WHERE actor.id = c.user_id
          AND actor.is_test_account = TRUE
          AND (auth.uid() IS NULL OR c.user_id <> auth.uid())
      )
  ) AS comment_count,
  (
    SELECT COUNT(*)
    FROM public.bookmarks AS b
    WHERE b.post_id = p.id
      AND NOT EXISTS (
        SELECT 1
        FROM public.profiles AS actor
        WHERE actor.id = b.user_id
          AND actor.is_test_account = TRUE
          AND (auth.uid() IS NULL OR b.user_id <> auth.uid())
      )
  ) AS bookmark_count
FROM public.posts AS p
WHERE p.is_test_data = FALSE
   OR p.user_id = auth.uid();

-- 评论统计也不应把测试账号的点赞和回复带入公共评论区；测试账号仍可看到自己发出的评论统计。
CREATE OR REPLACE VIEW public.comment_stats AS
SELECT
  c.id,
  (
    SELECT COUNT(*)
    FROM public.comment_likes AS cl
    WHERE cl.comment_id = c.id
      AND NOT EXISTS (
        SELECT 1
        FROM public.profiles AS actor
        WHERE actor.id = cl.user_id
          AND actor.is_test_account = TRUE
          AND (auth.uid() IS NULL OR cl.user_id <> auth.uid())
      )
  ) AS like_count,
  (
    SELECT COUNT(*)
    FROM public.comments AS reply
    WHERE reply.parent_id = c.id
      AND NOT EXISTS (
        SELECT 1
        FROM public.profiles AS actor
        WHERE actor.id = reply.user_id
          AND actor.is_test_account = TRUE
          AND (auth.uid() IS NULL OR reply.user_id <> auth.uid())
      )
  ) AS reply_count
FROM public.comments AS c
WHERE c.user_id IS NULL
   OR EXISTS (
     SELECT 1
     FROM public.profiles AS author
     WHERE author.id = c.user_id
       AND (author.is_test_account = FALSE OR author.id = auth.uid())
   );

-- seed-test.sql 使用的固定测试账号也统一标记，避免测试数据污染线上公共页面。
UPDATE public.profiles
SET is_test_account = TRUE
WHERE id IN (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000005'
);
