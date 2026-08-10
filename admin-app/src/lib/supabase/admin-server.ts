import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createAdminClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      cookieOptions: { name: "inkland-admin-auth" },
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch { /* Server Components cannot always write cookies. */ }
        },
      },
    }
  );
}

export async function getAdminContext() {
  const supabase = await createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, account: null };
  const { data: account } = await supabase.from("admin_accounts").select("id, email, display_name, status").eq("id", user.id).eq("status", "active").maybeSingle();
  return { supabase, user: account ? user : null, account };
}
