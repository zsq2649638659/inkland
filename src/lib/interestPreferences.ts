import type { SupabaseClient, User } from "@supabase/supabase-js";

export const INTEREST_PREFERENCES_KEY = "inkland_interest_preferences";

export interface InterestPreferences {
  domains: string[];
  original_works: string[];
  dimensions: string[];
  completed_at: string | null;
}

export const interestDomains = ["影视", "动画", "游戏", "小说", "音乐", "原创", "插画摄影"];
export const interestDimensions = ["CP", "角色", "世界观", "无 CP", "短篇", "长篇连载"];
export const visualInterestOptions = ["插画", "摄影", "角色设计", "场景氛围"];
export const visualInterestDimensions = ["构图", "色彩", "教程", "作品集"];

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function readInterestPreferences(user: User | null): InterestPreferences | null {
  if (!user) return null;
  const raw = user.user_metadata?.[INTEREST_PREFERENCES_KEY];
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  return {
    domains: stringArray(value.domains),
    original_works: stringArray(value.original_works),
    dimensions: stringArray(value.dimensions),
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
