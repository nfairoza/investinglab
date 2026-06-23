import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only Plaid client. Credentials come from env (set in Vercel):
//   PLAID_CLIENT_ID         — identifies the app (same across envs).
//   PLAID_ENV               — "sandbox" | "production" (default production).
//   PLAID_SANDBOX_SECRET    — secret used ONLY when PLAID_ENV=sandbox.
//   PLAID_SECRET            — secret used when PLAID_ENV=production.
// Sandbox and production secrets are DIFFERENT and must never be mixed.
// Never import this in client components — it carries the secret.

export type PlaidEnv = "sandbox" | "production";

export function plaidEnv(): PlaidEnv {
  return (process.env.PLAID_ENV ?? "production").toLowerCase() === "sandbox" ? "sandbox" : "production";
}

// Pick the secret that matches the active environment. Sandbox uses
// PLAID_SANDBOX_SECRET; production uses PLAID_SECRET. No cross-mixing.
function plaidSecret(): string | undefined {
  return plaidEnv() === "sandbox" ? process.env.PLAID_SANDBOX_SECRET : process.env.PLAID_SECRET;
}

export function plaidConfigured(): boolean {
  return Boolean(process.env.PLAID_CLIENT_ID && plaidSecret());
}

let _client: PlaidApi | null = null;
let _clientEnv: PlaidEnv | null = null;

export function getPlaid(): PlaidApi {
  const env = plaidEnv();
  // Rebuild if the env changed (e.g. during local toggling).
  if (_client && _clientEnv === env) return _client;
  const configuration = new Configuration({
    basePath: PlaidEnvironments[env],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
        "PLAID-SECRET": plaidSecret(),
      },
    },
  });
  _client = new PlaidApi(configuration);
  _clientEnv = env;
  return _client;
}

// Max Plaid Items (connections) allowed app-wide. Configurable so it can be
// raised when the Plaid plan is upgraded. Trial caps at 10 Items EVER created.
export function plaidItemCap(): number {
  const n = Number(process.env.PLAID_ITEM_CAP);
  return Number.isFinite(n) && n > 0 ? n : 10;
}

// Service-role Supabase client for app-wide reads/writes that bypass RLS
// (the Item-cap counter must see ALL users' items, not just the caller's).
function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false } });
}

// App-wide count of Plaid Items EVER created (monotonic — disconnect does NOT
// decrement it, because the Plaid Trial cap counts items ever created).
export async function plaidItemsEverCreated(): Promise<number> {
  const svc = serviceClient();
  if (!svc) return 0;
  const { count } = await svc
    .from("plaid_item_audit")
    .select("id", { count: "exact", head: true });
  return count ?? 0;
}

// True when a NEW connection would exceed the app-wide cap.
export async function plaidCapReached(): Promise<boolean> {
  return (await plaidItemsEverCreated()) >= plaidItemCap();
}

// Record one Item creation in the append-only audit (never deleted).
export async function recordPlaidItemCreated(userId: string, itemId: string): Promise<void> {
  const svc = serviceClient();
  if (!svc) return;
  await svc.from("plaid_item_audit").insert({ user_id: userId, item_id: itemId, plaid_env: plaidEnv() });
}

export const PLAID_COUNTRY_CODES = ["US"] as const;
