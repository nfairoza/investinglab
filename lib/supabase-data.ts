import { createClient } from "@/utils/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

// Resolve the authenticated user + a request-scoped Supabase client for API
// routes. Returns null when there's no session, so callers can 401. NEVER trust
// a user_id from the client — always derive it here from the verified session.
export async function getUserClient(): Promise<{ supabase: SupabaseClient; userId: string; isAdmin: boolean } | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return { supabase, userId: user.id, isAdmin: isAdminUser(user) };
}

// A user is admin iff app_metadata.role === "admin" (set in the Supabase
// dashboard — never hardcoded). app_metadata is server-controlled: a user cannot
// set it themselves, so it's safe for authorization.
export function isAdminUser(user: { app_metadata?: Record<string, unknown> } | null | undefined): boolean {
  return user?.app_metadata?.role === "admin";
}

// Convenience for routes that must be admin-only. Returns the ctx if admin,
// else null (caller returns 403).
export async function getAdminClient(): Promise<{ supabase: SupabaseClient; userId: string } | null> {
  const ctx = await getUserClient();
  if (!ctx || !ctx.isAdmin) return null;
  return { supabase: ctx.supabase, userId: ctx.userId };
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
