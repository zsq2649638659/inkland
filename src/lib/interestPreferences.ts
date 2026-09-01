import type { SupabaseClient, User } from "@supabase/supabase-js";

export const INTEREST_PREFERENCES_KEY = "inkland_interest_preferences";

export interface InterestPreferences {
  domains: string[];
  original_works: string[];
  dimensions: string[];
  completed_at: string | null;
}

export const interestOptions = ["绘画", "影视", "娱乐", "二次元", "文字", "乙游", "连载"];

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function readInterestPreferences(user: User | null): InterestPreferences | null {
  if (!user) return null;
  const raw = user.user_metadata?.[INTEREST_PREFERENCES_KEY];
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  return {
    domains: stringArray(value.domains).filter((item) => interestOptions.includes(item)),
    // 旧版曾保存原作和兴趣维度；当前兴趣引导为单层选择，不再把它们带回页面。
    original_works: [],
    dimensions: [],
    completed_at: typeof value.completed_at === "string" ? value.completed_at : null,
  };
}

export function emptyInterestPreferences(): InterestPreferences {
  return { domains: [], original_works: [], dimensions: [], completed_at: null };
}

export async function saveInterestPreferences(
  supabase: SupabaseClient,
  preferences: Omit<InterestPreferences, "completed_at">,
) {
  const nextPreferences: InterestPreferences = {
    domains: [...new Set(preferences.domains)],
    original_works: [...new Set(preferences.original_works)],
    dimensions: [...new Set(preferences.dimensions)],
    completed_at: new Date().toISOString(),
  };

  return supabase.auth.updateUser({
    data: { [INTEREST_PREFERENCES_KEY]: nextPreferences },
  });
}
