-- Public-profile visibility controls for /settings?tab=privacy.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS show_gender BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS show_profile_info BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS show_likes BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS show_bookmarks BOOLEAN NOT NULL DEFAULT FALSE;

-- Gender stays in auth user metadata. Return only a display-safe value when
-- the profile owner explicitly opted in.
CREATE OR REPLACE FUNCTION public.get_public_profile_gender(p_user_id UUID)
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT CASE
    WHEN profile.show_gender IS TRUE THEN
      CASE account.raw_user_meta_data #>> '{inkland_account_preferences,gender}'
        WHEN 'male' THEN 'male'
        WHEN 'female' THEN 'female'
        ELSE NULL
      END
    ELSE NULL
  END
  FROM public.profiles AS profile
  JOIN auth.users AS account ON account.id = profile.id
  WHERE profile.id = p_user_id
    AND (
      COALESCE(profile.is_test_account, FALSE) = FALSE
      OR public.is_test_account(auth.uid())
      OR profile.id = auth.uid()
    )
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_profile_gender(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_profile_gender(UUID) TO anon, authenticated;

-- Do not expose bio through direct profile row reads. The RPC returns it only
-- to the owner or when the profile owner enabled public profile information.
CREATE OR REPLACE FUNCTION public.get_public_profile_bios(p_user_ids UUID[])
RETURNS TABLE(profile_id UUID, bio TEXT)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT
    profile.id,
    CASE
      WHEN profile.id = auth.uid() OR profile.show_profile_info IS TRUE THEN profile.bio
      ELSE NULL
    END
  FROM public.profiles AS profile
  WHERE profile.id = ANY(COALESCE(p_user_ids, ARRAY[]::UUID[]))
    AND (
      COALESCE(profile.is_test_account, FALSE) = FALSE
      OR public.is_test_account(auth.uid())
      OR profile.id = auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION public.get_public_profile_bios(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_profile_bios(UUID[]) TO anon, authenticated;

-- Profile data remains readable as before except for bio. Keep generated
-- profile fields and future columns available, while routing bio through the
-- privacy-aware function above.
REVOKE SELECT ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
REVOKE SELECT (bio) ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
DO $$
DECLARE
  readable_columns TEXT;
BEGIN
  SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinal_position)
  INTO readable_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name <> 'bio';

  IF readable_columns IS NULL THEN
    RAISE EXCEPTION 'Could not find readable columns for public.profiles';
  END IF;

  EXECUTE format(
    'GRANT SELECT (%s) ON TABLE public.profiles TO anon, authenticated',
    readable_columns
  );
END $$;

ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS likes_public_profile_read ON public.likes;
CREATE POLICY likes_public_profile_read ON public.likes
  FOR SELECT TO anon, authenticated
  USING (
    user_id = auth.uid()
    OR (
      NOT public.is_test_account(user_id)
      AND EXISTS (
        SELECT 1
        FROM public.profiles AS profile
        WHERE profile.id = likes.user_id
          AND profile.show_likes IS TRUE
      )
    )
  );

DROP POLICY IF EXISTS bookmarks_public_profile_read ON public.bookmarks;
CREATE POLICY bookmarks_public_profile_read ON public.bookmarks
  FOR SELECT TO anon, authenticated
  USING (
    user_id = auth.uid()
    OR (
      NOT public.is_test_account(user_id)
      AND EXISTS (
        SELECT 1
        FROM public.profiles AS profile
        WHERE profile.id = bookmarks.user_id
          AND profile.show_bookmarks IS TRUE
      )
    )
  );
