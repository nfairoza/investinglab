import { createClient } from "@/utils/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

// Resolve the authenticated user + a request-scoped Supabase client for API
// routes. Returns null when there's no session, so callers can 401. NEVER trust
// a user_id from the client — always derive it here from the verified session.
export async function getUserClient(): Promise<{ supabase: SupabaseClient; userId: string } | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return { supabase, userId: user.id };
}

// Per-user AI cache lives in user_prefs.ai_cache (a JSON map keyed by feature).
export async function readAiCache(ctx: { supabase: SupabaseClient }, key: string): Promise<{ generatedAt: string; data: unknown } | null> {
  const { data } = await ctx.supabase.from("user_prefs").select("ai_cache").maybeSingle();
  const entry = (data?.ai_cache as Record<string, any> | undefined)?.[key];
  return entry ?? null;
}

export async function writeAiCache(ctx: { supabase: SupabaseClient; userId: string }, key: string, value: { generatedAt: string; data: unknown }): Promise<void> {
  const { data } = await ctx.supabase.from("user_prefs").select("ai_cache").maybeSingle();
  const cache = { ...((data?.ai_cache as Record<string, any>) ?? {}), [key]: value };
  await ctx.supabase.from("user_prefs").upsert(
    { user_id: ctx.userId, ai_cache: cache, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
}
