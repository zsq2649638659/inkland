-- ============================================
-- 测试数据种子脚本 - 在 Supabase SQL Editor 中执行
-- 使用已有的 5 个测试用户
-- ============================================

-- 1. 为每个测试用户，在每个作品上创建点赞、收藏、评论
DO $$
DECLARE
  test_users UUID[] := ARRAY[
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000005'
  ];
  comments TEXT[] := ARRAY[
    '写得真好，期待下一章！',
    '这个设定太有意思了，追了！',
    '文笔细腻，人物刻画很到位',
    '好看！一口气读完了',
    '剧情转折好精彩，完全没想到',
    '太喜欢这个角色了',
    '画面感很强，像在看电影',
    '催更催更！',
    '细节描写太棒了',
    '每一章都让人期待'
  ];
  p RECORD;
  i INT;
  j INT;
  real_user_id UUID := '46f57789-ee86-489a-ac9c-650392054a13';
  post_count INT;
BEGIN
  UPDATE profiles
  SET is_test_account = TRUE
  WHERE id = ANY(test_users);

  SELECT COUNT(*) INTO post_count FROM posts WHERE user_id = real_user_id AND status = 'published';

  FOR p IN SELECT id, title FROM posts WHERE user_id = real_user_id AND status = 'published' LOOP
    RAISE NOTICE '处理作品: %', p.title;

    FOR i IN 1..array_length(test_users, 1) LOOP
      -- 点赞
      INSERT INTO likes (post_id, user_id) VALUES (p.id, test_users[i])
      ON CONFLICT (post_id, user_id) DO NOTHING;

      -- 收藏
      INSERT INTO bookmarks (post_id, user_id) VALUES (p.id, test_users[i])
      ON CONFLICT (post_id, user_id) DO NOTHING;

      -- 评论（循环使用 10 条评论）
      j := ((i - 1) % 10) + 1;
      INSERT INTO comments (post_id, user_id, content) VALUES (p.id, test_users[i], comments[j]);
    END LOOP;
  END LOOP;

  -- 关注
  FOR i IN 1..array_length(test_users, 1) LOOP
    INSERT INTO follows (follower_id, following_id) VALUES (test_users[i], real_user_id)
    ON CONFLICT (follower_id, following_id) DO NOTHING;
  END LOOP;
END $$;

-- 2. 创建通知
DO $$
DECLARE
  test_users UUID[] := ARRAY[
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000005'
  ];
  real_user_id UUID := '46f57789-ee86-489a-ac9c-650392054a13';
  i INT;
  post_ids UUID[];
  post_titles TEXT[];
  now_ts TIMESTAMPTZ := now();
  pid UUID;
  ptitle TEXT;
BEGIN
  SELECT array_agg(id), array_agg(title) INTO post_ids, post_titles
  FROM posts WHERE user_id = real_user_id AND status = 'published';

  IF post_ids IS NULL OR array_length(post_ids, 1) = 0 THEN
    RAISE NOTICE '没有作品，跳过通知创建';
    RETURN;
  END IF;

  FOR i IN 1..array_length(test_users, 1) LOOP
    pid := post_ids[((i - 1) % array_length(post_ids, 1)) + 1];
    ptitle := post_titles[((i - 1) % array_length(post_titles, 1)) + 1];

    INSERT INTO notifications (user_id, type, actor_id, post_id, content, read, created_at)
    VALUES (real_user_id, 'comment', test_users[i], pid, '评论了你的作品《' || ptitle || '》', false, now_ts - ((6 - i) || ' minutes')::INTERVAL);

    INSERT INTO notifications (user_id, type, actor_id, post_id, content, read, created_at)
    VALUES (real_user_id, 'like', test_users[i], pid, '赞了你的作品《' || ptitle || '》', false, now_ts - ((6 - i) * 2 || ' minutes')::INTERVAL);

    INSERT INTO notifications (user_id, type, actor_id, post_id, content, read, created_at)
    VALUES (real_user_id, 'bookmark', test_users[i], pid, '收藏了你的作品《' || ptitle || '》', false, now_ts - ((6 - i) * 3 || ' minutes')::INTERVAL);

    INSERT INTO notifications (user_id, type, actor_id, content, read, created_at)
    VALUES (real_user_id, 'follow', test_users[i], '关注了你', false, now_ts - ((6 - i) * 4 || ' minutes')::INTERVAL);
  END LOOP;
END $$;
