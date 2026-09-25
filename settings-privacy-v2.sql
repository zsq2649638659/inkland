-- Add relationship and interaction permissions used by /settings?tab=privacy.
-- Run after settings-privacy-v1.sql in the Supabase SQL editor.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS show_follow_lists BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS allow_follows BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS comment_permission TEXT NOT NULL DEFAULT 'everyone',
  ADD COLUMN IF NOT EXISTS reply_permission TEXT NOT NULL DEFAULT 'everyone',
  ADD COLUMN IF NOT EXISTS message_permission TEXT NOT NULL DEFAULT 'everyone';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_comment_permission_check,
  DROP CONSTRAINT IF EXISTS profiles_reply_permission_check,
  DROP CONSTRAINT IF EXISTS profiles_message_permission_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_comment_permission_check
    CHECK (comment_permission IN ('everyone', 'followers', 'off')),
  ADD CONSTRAINT profiles_reply_permission_check
    CHECK (reply_permission IN ('everyone', 'followers', 'off')),
  ADD CONSTRAINT profiles_message_permission_check
    CHECK (message_permission IN ('everyone', 'followers', 'off'));

-- settings-privacy-v1.sql grants SELECT per profile column and therefore does
-- not automatically include columns added later by this migration.
GRANT SELECT (show_follow_lists, allow_follows)
  ON TABLE public.profiles TO anon, authenticated;

-- Keep interaction choices private while letting a signed-in owner read their
-- complete settings row without exposing these fields on public profile reads.
CREATE OR REPLACE FUNCTION public.get_own_settings_privacy()
RETURNS JSONB
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT jsonb_build_object(
    'show_gender', profile.show_gender,
    'show_profile_info', profile.show_profile_info,
    'show_likes', profile.show_likes,
    'show_bookmarks', profile.show_bookmarks,
    'show_follow_lists', profile.show_follow_lists,
    'allow_follows', profile.allow_follows,
    'comment_permission', profile.comment_permission,
    'reply_permission', profile.reply_permission,
    'message_permission', profile.message_permission
  )
  FROM public.profiles AS profile
  WHERE profile.id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_own_settings_privacy() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_own_settings_privacy() TO authenticated;

COMMENT ON COLUMN public.profiles.show_follow_lists IS
  'Whether visitors may view this profile’s followers and following lists.';
COMMENT ON COLUMN public.profiles.allow_follows IS
  'Whether this profile accepts new followers.';
COMMENT ON COLUMN public.profiles.comment_permission IS
  'Audience allowed to comment on this profile’s works: everyone, followers, or off.';
COMMENT ON COLUMN public.profiles.reply_permission IS
  'Audience allowed to reply to comments written by this profile: everyone, followers, or off.';
COMMENT ON COLUMN public.profiles.message_permission IS
  'Future direct-message audience preference; the application currently has no direct-message feature.';

CREATE OR REPLACE FUNCTION public.settings_privacy_interaction_allowed(
  p_actor_id UUID,
  p_profile_id UUID,
  p_interaction TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_permission TEXT;
BEGIN
  IF p_actor_id IS NULL OR p_profile_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF p_actor_id = p_profile_id THEN
    RETURN TRUE;
  END IF;

  SELECT CASE p_interaction
      WHEN 'comment' THEN profile.comment_permission
      WHEN 'reply' THEN profile.reply_permission
      ELSE NULL
    END
  INTO v_permission
  FROM public.profiles AS profile
  WHERE profile.id = p_profile_id;

  IF v_permission IS NULL THEN
    RETURN FALSE;
  ELSIF v_permission = 'everyone' THEN
    RETURN TRUE;
  ELSIF v_permission = 'followers' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.follows AS relationship
      WHERE relationship.follower_id = p_actor_id
        AND relationship.following_id = p_profile_id
    );
  END IF;

  RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.settings_privacy_interaction_allowed(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_settings_comment_privacy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_profile_id UUID;
  v_interaction TEXT;
BEGIN
  -- Trusted server-side jobs without an end-user JWT keep their existing path.
  IF v_actor_id IS NULL OR NEW.user_id IS DISTINCT FROM v_actor_id THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_id IS NULL THEN
    v_interaction := 'comment';
    SELECT post.user_id INTO v_profile_id
    FROM public.posts AS post
    WHERE post.id = NEW.post_id;
  ELSE
    v_interaction := 'reply';
    SELECT parent_comment.user_id INTO v_profile_id
    FROM public.comments AS parent_comment
    WHERE parent_comment.id = NEW.parent_id;
  END IF;

  IF v_profile_id IS NOT NULL
    AND NOT public.settings_privacy_interaction_allowed(v_actor_id, v_profile_id, v_interaction) THEN
    IF v_interaction = 'reply' THEN
      RAISE EXCEPTION '该用户暂不接受新的回复。' USING ERRCODE = 'P0001';
    ELSE
      RAISE EXCEPTION '该用户暂不接受新的评论。' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comments_enforce_settings_privacy ON public.comments;
CREATE TRIGGER comments_enforce_settings_privacy
BEFORE INSERT ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.enforce_settings_comment_privacy();

CREATE OR REPLACE FUNCTION public.enforce_settings_follow_privacy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_allow_follows BOOLEAN;
BEGIN
  IF v_actor_id IS NULL OR NEW.follower_id IS DISTINCT FROM v_actor_id THEN
    RETURN NEW;
  END IF;

  SELECT profile.allow_follows INTO v_allow_follows
  FROM public.profiles AS profile
  WHERE profile.id = NEW.following_id;

  IF v_allow_follows IS FALSE THEN
    RAISE EXCEPTION '该用户暂不接受新的关注。' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS follows_enforce_settings_privacy ON public.follows;
CREATE TRIGGER follows_enforce_settings_privacy
BEFORE INSERT ON public.follows
FOR EACH ROW EXECUTE FUNCTION public.enforce_settings_follow_privacy();

-- Keep raw relationship rows owner-only. A row belongs to both the follower's
-- and the followed user's list, so making a row public when either side opts
-- in would accidentally expose the other side's private list. Public lists are
-- returned through the narrowly filtered SECURITY DEFINER RPC below.
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  existing_policy RECORD;
BEGIN
  FOR existing_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'follows'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.follows', existing_policy.policyname);
  END LOOP;
END;
$$;

CREATE POLICY follows_self_select ON public.follows
  FOR SELECT TO anon, authenticated
  USING (
    public.is_test_account(follower_id) = public.is_test_account(auth.uid())
    AND public.is_test_account(following_id) = public.is_test_account(auth.uid())
    AND (auth.uid() = follower_id OR auth.uid() = following_id)
  );

CREATE POLICY follows_self_insert ON public.follows
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = follower_id
    AND public.is_test_account(follower_id) = public.is_test_account(following_id)
  );

CREATE POLICY follows_self_delete ON public.follows
  FOR DELETE TO authenticated
  USING (auth.uid() = follower_id);

CREATE OR REPLACE FUNCTION public.get_public_follow_list(
  p_user_id UUID,
  p_direction TEXT
)
RETURNS TABLE (
  profile_id UUID,
  nickname TEXT,
  avatar_url TEXT,
  show_profile_info BOOLEAN,
  is_test_account BOOLEAN
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT
    member.id,
    COALESCE(member.nickname, '匿名用户'),
    member.avatar_url,
    member.show_profile_info,
    COALESCE(member.is_test_account, FALSE)
  FROM public.profiles AS list_owner
  JOIN public.follows AS relationship
    ON (p_direction = 'followers' AND relationship.following_id = list_owner.id)
    OR (p_direction = 'following' AND relationship.follower_id = list_owner.id)
  JOIN public.profiles AS member
    ON member.id = CASE
      WHEN p_direction = 'followers' THEN relationship.follower_id
      ELSE relationship.following_id
    END
  WHERE list_owner.id = p_user_id
    AND p_direction IN ('followers', 'following')
    AND (list_owner.id = auth.uid() OR list_owner.show_follow_lists IS TRUE)
    AND public.is_test_account(list_owner.id) = public.is_test_account(auth.uid())
    AND public.is_test_account(member.id) = public.is_test_account(auth.uid())
  LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.get_public_follow_list(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_follow_list(UUID, TEXT) TO anon, authenticated;

COMMIT;
