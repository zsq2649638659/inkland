-- ============================================
-- 修复：移除 profiles 对 auth.users 的外键约束
-- 在 Supabase SQL Editor 中执行
-- ============================================

-- 1. 删除旧的外键约束和触发器
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- 2. 让 profiles 独立存在（不再依赖 auth.users）
ALTER TABLE profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- 3. 重新插入种子数据
INSERT INTO profiles (id, nickname, avatar_url, bio, role) VALUES
  ('00000000-0000-0000-0000-000000000001', '夜雨声烦', NULL, '瓶邪十年老粉，专注HE甜文', 'author'),
  ('00000000-0000-0000-0000-000000000002', '春风不渡', NULL, '温迪单推人，写点小短篇', 'author'),
  ('00000000-0000-0000-0000-000000000003', '画画的阿漓', NULL, '同人画手，主明日方舟/原神', 'author'),
  ('00000000-0000-0000-0000-000000000004', '月下独酌', NULL, '随缘更新，佛系产出', 'author'),
  ('00000000-0000-0000-0000-000000000005', '长安某', NULL, '正剧向写手，偶尔BE', 'author')
ON CONFLICT (id) DO NOTHING;

-- 4. 插入标签
INSERT INTO tags (name, type, post_count) VALUES
  ('盗墓笔记', 'fandom', 1), ('瓶邪', 'cp', 1), ('连载中', 'status', 2),
  ('HE', 'genre', 1), ('原神', 'fandom', 1), ('温迪中心', 'character', 1),
  ('短篇', 'genre', 1), ('已完结', 'status', 1), ('明日方舟', 'fandom', 1),
  ('能天使', 'character', 1), ('插画', 'genre', 1), ('同人图', 'genre', 1),
  ('咒术回战', 'fandom', 1), ('五夏', 'cp', 1), ('正剧向', 'genre', 1),
  ('BE预警', 'genre', 1), ('碎碎念', 'genre', 1), ('速写', 'genre', 1)
ON CONFLICT (name) DO NOTHING;

-- 5. 插入作品
INSERT INTO posts (id, user_id, title, content, word_count, status, post_type, rating, created_at) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '【盗墓笔记】长夜未尽 · 第一章', '吴邪站在墓道入口，手电筒的光束在黑暗中切开一道狭窄的通道。身后的张起灵一如既往地沉默，只有呼吸声在寂静中格外清晰。他们已经在这座古墓里走了整整三天，随身携带的干粮所剩无几，水壶也见了底。', 4200, 'published', 'novel', 'all', now() - interval '6 minutes'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', '【原神】风起之时 — 温迪中心向', '蒙德城的晚风总是带着蒲公英的香气。温迪坐在风神像的手掌上，双腿悬空晃荡着，手中的竖琴拨出断断续续的音符。他已经很久没有弹奏完整的曲子了——不是因为技艺生疏，而是因为每次弹起那首老歌，就会想起一些不该想起的事。', 3000, 'published', 'novel', 'all', now() - interval '23 minutes'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003', '【明日方舟】能天使 · 新皮肤概念设计', '新皮肤概念设计稿，灵感来源于夏日祭典。能天使身着轻便的浴衣，手持苹果糖，背景是祭典的灯笼和烟花。', 500, 'published', 'illustration', 'all', now() - interval '1 hour'),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000004', '', '刚看完剧场版，紧急摸了三张速写。CP 发糖发到齁，我直接原地升天……今晚通宵赶稿，明早发完整版。先放个预告图在评论区', 200, 'published', 'ramble', 'all', now() - interval '2 hours'),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000005', '【咒术回战】五条悟 × 夏油杰 · 那年夏天永不结束', '高专二年级的夏天，五条悟第一次意识到，有些事情即使拥有六眼也无法看透。比如说夏油杰脸上那个越来越淡的笑容，咒术师的世界从来不是什么童话。', 12000, 'published', 'novel', 'all', now() - interval '3 hours')
ON CONFLICT (id) DO NOTHING;

-- 6. 关联标签
DO $$
DECLARE
  tag_dmbj UUID; tag_px UUID; tag_lz UUID; tag_he UUID;
  tag_ys UUID; tag_wd UUID; tag_dp UUID; tag_wj UUID;
  tag_mrfz UUID; tag_nts UUID; tag_ch UUID; tag_trt UUID;
  tag_zs UUID; tag_wx UUID; tag_zj UUID; tag_be UUID;
  tag_ssn UUID; tag_sx UUID;
BEGIN
  SELECT id INTO tag_dmbj FROM tags WHERE name = '盗墓笔记';
  SELECT id INTO tag_px FROM tags WHERE name = '瓶邪';
  SELECT id INTO tag_lz FROM tags WHERE name = '连载中';
  SELECT id INTO tag_he FROM tags WHERE name = 'HE';
  SELECT id INTO tag_ys FROM tags WHERE name = '原神';
  SELECT id INTO tag_wd FROM tags WHERE name = '温迪中心';
  SELECT id INTO tag_dp FROM tags WHERE name = '短篇';
  SELECT id INTO tag_wj FROM tags WHERE name = '已完结';
  SELECT id INTO tag_mrfz FROM tags WHERE name = '明日方舟';
  SELECT id INTO tag_nts FROM tags WHERE name = '能天使';
  SELECT id INTO tag_ch FROM tags WHERE name = '插画';
  SELECT id INTO tag_trt FROM tags WHERE name = '同人图';
  SELECT id INTO tag_zs FROM tags WHERE name = '咒术回战';
  SELECT id INTO tag_wx FROM tags WHERE name = '五夏';
  SELECT id INTO tag_zj FROM tags WHERE name = '正剧向';
  SELECT id INTO tag_be FROM tags WHERE name = 'BE预警';
  SELECT id INTO tag_ssn FROM tags WHERE name = '碎碎念';
  SELECT id INTO tag_sx FROM tags WHERE name = '速写';

  INSERT INTO post_tags (post_id, tag_id) VALUES
    ('10000000-0000-0000-0000-000000000001', tag_dmbj),
    ('10000000-0000-0000-0000-000000000001', tag_px),
    ('10000000-0000-0000-0000-000000000001', tag_lz),
    ('10000000-0000-0000-0000-000000000001', tag_he),
    ('10000000-0000-0000-0000-000000000002', tag_ys),
    ('10000000-0000-0000-0000-000000000002', tag_wd),
    ('10000000-0000-0000-0000-000000000002', tag_dp),
    ('10000000-0000-0000-0000-000000000002', tag_wj),
    ('10000000-0000-0000-0000-000000000003', tag_mrfz),
    ('10000000-0000-0000-0000-000000000003', tag_nts),
    ('10000000-0000-0000-0000-000000000003', tag_ch),
    ('10000000-0000-0000-0000-000000000003', tag_trt),
    ('10000000-0000-0000-0000-000000000004', tag_ssn),
    ('10000000-0000-0000-0000-000000000004', tag_sx),
    ('10000000-0000-0000-0000-000000000005', tag_zs),
    ('10000000-0000-0000-0000-000000000005', tag_wx),
    ('10000000-0000-0000-0000-000000000005', tag_lz),
    ('10000000-0000-0000-0000-000000000005', tag_zj),
    ('10000000-0000-0000-0000-000000000005', tag_be);

  UPDATE tags SET post_count = (SELECT COUNT(*) FROM post_tags WHERE tag_id = tags.id);
END $$;