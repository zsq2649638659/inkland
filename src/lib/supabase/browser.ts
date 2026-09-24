import { createBrowserClient } from "@supabase/ssr";

let browserClient: ReturnType<typeof createBrowserClient> | undefined;

export function createClient() {
  if (!browserClient) {
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          // The confirmation page exchanges the callback payload itself. Skipping
          // automatic URL detection here prevents the one-time PKCE code (or
          // implicit tokens from older links) from being consumed twice.
          detectSessionInUrl: (url) => url.pathname !== "/auth/confirm",
        },
      }
    );
  }
  return browserClient;
}
