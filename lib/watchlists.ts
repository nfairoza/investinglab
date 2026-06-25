import type { SupabaseClient } from "@supabase/supabase-js";

// Ensure the user has a 'default' watch list and return its id. Lazily creates
// it (covers users who had no rows at migration time, e.g. brand-new accounts).
export async function ensureDefaultList(ctx: { supabase: SupabaseClient; userId: string }): Promise<string> {
  const { data: existing } = await ctx.supabase
    .from("watch_lists").select("id").eq("kind", "default").limit(1).maybeSingle();
  if (existing?.id) return existing.id as string;
  const { data: ins } = await ctx.supabase
    .from("watch_lists")
    .insert({ user_id: ctx.userId, name: "My Watchlist", kind: "default", sort_order: 0 })
    .select("id").maybeSingle();
  return (ins?.id as string) ?? "";
}
