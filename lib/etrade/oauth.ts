import crypto from "crypto";

// Pure OAuth 1.0a signing for E*TRADE (HMAC-SHA1, header-based).
// No npm package needed — uses Node's built-in crypto module.
// Reference: https://oauth.net/core/1.0a/

function pct(s: string): string {
  return encodeURIComponent(s)
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}

function nonce(): string {
  return crypto.randomBytes(16).toString("hex");
}

function timestamp(): string {
  return Math.floor(Date.now() / 1000).toString();
}

function hmacSha1(key: string, data: string): string {
  return crypto.createHmac("sha1", key).update(data).digest("base64");
}

export interface OAuthParams {
  consumerKey: string;
  consumerSecret: string;
  token?: string;
  tokenSecret?: string;
  verifier?: string;
  callbackUrl?: string;
}

/**
 * Build an OAuth 1.0a Authorization header for a GET request.
 * Extra query params that are part of the URL should be passed in `extraParams`
 * so they're included in the signature base string.
 */
export function buildAuthHeader(
  method: "GET" | "POST",
  url: string,
  oauth: OAuthParams,
  extraParams: Record<string, string> = {},
): string {
  const ts = timestamp();
  const nc = nonce();

  const oauthFields: Record<string, string> = {
    oauth_consumer_key: oauth.consumerKey,
    oauth_nonce: nc,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: ts,
    oauth_version: "1.0",
  };
  if (oauth.token) oauthFields.oauth_token = oauth.token;
  if (oauth.verifier) oauthFields.oauth_verifier = oauth.verifier;
  if (oauth.callbackUrl) oauthFields.oauth_callback = oauth.callbackUrl;

  // Signature base string: all oauth + extra params, sorted
  const allParams: Record<string, string> = { ...oauthFields, ...extraParams };
  const sortedParams = Object.keys(allParams)
    .sort()
    .map((k) => `${pct(k)}=${pct(allParams[k])}`)
    .join("&");

  const baseString = [method.toUpperCase(), pct(url), pct(sortedParams)].join("&");
  const signingKey = `${pct(oauth.consumerSecret)}&${pct(oauth.tokenSecret ?? "")}`;
  const signature = hmacSha1(signingKey, baseString);

  oauthFields.oauth_signature = signature;

  const headerValue =
    "OAuth " +
    Object.keys(oauthFields)
      .map((k) => `${pct(k)}="${pct(oauthFields[k])}"`)
      .join(", ");

  return headerValue;
}

/**
 * Parse an OAuth response body like "oauth_token=abc&oauth_token_secret=xyz"
 */
export function parseOAuthResponse(body: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(body));
}
