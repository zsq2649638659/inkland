-- ============================================================
-- 3.3 线上测试数据隔离
-- 使用方式：在 Supabase SQL Editor 中执行一次。
--
-- 约定：
--   1. profiles.is_test_account 是测试账号的唯一开关；
--   2. posts / series 的 is_test_data 由数据库触发器根据作者自动维护；
--   3. notifications 的 is_test_data 根据触发者或关联作品自动维护；
--   4. 普通账号/匿名访问只读取正式数据；测试账号进入共享测试空间，可读取全部公开测试数据。
--      创作者自己的工作区仍按原有权限处理，不因该开关变成公开数据。
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

-- 策略中统一使用这个安全函数判断账号类型，避免在 profiles 自身的 RLS
-- 策略里直接查询 profiles 造成递归；函数只返回布尔值，不暴露任何资料字段。
CREATE OR REPLACE FUNCTION public.is_test_account(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_test_account FROM public.profiles WHERE id = p_user_id), FALSE);
$$;

REVOKE ALL ON FUNCTION public.is_test_account(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_test_account(UUID) TO anon, authenticated;

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

-- ------------------------------------------------------------
-- 普通账号与测试账号的数据库层隔离
-- ------------------------------------------------------------

-- 作品：测试账号可读取正式作品和测试作品；普通账号只能读取正式作品。
-- 私有作品仍只对作者本人开放；隐藏内容仍只对作者本人开放。
DROP POLICY IF EXISTS posts_visible_read ON public.posts;
CREATE POLICY posts_visible_read ON public.posts
  FOR SELECT USING (
    auth.uid() = user_id
    OR (
      status = 'published'
      AND NOT COALESCE(hidden_for_review, FALSE)
      AND (is_test_data = FALSE OR public.is_test_account(auth.uid()))
      AND (
        visibility = 'public'
        OR (
          visibility = 'followers_only'
          AND EXISTS (
            SELECT 1
            FROM public.follows
            WHERE follows.follower_id = auth.uid()
              AND follows.following_id = posts.user_id
          )
        )
      )
    )
  );

-- 系列元数据与作品保持相同的账号空间规则。
DROP POLICY IF EXISTS series_public_read ON public.series;
CREATE POLICY series_public_read ON public.series
  FOR SELECT USING (
    auth.uid() = user_id
    OR is_test_data = FALSE
    OR public.is_test_account(auth.uid())
  );

-- 测试账号之间可以看到彼此的资料；普通账号不读取测试账号资料。
DROP POLICY IF EXISTS profiles_public_read ON public.profiles;
CREATE POLICY profiles_public_read ON public.profiles
  FOR SELECT USING (
    is_test_account = FALSE
    OR public.is_test_account(auth.uid())
    OR id = auth.uid()
  );

-- 评论读取同时受作品空间和评论作者空间约束。
DROP POLICY IF EXISTS comments_visible_read ON public.comments;
CREATE POLICY comments_visible_read ON public.comments
  FOR SELECT USING (
    (
      NOT public.is_test_account(user_id)
      OR public.is_test_account(auth.uid())
    )
    AND (
      user_id = auth.uid()
      OR (
        NOT COALESCE(hidden_for_review, FALSE)
        AND EXISTS (
          SELECT 1
          FROM public.posts
          WHERE posts.id = comments.post_id
            AND (
              posts.user_id = auth.uid()
              OR (
                posts.status = 'published'
                AND NOT COALESCE(posts.hidden_for_review, FALSE)
                AND (posts.is_test_data = FALSE OR public.is_test_account(auth.uid()))
                AND (
                  posts.visibility = 'public'
                  OR (
                    posts.visibility = 'followers_only'
                    AND EXISTS (
                      SELECT 1
                      FROM public.follows
                      WHERE follows.follower_id = auth.uid()
                        AND follows.following_id = posts.user_id
                    )
                  )
                )
              )
            )
        )
      )
    )
  );

-- 普通账号不能借助已知的测试作品 ID 写入测试互动；测试账号可以在
-- 正式作品或测试作品上进行测试，互动结果仍由统计视图按观看者区分。
DROP POLICY IF EXISTS likes_self_insert ON public.likes;
CREATE POLICY likes_self_insert ON public.likes
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.posts
      WHERE posts.id = likes.post_id
        AND (posts.is_test_data = FALSE OR public.is_test_account(auth.uid()))
    )
  );

DROP POLICY IF EXISTS bookmarks_self_all ON public.bookmarks;
CREATE POLICY bookmarks_self_all ON public.bookmarks
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.posts
      WHERE posts.id = bookmarks.post_id
        AND (posts.is_test_data = FALSE OR public.is_test_account(auth.uid()))
    )
  );

DROP POLICY IF EXISTS comments_self_insert ON public.comments;
CREATE POLICY comments_self_insert ON public.comments
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.posts
      WHERE posts.id = comments.post_id
        AND (posts.is_test_data = FALSE OR public.is_test_account(auth.uid()))
    )
  );

-- 关注关系也不跨账号空间建立，避免普通账号的粉丝/关注列表暴露测试账号。
DROP POLICY IF EXISTS follows_self_select ON public.follows;
CREATE POLICY follows_self_select ON public.follows
  FOR SELECT USING (
    (auth.uid() = follower_id OR auth.uid() = following_id)
    AND public.is_test_account(follower_id) = public.is_test_account(following_id)
  );

DROP POLICY IF EXISTS follows_self_insert ON public.follows;
CREATE POLICY follows_self_insert ON public.follows
  FOR INSERT WITH CHECK (
    auth.uid() = follower_id
    AND public.is_test_account(follower_id) = public.is_test_account(following_id)
  );

DROP POLICY IF EXISTS follows_self_delete ON public.follows;
CREATE POLICY follows_self_delete ON public.follows
  FOR DELETE USING (auth.uid() = follower_id);

-- 通知只能在同一账号空间内读取；应用层还会按空间生成通知。
DROP POLICY IF EXISTS "用户可查看自己的通知" ON public.notifications;
CREATE POLICY "用户可查看自己的通知" ON public.notifications
  FOR SELECT USING (
    auth.uid() = user_id
    AND (is_test_data = FALSE OR public.is_test_account(auth.uid()))
  );

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
          AND NOT EXISTS (
            SELECT 1
            FROM public.profiles AS viewer
            WHERE viewer.id = auth.uid()
              AND viewer.is_test_account = TRUE
          )
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
          AND NOT EXISTS (
            SELECT 1
            FROM public.profiles AS viewer
            WHERE viewer.id = auth.uid()
              AND viewer.is_test_account = TRUE
          )
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
          AND NOT EXISTS (
            SELECT 1
            FROM public.profiles AS viewer
            WHERE viewer.id = auth.uid()
              AND viewer.is_test_account = TRUE
          )
      )
  ) AS bookmark_count
FROM public.posts AS p
WHERE p.is_test_data = FALSE
   OR EXISTS (
     SELECT 1
     FROM public.profiles AS viewer
     WHERE viewer.id = auth.uid()
       AND viewer.is_test_account = TRUE
   )
   OR p.user_id = auth.uid();

-- 评论统计也不应把测试账号的点赞和回复带入公共评论区；测试账号可看到共享测试空间的完整统计。
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
          AND NOT EXISTS (
            SELECT 1
            FROM public.profiles AS viewer
            WHERE viewer.id = auth.uid()
              AND viewer.is_test_account = TRUE
          )
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
          AND NOT EXISTS (
            SELECT 1
            FROM public.profiles AS viewer
            WHERE viewer.id = auth.uid()
              AND viewer.is_test_account = TRUE
          )
      )
  ) AS reply_count
FROM public.comments AS c
WHERE c.user_id IS NULL
   OR EXISTS (
     SELECT 1
     FROM public.profiles AS author
     WHERE author.id = c.user_id
       AND (
         author.is_test_account = FALSE
         OR EXISTS (
           SELECT 1
           FROM public.profiles AS viewer
           WHERE viewer.id = auth.uid()
             AND viewer.is_test_account = TRUE
         )
         OR author.id = auth.uid()
       )
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
