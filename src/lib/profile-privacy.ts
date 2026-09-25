import type { createClient } from "@/lib/supabase/browser";

type BrowserSupabaseClient = ReturnType<typeof createClient>;

export async function getPublicProfileBios(
  supabase: BrowserSupabaseClient,
  profileIds: readonly string[],
): Promise<Map<string, string | null>> {
  const uniqueIds = [...new Set(profileIds)];
  const emptyResults = new Map(uniqueIds.map((profileId) => [profileId, null]));
  if (!uniqueIds.length) return emptyResults;
  try {
    const { data, error } = await supabase.rpc("get_public_profile_bios", { p_user_ids: uniqueIds });
    if (error || !Array.isArray(data)) return emptyResults;
    for (const row of data) {
      if (row && typeof row.profile_id === "string") {
        emptyResults.set(row.profile_id, typeof row.bio === "string" ? row.bio : null);
      }
    }
  } catch {
    return emptyResults;
  }
  return emptyResults;
}
