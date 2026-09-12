-- ============================================================
-- 修复 likes/bookmarks/follows 共用互动限制触发器
--
-- 原函数直接写 NEW.follower_id。该函数也被 likes 触发器调用，
-- likes 的 NEW 记录没有 follower_id，因此点赞请求会返回 42703：
-- record "new" has no field "follower_id"。
--
-- 在 Supabase SQL Editor 执行本文件一次即可；不改动任何点赞数据。
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_user_restrictions_interact()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_status TEXT;
  v_label TEXT;
BEGIN
  IF TG_TABLE_NAME = 'follows' THEN
    v_user_id := NULLIF(to_jsonb(NEW) ->> 'follower_id', '')::UUID;
  ELSE
    v_user_id := NULLIF(to_jsonb(NEW) ->> 'user_id', '')::UUID;
  END IF;

  IF auth.uid() IS NULL OR v_user_id IS NULL OR v_user_id <> auth.uid() THEN
    RETURN NEW;
  END IF;

  SELECT p.moderation_status
    INTO v_status
  FROM public.profiles AS p
  WHERE p.id = v_user_id;

  v_label := CASE TG_TABLE_NAME
    WHEN 'follows' THEN '关注其他用户'
    WHEN 'bookmarks' THEN '收藏作品'
    ELSE '点赞作品'
  END;

  IF v_status = 'banned' THEN
    RAISE EXCEPTION USING MESSAGE = '你的账号已被封禁，无法' || v_label || '。';
  ELSIF v_status = 'suspended' THEN
    RAISE EXCEPTION USING MESSAGE = '你的账号已被暂停，暂停期间无法' || v_label || '。';
  ELSIF EXISTS (
    SELECT 1
    FROM public.user_restrictions AS r
    WHERE r.user_id = v_user_id
      AND r.restriction_type = 'interact'
      AND r.status = 'active'
      AND (r.ends_at IS NULL OR r.ends_at > NOW())
  ) THEN
    RAISE EXCEPTION USING MESSAGE = '你的互动功能暂时受限，无法' || v_label || '。';
  END IF;

  RETURN NEW;
END;
$$;
