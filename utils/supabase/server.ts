import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server-side Supabase client. Next 14.2: cookies() is synchronous — do NOT
// await it. Initialize inside each handler/request (never at module scope) so a
// warm serverless instance can't leak one user's session to another.
export function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component — middleware refreshes the session.
          }
        },
      },
    },
  );
}
