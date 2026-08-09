-- ============================================
-- 修复 follows 表 RLS 策略
-- 问题：follows 表 RLS SELECT 策略过于严格，
-- 只允许用户看到自己作为 follower_id 的记录，
-- 导致用户无法看到自己的粉丝列表
-- 在 Supabase SQL Editor 中执行
-- ============================================

-- 1. 确保 RLS 已启用
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

-- 2. 删除已有策略（避免重复创建冲突）
DROP POLICY IF EXISTS "follows_self_select" ON follows;
DROP POLICY IF EXISTS "follows_self_insert" ON follows;
DROP POLICY IF EXISTS "follows_self_delete" ON follows;
DROP POLICY IF EXISTS "follows_public_read" ON follows;

-- 3. 创建 SELECT 策略：用户可以看到自己关注的 AND 关注自己的记录
--    follower_id = auth.uid()  → 我关注了谁（我的关注列表）
--    following_id = auth.uid() → 谁关注了我（我的粉丝列表）
CREATE POLICY "follows_self_select" ON follows
  FOR SELECT
  USING (auth.uid() = follower_id OR auth.uid() = following_id);

-- 4. 创建 INSERT 策略：用户只能以自己身份关注他人
CREATE POLICY "follows_self_insert" ON follows
  FOR INSERT
  WITH CHECK (auth.uid() = follower_id);

-- 5. 创建 DELETE 策略：用户只能取消自己的关注
CREATE POLICY "follows_self_delete" ON follows
  FOR DELETE
  USING (auth.uid() = follower_id);