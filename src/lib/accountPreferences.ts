import type { SupabaseClient, User } from "@supabase/supabase-js";

export const ACCOUNT_PREFERENCES_KEY = "inkland_account_preferences";

export type Gender = "male" | "female" | "private";
export type CopyrightLicense = "all-rights-reserved" | "cc-by-nc-nd" | "cc-by-nc-sa" | "cc-by-nc" | "cc-by-nd" | "cc-by-sa" | "cc-by";

export interface AccountPreferences {
  gender: Gender;
  birth_date: string | null;
  copyright_license: CopyrightLicense;
  updated_at: string | null;
}

export const defaultAccountPreferences: AccountPreferences = {
  gender: "private",
  birth_date: null,
  copyright_license: "all-rights-reserved",
  updated_at: null,
};

function isGender(value: unknown): value is Gender {
  return value === "male" || value === "female" || value === "private";
}

function isCopyrightLicense(value: unknown): value is CopyrightLicense {
  return value === "all-rights-reserved" || value === "cc-by-nc-nd" || value === "cc-by-nc-sa" || value === "cc-by-nc" || value === "cc-by-nd" || value === "cc-by-sa" || value === "cc-by";
}

export function readAccountPreferences(user: User | null): AccountPreferences {
  const raw = user?.user_metadata?.[ACCOUNT_PREFERENCES_KEY];
  if (!raw || typeof raw !== "object") return defaultAccountPreferences;
  const value = raw as Record<string, unknown>;
  return {
    gender: isGender(value.gender) ? value.gender : defaultAccountPreferences.gender,
    birth_date: typeof value.birth_date === "string" && value.birth_date ? value.birth_date : null,
    copyright_license: isCopyrightLicense(value.copyright_license) ? value.copyright_license : defaultAccountPreferences.copyright_license,
    updated_at: typeof value.updated_at === "string" ? value.updated_at : null,
  };
}

export async function saveAccountPreferences(
  supabase: SupabaseClient,
  preferences: Omit<AccountPreferences, "updated_at">,
) {
  const nextPreferences: AccountPreferences = {
    ...preferences,
    updated_at: new Date().toISOString(),
  };

  return supabase.auth.updateUser({
    data: { [ACCOUNT_PREFERENCES_KEY]: nextPreferences },
  });
}

export const genderLabels: Record<Gender, string> = {
  male: "男",
  female: "女",
  private: "保密",
};
