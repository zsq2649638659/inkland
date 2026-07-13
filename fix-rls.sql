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