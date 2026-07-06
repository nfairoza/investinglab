import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Shared service-role Supabase client factory. Uses SUPABASE_SECRET_KEY, which
// bypasses RLS — server-only, never expose to the browser. Returns null if the
// env isn't configured so callers can degrade gracefully.
export function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
