-- Inkland 页面数据加载性能索引（请在 Supabase SQL Editor 手动执行）
-- 所有索引均可重复执行；不改变数据与权限。

CREATE INDEX IF NOT EXISTS posts_status_created_at_idx
  ON public.posts (status, created_at DESC);

CREATE INDEX IF NOT EXISTS posts_user_status_created_at_idx
  ON public.posts (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS posts_series_status_chapter_idx
  ON public.posts (series_name, post_type, status, chapter_number DESC);

CREATE INDEX IF NOT EXISTS post_tags_tag_post_idx
  ON public.post_tags (tag_id, post_id);

CREATE INDEX IF NOT EXISTS post_tags_post_tag_idx
  ON public.post_tags (post_id, tag_id);

CREATE INDEX IF NOT EXISTS notifications_user_read_created_at_idx
  ON public.notifications (user_id, read, created_at DESC);

CREATE INDEX IF NOT EXISTS follows_follower_following_idx
  ON public.follows (follower_id, following_id);

CREATE INDEX IF NOT EXISTS follows_following_follower_idx
  ON public.follows (following_id, follower_id);

CREATE INDEX IF NOT EXISTS blocked_users_user_blocked_idx
  ON public.blocked_users (user_id, blocked_user_id);

CREATE INDEX IF NOT EXISTS series_user_created_at_idx
  ON public.series (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS likes_user_post_idx
  ON public.likes (user_id, post_id);

CREATE INDEX IF NOT EXISTS bookmarks_user_post_idx
  ON public.bookmarks (user_id, post_id);
