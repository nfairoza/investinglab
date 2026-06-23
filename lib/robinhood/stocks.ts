import crypto from "crypto";

// =============================================================================
// Robinhood UNOFFICIAL stocks/equity access (reverse-engineered private API).
//
// ⚠️  WARNING: This uses Robinhood's internal endpoints with your username +
// password + MFA. It VIOLATES Robinhood's Terms of Service and Robinhood may
// terminate your account without warning. The user explicitly accepted this
// risk. There is NO official Robinhood stocks API.
//
// This module is STATELESS: each function takes the caller's current RH state
// (from the user's broker_connections row) and returns the updated state to
// persist. This keeps per-user tokens isolated — no shared module-level store.
// =============================================================================

const BASE = "https://api.robinhood.com";
const CLIENT_ID = "c82SH0WZOsabOXGP2sxqcj34FxkvfnWRZBKlBjFS"; // RH's public web client id

export interface RhStockState {
  deviceToken: string;
  accessToken: string | null;
  refreshToken: string | null;
  connectedAt: string | null;
  // Transient login state — persisted so it survives between requests. Cleared on
  // success or disconnect.
  pending: { username: string; password: string } | null;
  challengeId: string | null; // set when RH uses the SMS/email "challenge" flow
}

// Produce a fresh, empty RH state (device token persists across reconnects so RH
// keeps trusting the device). randomUUID is allowed at request time in routes.
export function newRhState(): RhStockState {
  return {
    deviceToken: crypto.randomUUID(),
    accessToken: null,
    refreshToken: null,
    connectedAt: null,
    pending: null,
    challengeId: null,
  };
}

// Normalize a partial blob from the DB into a full RhStockState (backfills a
// device token for older/empty rows).
export function normalizeRhState(raw: Partial<RhStockState> | undefined | null): RhStockState {
  const base = newRhState();
  if (!raw) return base;
  return {
    deviceToken: raw.deviceToken || base.deviceToken,
    accessToken: raw.accessToken ?? null,
    refreshToken: raw.refreshToken ?? null,
    connectedAt: raw.connectedAt ?? null,
    pending: raw.pending ?? null,
    challengeId: raw.challengeId ?? null,
  };
}

export function rhStocksConnected(s: RhStockState): boolean {
  return Boolean(s.accessToken);
}

// Build the base password-grant payload. `mfaCode` is added for the authenticator
// flow.
function tokenBody(username: string, password: string, deviceToken: string, mfaCode?: string) {
  const body: any = {
    client_id: CLIENT_ID,
    expires_in: 86400,
    grant_type: "password",
    scope: "internal",
    username,
    password,
    device_token: deviceToken,
    challenge_type: "sms",
  };
  if (mfaCode) body.mfa_code = mfaCode;
  return body;
}

export type RhLoginResult =
  | { ok: true }
  | { mfaRequired: true }
  | { challenge: true }
  | { workflowId: string }
  | { error: string };

// Step 1: attempt login. Returns BOTH the result signal and the next state to
// persist (caller writes it to the user's broker row).
export async function rhLogin(
  s: RhStockState,
  username: string,
  password: string,
): Promise<{ result: RhLoginResult; state: RhStockState }> {
  const res = await fetch(`${BASE}/oauth2/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tokenBody(username, password, s.deviceToken)),
    cache: "no-store",
  });
  const j = await res.json().catch(() => ({}));

  if (j.access_token) {
    const state: RhStockState = { ...s, accessToken: j.access_token, refreshToken: j.refresh_token ?? null, connectedAt: new Date().toISOString(), pending: null, challengeId: null };
    return { result: { ok: true }, state };
  }
  if (j.challenge?.id) {
    const state: RhStockState = { ...s, pending: { username, password }, challengeId: j.challenge.id };
    return { result: { challenge: true }, state };
  }
  if (j.mfa_required) {
    const state: RhStockState = { ...s, pending: { username, password }, challengeId: null };
    return { result: { mfaRequired: true }, state };
  }
  const workflowId = j.verification_workflow?.id;
  if (workflowId) {
    const state: RhStockState = { ...s, pending: { username, password }, challengeId: null };
    return { result: { workflowId }, state };
  }
  return { result: { error: j.detail || j.error_description || "Login failed" }, state: s };
}

// Step 2: submit the verification code. Returns the result + next state.
export async function rhSubmitMfa(
  s: RhStockState,
  code: string,
): Promise<{ result: { ok: boolean; error?: string }; state: RhStockState }> {
  if (!s.pending) return { result: { ok: false, error: "No pending login — start again." }, state: s };
  const { username, password } = s.pending;

  // --- Challenge (SMS/email) flow ---
  if (s.challengeId) {
    const cr = await fetch(`${BASE}/challenge/${s.challengeId}/respond/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response: code }),
      cache: "no-store",
    });
    const cj = await cr.json().catch(() => ({}));
    if (cj.status !== "validated") {
      return { result: { ok: false, error: cj.detail || "Incorrect code — check the text and try again." }, state: s };
    }
    const res = await fetch(`${BASE}/oauth2/token/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-robinhood-challenge-response-id": s.challengeId,
      },
      body: JSON.stringify(tokenBody(username, password, s.deviceToken)),
      cache: "no-store",
    });
    const j = await res.json().catch(() => ({}));
    if (j.access_token) {
      const state: RhStockState = { ...s, accessToken: j.access_token, refreshToken: j.refresh_token ?? null, connectedAt: new Date().toISOString(), pending: null, challengeId: null };
      return { result: { ok: true }, state };
    }
    return { result: { ok: false, error: j.detail || "Login failed after challenge." }, state: s };
  }

  // --- MFA (authenticator) flow ---
  const res = await fetch(`${BASE}/oauth2/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tokenBody(username, password, s.deviceToken, code)),
    cache: "no-store",
  });
  const j = await res.json().catch(() => ({}));
  if (j.access_token) {
    const state: RhStockState = { ...s, accessToken: j.access_token, refreshToken: j.refresh_token ?? null, connectedAt: new Date().toISOString(), pending: null, challengeId: null };
    return { result: { ok: true }, state };
  }
  return { result: { ok: false, error: j.detail || "Invalid code" }, state: s };
}

async function authedGet<T>(accessToken: string, url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
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

// Fetch equity positions for the given access token, resolving each instrument
// URL to its ticker symbol.
export async function getStockPositions(accessToken: string): Promise<RhStockPosition[]> {
  if (!accessToken) throw new Error("Not logged in to Robinhood");
  const data = await authedGet<any>(accessToken, `${BASE}/positions/?nonzero=true`);
  const results: any[] = data?.results ?? [];
  const out: RhStockPosition[] = [];
  for (const p of results) {
    const qty = Number(p.quantity ?? 0);
    if (!qty) continue;
    let symbol = "";
    try {
      const inst = await authedGet<any>(accessToken, p.instrument);
      symbol = String(inst.symbol ?? "").toUpperCase();
    } catch { /* skip */ }
    if (!symbol) continue;
    out.push({ symbol, quantity: qty, avgCost: Number(p.average_buy_price ?? 0) });
  }
  return out;
}
