import { buildAuthHeader, parseOAuthResponse } from "./oauth";
import { getAccessTokens } from "./token-store";
import { getConnectorValue } from "@/lib/connectors/runtime";

// Sandbox uses apisb.etrade.com; production uses api.etrade.com.
// Set ETRADE_SANDBOX=true in .env.local to use sandbox (individual developer keys).
// When you receive production keys, remove that variable (or set it to false).
function isSandbox(): boolean {
  const v = getConnectorValue("ETRADE_SANDBOX") ?? process.env.ETRADE_SANDBOX;
  return v === "true" || v === "1";
}

const PROD_BASE = "https://api.etrade.com";
const SB_BASE = "https://apisb.etrade.com";
const AUTH_URL = "https://us.etrade.com/e/t/etws/authorize";

function apiBase(): string {
  return isSandbox() ? SB_BASE : PROD_BASE;
}

export { AUTH_URL };

function getConsumerKey(): string {
  return getConnectorValue("ETRADE_CONSUMER_KEY") ?? process.env.ETRADE_CONSUMER_KEY ?? "";
}
function getConsumerSecret(): string {
  return getConnectorValue("ETRADE_CONSUMER_SECRET") ?? process.env.ETRADE_CONSUMER_SECRET ?? "";
}

/**
 * Step 1: Fetch a request token from E*TRADE.
 * Returns { token, secret }.
 */
export async function fetchRequestToken(
  callbackUrl: string,
): Promise<{ token: string; secret: string }> {
  const url = `${apiBase()}/oauth/request_token`;
  const authHeader = buildAuthHeader("GET", url, {
    consumerKey: getConsumerKey(),
    consumerSecret: getConsumerSecret(),
    callbackUrl,
  });

  const res = await fetch(url, {
    headers: { Authorization: authHeader },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Request token failed: HTTP ${res.status} — ${body.slice(0, 200)}`);
  }

  const parsed = parseOAuthResponse(await res.text());
  if (!parsed.oauth_token || !parsed.oauth_token_secret) {
    throw new Error("Request token response missing oauth_token or oauth_token_secret");
  }
  return { token: parsed.oauth_token, secret: parsed.oauth_token_secret };
}

/**
 * Step 4: Exchange request token + verifier for an access token.
 */
export async function fetchAccessToken(
  requestToken: string,
  requestTokenSecret: string,
  verifier: string,
): Promise<{ token: string; secret: string }> {
  const url = `${apiBase()}/oauth/access_token`;
  const authHeader = buildAuthHeader("GET", url, {
    consumerKey: getConsumerKey(),
    consumerSecret: getConsumerSecret(),
    token: requestToken,
    tokenSecret: requestTokenSecret,
    verifier,
  });

  const res = await fetch(url, {
    headers: { Authorization: authHeader },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Access token failed: HTTP ${res.status} — ${body.slice(0, 200)}`);
  }

  const parsed = parseOAuthResponse(await res.text());
  if (!parsed.oauth_token || !parsed.oauth_token_secret) {
    throw new Error("Access token response missing oauth_token or oauth_token_secret");
  }
  return { token: parsed.oauth_token, secret: parsed.oauth_token_secret };
}

/**
 * Authenticated GET against the E*TRADE v1 API.
 * Throws on HTTP error (including 401 = token expired).
 */
export async function etradeGet<T>(path: string): Promise<T> {
  const tokens = getAccessTokens();
  if (!tokens) throw new Error("Not authenticated — connect E*TRADE first");

  const url = `${apiBase()}/v1${path}`;
  const authHeader = buildAuthHeader("GET", url, {
    consumerKey: getConsumerKey(),
    consumerSecret: getConsumerSecret(),
    token: tokens.token,
    tokenSecret: tokens.secret,
  });

  const res = await fetch(url, {
    headers: { Authorization: authHeader },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`E*TRADE API error: HTTP ${res.status} — ${body.slice(0, 300)}`);
    (err as any).status = res.status;
    throw err;
  }

  return res.json() as Promise<T>;
}

export function hasConsumerKey(): boolean {
  return Boolean(getConsumerKey() && getConsumerSecret());
}
