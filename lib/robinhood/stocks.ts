import crypto from "crypto";
import { getDb } from "@/lib/db";

// =============================================================================
// Robinhood UNOFFICIAL stocks/equity access (reverse-engineered private API).
//
// ⚠️  WARNING: This uses Robinhood's internal endpoints with your username +
// password + MFA. It VIOLATES Robinhood's Terms of Service and Robinhood may
// terminate your account without warning. The user explicitly accepted this
// risk. There is NO official Robinhood stocks API.
//
// Auth flow (robin_stocks-style):
//   1. POST /oauth2/token/ with a persistent device_token.
//   2. If MFA required, RH returns a challenge / verification_workflow; the user
//      supplies the code, we resubmit.
//   3. On success we get an access_token; store it (with the device_token) in the
//      DB so it survives restarts. Tokens are local-only, never sent to GitHub.
// =============================================================================

const BASE = "https://api.robinhood.com";
const CLIENT_ID = "c82SH0WZOsabOXGP2sxqcj34FxkvfnWRZBKlBjFS"; // RH's public web client id

interface RhStockState {
  deviceToken: string;
  accessToken: string | null;
  refreshToken: string | null;
  connectedAt: string | null;
}

function state(): RhStockState {
  const db = getDb();
  if (!(db.data as any).robinhood) {
    (db.data as any).robinhood = {
      deviceToken: crypto.randomUUID(),
      accessToken: null,
      refreshToken: null,
      connectedAt: null,
    };
    db.write();
  }
  return (db.data as any).robinhood as RhStockState;
}

function save(patch: Partial<RhStockState>) {
  const db = getDb();
  (db.data as any).robinhood = { ...state(), ...patch };
  db.write();
}

export function rhStocksConnected(): boolean {
  return Boolean(state().accessToken);
}
export function rhStocksConnectedAt(): string | null {
  return state().connectedAt;
}
export function clearRhStocks(): void {
  const db = getDb();
  (db.data as any).robinhood = {
    deviceToken: state().deviceToken, // keep the device token (RH trusts it)
    accessToken: null,
    refreshToken: null,
    connectedAt: null,
  };
  db.write();
}

// Step 1: attempt login. Returns { ok } on success, or { mfaRequired } /
// { workflowId } when a verification code / approval is needed.
export async function rhLogin(username: string, password: string): Promise<
  | { ok: true }
  | { mfaRequired: true }
  | { workflowId: string }
  | { error: string }
> {
  const s = state();
  const payload: any = {
    client_id: CLIENT_ID,
    expires_in: 86400,
    grant_type: "password",
    scope: "internal",
    username,
    password,
    device_token: s.deviceToken,
  };
  const res = await fetch(`${BASE}/oauth2/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const j = await res.json().catch(() => ({}));

  if (j.access_token) {
    save({ accessToken: j.access_token, refreshToken: j.refresh_token ?? null, connectedAt: new Date().toISOString() });
    return { ok: true };
  }
  if (j.mfa_required) {
    // store creds transiently for the mfa step (in-memory module cache)
    pending = { username, password };
    return { mfaRequired: true };
  }
  // Newer RH uses a verification "workflow" (device approval / app prompt)
  const workflowId = j.verification_workflow?.id;
  if (workflowId) {
    pending = { username, password };
    return { workflowId };
  }
  return { error: j.detail || j.error_description || "Login failed" };
}

let pending: { username: string; password: string } | null = null;

// Step 2: submit the MFA / SMS / authenticator code.
export async function rhSubmitMfa(code: string): Promise<{ ok: boolean; error?: string }> {
  if (!pending) return { ok: false, error: "No pending login — start again." };
  const s = state();
  const res = await fetch(`${BASE}/oauth2/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      expires_in: 86400,
      grant_type: "password",
      scope: "internal",
      username: pending.username,
      password: pending.password,
      device_token: s.deviceToken,
      mfa_code: code,
    }),
    cache: "no-store",
  });
  const j = await res.json().catch(() => ({}));
  if (j.access_token) {
    save({ accessToken: j.access_token, refreshToken: j.refresh_token ?? null, connectedAt: new Date().toISOString() });
    pending = null;
    return { ok: true };
  }
  return { ok: false, error: j.detail || "Invalid code" };
}

async function authedGet<T>(url: string): Promise<T> {
  const s = state();
  if (!s.accessToken) throw new Error("Not logged in to Robinhood");
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${s.accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const err = new Error(`Robinhood HTTP ${res.status}`);
    (err as any).status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

export interface RhStockPosition {
  symbol: string;
  quantity: number;
  avgCost: number;
}

// Fetch equity positions, resolving each instrument URL to its ticker symbol.
export async function getStockPositions(): Promise<RhStockPosition[]> {
  const data = await authedGet<any>(`${BASE}/positions/?nonzero=true`);
  const results: any[] = data?.results ?? [];
  const out: RhStockPosition[] = [];
  for (const p of results) {
    const qty = Number(p.quantity ?? 0);
    if (!qty) continue;
    let symbol = "";
    try {
      const inst = await authedGet<any>(p.instrument);
      symbol = String(inst.symbol ?? "").toUpperCase();
    } catch { /* skip */ }
    if (!symbol) continue;
    out.push({ symbol, quantity: qty, avgCost: Number(p.average_buy_price ?? 0) });
  }
  return out;
}
