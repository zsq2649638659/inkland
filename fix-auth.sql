-- ============================================
-- 修复：注册用户自动创建 profile
-- 在 Supabase SQL Editor 中执行
-- ============================================

-- 1. 删除旧触发器（如果存在）
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- 2. 创建触发器函数：新用户注册时自动在 profiles 表中插入记录
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, nickname)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', '用户' || substring(NEW.id::text, 1, 8))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. 绑定触发器
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. 更新 posts 表的 RLS 策略，允许已登录用户插入
DROP POLICY IF EXISTS posts_self_insert ON posts;
CREATE POLICY posts_self_insert ON posts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 5. 更新 post_tags 的 RLS，允许已登录用户插入
DROP POLICY IF EXISTS post_tags_self_insert ON post_tags;
CREATE POLICY post_tags_self_insert ON post_tags
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM posts WHERE posts.id = post_tags.post_id AND posts.user_id = auth.uid())
  );

-- 6. 更新 tags 的 RLS，允许已登录用户插入
DROP POLICY IF EXISTS tags_self_insert ON tags;
CREATE POLICY tags_self_insert ON tags
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');