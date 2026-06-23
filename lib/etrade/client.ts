import { buildAuthHeader, parseOAuthResponse } from "./oauth";
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

// Exported so routes (e.g. the authorize-URL builder) resolve the key the same
// way every call site does: runtime (Connectors UI) first, then env.
export function getConsumerKey(): string {
  return getConnectorValue("ETRADE_CONSUMER_KEY") ?? process.env.ETRADE_CONSUMER_KEY ?? "";
}
function getConsumerSecret(): string {
  return getConnectorValue("ETRADE_CONSUMER_SECRET") ?? process.env.ETRADE_CONSUMER_SECRET ?? "";
}

/**
 * Step 1: Fetch a request token from E*TRADE.
 *
 * E*TRADE only supports the OUT-OF-BAND ("oob") OAuth flow — it rejects real
 * callback URLs with HTTP 400. After authorizing, E*TRADE shows the user a short
 * verification code on its own site, which the user pastes back into the app
 * (see the verify route). So oauth_callback is always "oob".
 */
export async function fetchRequestToken(): Promise<{ token: string; secret: string }> {
  const url = `${apiBase()}/oauth/request_token`;
  const authHeader = buildAuthHeader("GET", url, {
    consumerKey: getConsumerKey(),
    consumerSecret: getConsumerSecret(),
    callbackUrl: "oob",
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
 *
 * OAuth 1.0a requires that query-string params be part of the signature base
 * string (sorted alongside the oauth_* params), and that the base-string URL
 * EXCLUDE the query string. So we split the path here.
 */
export async function etradeGet<T>(path: string, tokens: { token: string; secret: string }): Promise<T> {
  if (!tokens?.token || !tokens?.secret) throw new Error("Not authenticated — connect E*TRADE first");

  const fullUrl = `${apiBase()}/v1${path}`;
  // Split base URL from query params for correct OAuth signing.
  const qIndex = fullUrl.indexOf("?");
  const baseUrl = qIndex === -1 ? fullUrl : fullUrl.slice(0, qIndex);
  const extraParams: Record<string, string> = {};
  if (qIndex !== -1) {
    for (const [k, v] of new URLSearchParams(fullUrl.slice(qIndex + 1))) {
      extraParams[k] = v;
    }
  }

  const authHeader = buildAuthHeader(
    "GET",
    baseUrl,
    {
      consumerKey: getConsumerKey(),
      consumerSecret: getConsumerSecret(),
      token: tokens.token,
      tokenSecret: tokens.secret,
    },
    extraParams,
  );

  const res = await fetch(fullUrl, {
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
