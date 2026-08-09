-- 登录可见作品与私有图片配置：请在 Supabase SQL Editor 中执行一次。

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('private-post-images', 'private-post-images', false, 3145728, ARRAY['image/webp']::text[])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS private_post_images_authenticated_read ON storage.objects;
CREATE POLICY private_post_images_authenticated_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'private-post-images');

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
UPDATE public.posts SET visibility = 'public' WHERE visibility IS NULL;

DROP POLICY IF EXISTS posts_public_read ON public.posts;
DROP POLICY IF EXISTS posts_visible_read ON public.posts;
CREATE POLICY posts_visible_read ON public.posts
  FOR SELECT USING (
    auth.uid() = user_id
    OR (
      status = 'published'
      AND (visibility = 'public' OR auth.uid() IS NOT NULL)
    )
  );

DROP POLICY IF EXISTS comments_public_read ON public.comments;
DROP POLICY IF EXISTS comments_visible_read ON public.comments;
CREATE POLICY comments_visible_read ON public.comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.posts
      WHERE posts.id = comments.post_id
        AND (
          posts.user_id = auth.uid()
          OR (posts.status = 'published' AND (posts.visibility = 'public' OR auth.uid() IS NOT NULL))
        )
    )
  );
