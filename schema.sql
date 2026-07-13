-- ============================================
-- 墨者 同人创作社区 — 数据库 Schema
-- 在 Supabase SQL Editor 中全选执行
-- ============================================

-- ============================
-- 0. 用户资料表（关联 Supabase Auth）
-- ============================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL,
  avatar_url TEXT,
  bio TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'author', 'admin')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 新用户注册时自动创建 profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, nickname)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'username', '用户' || substring(NEW.id::text, 1, 8)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================
-- 1. POSTS（作品）
-- ============================
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  cover_url TEXT,
  visibility TEXT DEFAULT 'public' CHECK (visibility IN ('public', 'login_required')),
  word_count INT DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  rating TEXT DEFAULT 'all' CHECK (rating IN ('all', 'r15', 'r18')),
  post_type TEXT DEFAULT 'novel' CHECK (post_type IN ('novel', 'illustration', 'comic', 'ramble', 'cosplay', 'other')),
  series_name TEXT,
  chapter_number INT,
  chapter_title TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX idx_posts_status ON posts(status);
CREATE INDEX idx_posts_series ON posts(series_name);
CREATE INDEX idx_posts_chapter ON posts(series_name, chapter_number);

-- ============================
-- 2. TAGS（标签）
-- ============================
CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  type TEXT DEFAULT 'fandom' CHECK (type IN ('cp', 'character', 'fandom', 'rating', 'status', 'genre')),
  post_count INT DEFAULT 0
);

CREATE INDEX idx_tags_name ON tags(name);
CREATE INDEX idx_tags_post_count ON tags(post_count DESC);

-- ============================
-- 3. POST_TAGS（作品-标签关联）
-- ============================
CREATE TABLE post_tags (
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

-- ============================
-- 4. IMAGES（图片）
-- ============================
CREATE TABLE images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  sort_order INT DEFAULT 0
);

CREATE INDEX idx_images_post_id ON images(post_id);

-- ============================
-- 5. COMMENTS（评论，含段评）
-- ============================
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  paragraph_index INT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_comments_post_id ON comments(post_id);
CREATE INDEX idx_comments_paragraph ON comments(post_id, paragraph_index);

-- ============================
-- 6. LIKES（点赞）
-- ============================
CREATE TABLE likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, post_id)
);

CREATE INDEX idx_likes_post_id ON likes(post_id);

-- ============================
-- 7. BOOKMARKS（收藏）
-- ============================
CREATE TABLE bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  folder_name TEXT DEFAULT '默认',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, post_id)
);

CREATE INDEX idx_bookmarks_user_id ON bookmarks(user_id);

-- ============================
-- 8. FOLLOWS（关注）
-- ============================
CREATE TABLE follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(follower_id, following_id)
);

CREATE INDEX idx_follows_follower ON follows(follower_id);
CREATE INDEX idx_follows_following ON follows(following_id);

-- ============================
-- RLS 策略（行级安全）
-- ============================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE images ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

-- 公开可读
CREATE POLICY "profiles_public_read" ON profiles FOR SELECT USING (true);
CREATE POLICY "posts_public_read" ON posts FOR SELECT USING (status = 'published');
CREATE POLICY "tags_public_read" ON tags FOR SELECT USING (true);
CREATE POLICY "post_tags_public_read" ON post_tags FOR SELECT USING (true);
CREATE POLICY "comments_public_read" ON comments FOR SELECT USING (true);
CREATE POLICY "likes_public_read" ON likes FOR SELECT USING (true);

-- 本人可写
CREATE POLICY "profiles_self_update" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "posts_self_insert" ON posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "posts_self_update" ON posts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "posts_self_delete" ON posts FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "comments_self_insert" ON comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "likes_self_insert" ON likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "likes_self_delete" ON likes FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "bookmarks_self_all" ON bookmarks FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "follows_self_all" ON follows FOR ALL USING (auth.uid() = follower_id);

-- ============================
-- 统计视图
-- ============================
CREATE VIEW post_stats AS
SELECT
  p.id,
  COUNT(DISTINCT l.id) AS like_count,
  COUNT(DISTINCT c.id) AS comment_count,
  COUNT(DISTINCT b.id) AS bookmark_count
FROM posts p
LEFT JOIN likes l ON l.post_id = p.id
LEFT JOIN comments c ON c.post_id = p.id
LEFT JOIN bookmarks b ON b.post_id = p.id
GROUP BY p.id;

-- ============================
-- 自动更新 updated_at
-- ============================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER posts_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();