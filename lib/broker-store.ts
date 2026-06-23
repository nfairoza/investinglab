import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserClient } from "@/lib/supabase-data";

// =============================================================================
// Per-user broker connection store (E*TRADE / Robinhood).
//
// Each user's broker OAuth tokens + personal broker credentials live in their
// OWN row of `broker_connections` (RLS-scoped: a user can only ever read/write
// their own). This replaces the old single shared lowdb store, so one user can
// never see another user's (or the admin's) brokerage data.
//
// The provider-specific token blob lives in the `data` jsonb column. Shapes:
//   etrade:    { requestToken, requestTokenSecret, accessToken, accessTokenSecret,
//                accounts: EtradeAccount[], selectedAccountIdKey }
//   robinhood: { deviceToken, accessToken, refreshToken, pending, challengeId,
//                crypto: { apiKey, privateKey } }
//
// NOTE: the E*TRADE *consumer* key/secret (the app registration) stay as shared
// admin platform keys via the connectors runtime — they identify the app, not
// the user. Only the per-user OAuth tokens are stored here.
// =============================================================================

export type BrokerProvider = "etrade" | "robinhood";

export interface BrokerConnection {
  data: Record<string, any>;
  connectedAt: string | null;
}

// Resolve the current user's ctx (or null → caller returns 401).
export async function getBrokerCtx(): Promise<{ supabase: SupabaseClient; userId: string } | null> {
  const ctx = await getUserClient();
  if (!ctx) return null;
  return { supabase: ctx.supabase, userId: ctx.userId };
}

export async function readBrokerConnection(
  ctx: { supabase: SupabaseClient },
  provider: BrokerProvider,
): Promise<BrokerConnection> {
  const { data } = await ctx.supabase
    .from("broker_connections")
    .select("data, connected_at")
    .eq("provider", provider)
    .maybeSingle();
  return { data: (data?.data as Record<string, any>) ?? {}, connectedAt: data?.connected_at ?? null };
}

// Merge a patch into the user's broker data blob (read-modify-write). Pass
// connectedAt to also set/clear the connected_at column.
export async function writeBrokerConnection(
  ctx: { supabase: SupabaseClient; userId: string },
  provider: BrokerProvider,
  patch: Record<string, any>,
  connectedAt?: string | null,
): Promise<void> {
  const current = await readBrokerConnection(ctx, provider);
  const merged = { ...current.data, ...patch };
  const row: Record<string, any> = {
    user_id: ctx.userId,
    provider,
    data: merged,
    updated_at: new Date().toISOString(),
  };
  if (connectedAt !== undefined) row.connected_at = connectedAt;
  await ctx.supabase.from("broker_connections").upsert(row, { onConflict: "user_id,provider" });
}

// Replace the whole data blob (used by disconnect to wipe tokens cleanly).
export async function replaceBrokerConnection(
  ctx: { supabase: SupabaseClient; userId: string },
  provider: BrokerProvider,
  data: Record<string, any>,
  connectedAt: string | null,
): Promise<void> {
  await ctx.supabase.from("broker_connections").upsert(
    { user_id: ctx.userId, provider, data, connected_at: connectedAt, updated_at: new Date().toISOString() },
    { onConflict: "user_id,provider" },
  );
}
