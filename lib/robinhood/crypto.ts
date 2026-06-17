import crypto from "crypto";
import { getConnectorValue } from "@/lib/connectors/runtime";

// =============================================================================
// Robinhood OFFICIAL Crypto Trading API (read-only use here).
// Auth = Ed25519 request signing. Create credentials at:
//   Robinhood (web classic) → Account → Crypto → API credentials.
// You get an API key + a base64 private key (seed). We sign each request:
//   message = `${apiKey}${timestamp}${path}${method}${body}`
//   x-signature = base64( Ed25519_sign(message) )
// Docs: https://docs.robinhood.com/crypto/trading/
// This is Robinhood-supported and uses NO password — safe and legitimate.
// =============================================================================

const BASE = "https://trading.robinhood.com";

function apiKey(): string {
  return getConnectorValue("ROBINHOOD_CRYPTO_API_KEY") ?? process.env.ROBINHOOD_CRYPTO_API_KEY ?? "";
}
function privateKeyB64(): string {
  return getConnectorValue("ROBINHOOD_CRYPTO_PRIVATE_KEY") ?? process.env.ROBINHOOD_CRYPTO_PRIVATE_KEY ?? "";
}

export function hasCryptoKeys(): boolean {
  return Boolean(apiKey() && privateKeyB64());
}

// Build an Ed25519 private key object from Robinhood's base64 seed.
// RH gives either a 32-byte seed or a 64-byte (seed+pub) base64 string.
function loadPrivateKey(): crypto.KeyObject {
  const raw = Buffer.from(privateKeyB64(), "base64");
  const seed = raw.length >= 32 ? raw.subarray(0, 32) : raw;
  // Wrap the 32-byte seed in a minimal PKCS#8 DER envelope for Ed25519.
  const pkcs8 = Buffer.concat([
    Buffer.from("302e020100300506032b657004220420", "hex"),
    seed,
  ]);
  return crypto.createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" });
}

async function signedGet<T>(path: string): Promise<T> {
  if (!hasCryptoKeys()) throw new Error("Robinhood crypto keys not set");
  const ts = Math.floor(Date.now() / 1000).toString();
  const method = "GET";
  const body = ""; // GET has no body
  const message = `${apiKey()}${ts}${path}${method}${body}`;
  const signature = crypto.sign(null, Buffer.from(message), loadPrivateKey()).toString("base64");

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "x-api-key": apiKey(),
      "x-signature": signature,
      "x-timestamp": ts,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const err = new Error(`Robinhood crypto HTTP ${res.status}: ${detail.slice(0, 200)}`);
    (err as any).status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

export interface RhCryptoHolding {
  symbol: string;       // e.g. "BTC"
  quantity: number;
  costBasis: number | null;
}

// Fetch crypto holdings (paginated). Returns positions with quantity + cost.
export async function getCryptoHoldings(): Promise<RhCryptoHolding[]> {
  const out: RhCryptoHolding[] = [];
  let path = "/api/v1/crypto/trading/holdings/";
  for (let guard = 0; guard < 10; guard++) {
    const data = await signedGet<any>(path);
    const results: any[] = data?.results ?? [];
    for (const r of results) {
      const qty = Number(r.total_quantity ?? r.quantity ?? 0);
      if (!qty) continue;
      out.push({
        symbol: String(r.asset_code ?? r.currency?.code ?? "").toUpperCase(),
        quantity: qty,
        costBasis: r.cost_basis != null ? Number(r.cost_basis) : null,
      });
    }
    const next = data?.next as string | null;
    if (!next) break;
    // next is a full URL; reduce to path
    path = next.startsWith("http") ? new URL(next).pathname + new URL(next).search : next;
  }
  return out;
}

// Best-effort current price for a crypto symbol pair (e.g. BTC-USD).
export async function getCryptoPrice(symbol: string): Promise<number | null> {
  try {
    const data = await signedGet<any>(`/api/v1/crypto/marketdata/best_bid_ask/?symbol=${symbol}-USD`);
    const r = data?.results?.[0];
    const bid = Number(r?.bid_inclusive_of_buy_spread ?? r?.price ?? 0);
    return bid || null;
  } catch {
    return null;
  }
}
