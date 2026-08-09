-- 将“仅登录用户可见”升级为“仅关注作者可见”。
-- 请在 Supabase SQL Editor 中执行一次。

-- 确保两个图片桶的上传权限完整存在。
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('post-images', 'post-images', true, 2621440, ARRAY['image/webp']::text[])
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('private-post-images', 'private-post-images', false, 3145728, ARRAY['image/webp']::text[])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS post_images_public_read ON storage.objects;
CREATE POLICY post_images_public_read ON storage.objects
  FOR SELECT USING (bucket_id = 'post-images');

DROP POLICY IF EXISTS post_images_owner_insert ON storage.objects;
CREATE POLICY post_images_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'post-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS post_images_owner_update ON storage.objects;
CREATE POLICY post_images_owner_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'post-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'post-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS post_images_owner_delete ON storage.objects;
CREATE POLICY post_images_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'post-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS private_post_images_owner_insert ON storage.objects;
CREATE POLICY private_post_images_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'private-post-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS private_post_images_owner_update ON storage.objects;
CREATE POLICY private_post_images_owner_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'private-post-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'private-post-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS private_post_images_owner_delete ON storage.objects;
CREATE POLICY private_post_images_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'private-post-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public';

UPDATE public.posts
SET visibility = 'followers_only'
WHERE visibility = 'login_required';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.posts'::regclass
      AND conname = 'posts_visibility_check'
  ) THEN
    ALTER TABLE public.posts DROP CONSTRAINT posts_visibility_check;
  END IF;
END $$;

ALTER TABLE public.posts
  ADD CONSTRAINT posts_visibility_check
  CHECK (visibility IN ('public', 'followers_only', 'private'));

DROP POLICY IF EXISTS posts_public_read ON public.posts;
DROP POLICY IF EXISTS posts_visible_read ON public.posts;
CREATE POLICY posts_visible_read ON public.posts
  FOR SELECT USING (
    auth.uid() = user_id
    OR (
      status = 'published'
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

DROP POLICY IF EXISTS comments_public_read ON public.comments;
DROP POLICY IF EXISTS comments_visible_read ON public.comments;
CREATE POLICY comments_visible_read ON public.comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.posts
      WHERE posts.id = comments.post_id
        AND (
          posts.user_id = auth.uid()
          OR (
            posts.status = 'published'
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
  );

-- 私有图片继续使用 private-post-images bucket。
-- 读取权限与作品可见范围保持一致，避免只要登录就能读取私有对象。
DROP POLICY IF EXISTS private_post_images_authenticated_read ON storage.objects;
DROP POLICY IF EXISTS private_post_images_visible_read ON storage.objects;
CREATE POLICY private_post_images_visible_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'private-post-images'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1
        FROM public.posts
        WHERE (
          posts.cover_url = 'private://private-post-images/' || storage.objects.name
          OR posts.content LIKE '%' || 'private://private-post-images/' || storage.objects.name || '%'
        )
        AND (
          posts.user_id = auth.uid()
          OR (
            posts.status = 'published'
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
  );
