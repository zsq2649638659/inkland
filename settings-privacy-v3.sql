-- Return profile follow totals without returning relationship rows.
-- Run after settings-privacy-v2.sql in the Supabase SQL editor.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_public_profile_follow_counts(p_user_id UUID)
RETURNS TABLE (
  following_count BIGINT,
  followers_count BIGINT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT
    COUNT(relationship.id) FILTER (WHERE relationship.follower_id = profile.id),
    COUNT(relationship.id) FILTER (WHERE relationship.following_id = profile.id)
  FROM public.profiles AS profile
  LEFT JOIN public.follows AS relationship
    ON (
      relationship.follower_id = profile.id
      OR relationship.following_id = profile.id
    )
    AND public.is_test_account(relationship.follower_id) = public.is_test_account(auth.uid())
    AND public.is_test_account(relationship.following_id) = public.is_test_account(auth.uid())
  WHERE profile.id = p_user_id
    AND public.is_test_account(profile.id) = public.is_test_account(auth.uid())
  GROUP BY profile.id;
$$;

REVOKE ALL ON FUNCTION public.get_public_profile_follow_counts(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_profile_follow_counts(UUID) TO anon, authenticated;

COMMENT ON FUNCTION public.get_public_profile_follow_counts(UUID) IS
  'Returns only following/follower totals for a profile in the viewer’s test-data space; does not expose list rows and is independent of show_follow_lists.';

COMMIT;
