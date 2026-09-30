import { createBrowserClient } from "@supabase/ssr";

let browserClient: ReturnType<typeof createBrowserClient> | undefined;

export function createClient() {
  if (!browserClient) {
    const isAuthConfirmationPage =
      typeof window !== "undefined" && window.location.pathname === "/auth/confirm";

    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          // The confirmation page exchanges callback parameters itself. A URL
          // predicate only filters implicit callbacks; Supabase still auto-detects
          // PKCE codes, so use false on this route to avoid consuming the one-time
          // code before AuthConfirmPage exchanges it.
          detectSessionInUrl: !isAuthConfirmationPage,
        },
      }
    );
  }
  return browserClient;
}
