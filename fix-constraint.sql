-- ============================================
-- 修复 posts_post_type_check 约束
-- 在 Supabase SQL Editor 中执行
-- ============================================

-- 1. 删除旧的 CHECK 约束
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_post_type_check;

-- 2. 添加新的 CHECK 约束（包含 serial 和 article）
ALTER TABLE posts ADD CONSTRAINT posts_post_type_check
  CHECK (post_type IN ('novel', 'illustration', 'comic', 'ramble', 'cosplay', 'other', 'serial', 'article'));

-- 3. 修复：用户可查看自己的所有作品（包括非 published 状态）
DROP POLICY IF EXISTS posts_self_read ON posts;
CREATE POLICY posts_self_read ON posts FOR SELECT USING (auth.uid() = user_id);

-- 4. 确保 profiles 有 insert 权限
DROP POLICY IF EXISTS profiles_self_insert ON profiles;
CREATE POLICY profiles_self_insert ON profiles FOR INSERT WITH CHECK (auth.uid() = id);