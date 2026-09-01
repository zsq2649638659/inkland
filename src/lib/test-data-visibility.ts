import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 测试数据的公开可见性：测试账号共享测试空间，其他访问者只看正式数据。
 */
export async function canViewTestData(
  supabase: SupabaseClient,
  userId?: string | null,
): Promise<boolean> {
  if (!userId) return false;
  const { data } = await supabase
    .from("profiles")
    .select("is_test_account")
    .eq("id", userId)
    .maybeSingle();
  return data?.is_test_account === true;
}

export function includeTestDataForProfile(
  profile?: { is_test_account?: boolean } | null,
): boolean {
  return profile?.is_test_account === true;
}

/** 在不改变 Supabase builder 类型的前提下，为非测试访问者增加过滤条件。 */
export function withTestDataVisibility<T>(query: T, includeTestData: boolean): T {
  if (includeTestData) return query;
  return (query as { eq: (column: string, value: boolean) => T }).eq("is_test_data", false);
}
