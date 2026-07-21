import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import { type SupabaseClient } from "@supabase/supabase-js";
import { serviceClient } from "@/lib/service-client";
import { encryptSecret, decryptSecret, secretsConfigured } from "@/lib/secrets";

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

// The public URL Plaid POSTs item webhooks to (SYNC_UPDATES_AVAILABLE etc.).
// Prefer an explicit override; else derive from the app URL. Returns undefined
// when we can't build an https URL (Plaid rejects non-https), so callers just
// omit the webhook rather than send a bad one.
export function plaidWebhookUrl(): string | undefined {
  const explicit = process.env.PLAID_WEBHOOK_URL;
  if (explicit && explicit.startsWith("https://")) return explicit;
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (base && base.startsWith("https://")) return `${base.replace(/\/$/, "")}/api/plaid/webhook`;
  return undefined;
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

// (Service-role client for app-wide, RLS-bypassing reads/writes — e.g. the
// Item-cap counter must see ALL users' items — comes from lib/service-client.)

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

// ── Access-token encryption at rest (P1.2) ──────────────────────────────────
// Tokens are stored encrypted (access_token_enc/iv) when SECRETS_ENCRYPTION_KEY
// is set. During/after the backfill some rows may still carry the legacy
// plaintext access_token; resolvePlaidToken handles both transparently.

// SELECT list that pulls the columns needed to resolve a token either way.
export const PLAID_TOKEN_COLUMNS = "access_token, access_token_enc, access_token_iv";
// Fallback list for DBs where migration 0021 (enc columns) hasn't been applied.
const PLAID_TOKEN_COLUMNS_LEGACY = "access_token";

interface PlaidTokenRow { access_token?: string | null; access_token_enc?: string | null; access_token_iv?: string | null }

// Postgres "undefined_column" — the enc columns don't exist yet (migration 0021
// not applied on this DB). We degrade to plaintext-only instead of hard-failing.
function isUndefinedColumn(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42703" || /column .* does not exist/i.test(err.message ?? "");
}

// Columns added by later migrations that may not exist yet on an un-migrated DB.
// On an undefined-column error we strip these from the request and retry, so a
// pending migration degrades to "feature off" rather than breaking the page.
// (0046 item-health: status/last_synced_at/error_code/status_changed_at.)
const OPTIONAL_COLUMNS = ["status", "last_synced_at", "error_code", "status_changed_at"];

function stripCols(list: string, drop: string[]): string {
  return list.split(",").map((c) => c.trim()).filter((c) => c && !drop.includes(c)).join(", ");
}

// Select plaid_items with the given extra columns + the token columns, resilient
// to newer columns (encryption pair OR item-health) not existing yet. Returns
// { rows, error } where a REAL DB error (not a missing-optional-column) is
// surfaced so callers can 500 — never silently treated as "no linked accounts".
export async function selectPlaidItems(
  supabase: { from: (t: string) => any },
  extraCols: string,
): Promise<{ rows: any[] | null; error: { message: string } | null }> {
  const cols = extraCols ? `${extraCols}, ${PLAID_TOKEN_COLUMNS}` : PLAID_TOKEN_COLUMNS;
  const first = await supabase.from("plaid_items").select(cols);
  if (!first.error) return { rows: first.data ?? [], error: null };
  if (isUndefinedColumn(first.error)) {
    // Retry with the enc-token pair dropped to plaintext AND the optional
    // item-health columns removed (either could be the missing column).
    const safeExtra = stripCols(extraCols, OPTIONAL_COLUMNS);
    const legacyCols = safeExtra ? `${safeExtra}, ${PLAID_TOKEN_COLUMNS_LEGACY}` : PLAID_TOKEN_COLUMNS_LEGACY;
    const retry = await supabase.from("plaid_items").select(legacyCols);
    if (!retry.error) return { rows: retry.data ?? [], error: null };
    return { rows: null, error: { message: retry.error.message } };
  }
  return { rows: null, error: { message: first.error.message } };
}

// Decrypt the encrypted token if present; otherwise fall back to plaintext.
export function resolvePlaidToken(row: PlaidTokenRow): string | null {
  if (row.access_token_enc && row.access_token_iv && secretsConfigured()) {
    try { return decryptSecret(row.access_token_enc, row.access_token_iv); } catch { /* fall through */ }
  }
  return row.access_token ?? null;
}

// Build the columns to write for a new/updated token. When encryption is
// configured we write ONLY the encrypted pair and null the plaintext column.
export function plaidTokenWrite(token: string): Record<string, string | null> {
  if (secretsConfigured()) {
    const { ciphertext, iv } = encryptSecret(token);
    return { access_token_enc: ciphertext, access_token_iv: iv, access_token: null };
  }
  return { access_token: token, access_token_enc: null, access_token_iv: null };
}
