-- ============================================
-- 修复 RLS 策略：确保点赞、收藏、评论可正常读写
-- 在 Supabase SQL Editor 中执行
-- ============================================

-- 修复 likes 表：允许已登录用户插入和删除自己的点赞
DROP POLICY IF EXISTS likes_self_insert ON likes;
DROP POLICY IF EXISTS likes_self_delete ON likes;
CREATE POLICY likes_self_insert ON likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY likes_self_delete ON likes FOR DELETE USING (auth.uid() = user_id);

-- 修复 bookmarks 表：允许已登录用户读写自己的收藏
DROP POLICY IF EXISTS bookmarks_self_all ON bookmarks;
CREATE POLICY bookmarks_self_all ON bookmarks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 修复 comments 表：允许已登录用户插入和删除自己的评论
DROP POLICY IF EXISTS comments_self_insert ON comments;
CREATE POLICY comments_self_insert ON comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY comments_self_delete ON comments FOR DELETE USING (auth.uid() = user_id);

-- 修复 follows 表：用户可看到自己关注的 AND 关注自己的人
-- 问题：原策略只允许 auth.uid() = follower_id，导致用户看不到自己的粉丝
-- 使用 DO 块安全处理，避免因策略不存在导致错误
DO $$
BEGIN
  -- 删除已有策略（如果存在）
  DROP POLICY IF EXISTS follows_self_select ON follows;
  DROP POLICY IF EXISTS follows_self_insert ON follows;
  DROP POLICY IF EXISTS follows_self_delete ON follows;

  -- 创建新策略
  EXECUTE 'CREATE POLICY follows_self_select ON follows FOR SELECT USING (auth.uid() = follower_id OR auth.uid() = following_id)';
  EXECUTE 'CREATE POLICY follows_self_insert ON follows FOR INSERT WITH CHECK (auth.uid() = follower_id)';
  EXECUTE 'CREATE POLICY follows_self_delete ON follows FOR DELETE USING (auth.uid() = follower_id)';
END $$;