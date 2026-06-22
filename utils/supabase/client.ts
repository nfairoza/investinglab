import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client (uses the public publishable key; RLS protects
// data). Call createClient() fresh where needed — don't share a module singleton.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
