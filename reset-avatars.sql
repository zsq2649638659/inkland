-- ============================================================
-- 重置虚拟用户头像
-- 将除你之外的所有用户头像设为 NULL，前端会自动使用昵称首字母作为头像
-- ============================================================

-- 请替换 'YOUR_USER_ID' 为你自己的用户 ID（在 Supabase Auth Users 中查看）
-- 如果不确定自己的 ID，可以先执行：
-- SELECT id, email FROM auth.users;

-- 方式一：如果你知道自己的用户 ID，替换后执行
-- UPDATE profiles SET avatar_url = NULL WHERE id != 'YOUR_USER_ID';

-- 方式二：根据 email 排除自己（替换 your-email@example.com）
-- UPDATE profiles SET avatar_url = NULL WHERE id != (SELECT id FROM auth.users WHERE email = 'your-email@example.com');

-- 方式三：清除所有用户头像（包括你自己）
-- UPDATE profiles SET avatar_url = NULL;

-- 方式四：删除所有 profiles 中不存在于 auth.users 的脏数据
-- DELETE FROM profiles WHERE id NOT IN (SELECT id FROM auth.users);