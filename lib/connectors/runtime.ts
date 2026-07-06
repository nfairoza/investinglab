// Server-side store for connector credentials entered at runtime via the
// Connectors page. Values are held in an in-memory cache for fast SYNC reads
// (getConnectorValue stays synchronous — many callers depend on that) AND
// persisted encrypted to the app_secrets table so they survive serverless cold
// starts (P1.1). Resolution order: in-memory cache → app_secrets (hydrated
// async) → process.env.
//
// Nothing here is ever sent to the browser.

import { serviceClient } from "@/lib/service-client";
import { encryptSecret, decryptSecret, secretsConfigured } from "@/lib/secrets";

const store: Record<string, string> = {};
let hydrated = false;
let hydratedAt = 0;
const HYDRATE_TTL_MS = 60_000; // re-read app_secrets at most once/min per instance

// Load persisted secrets into the in-memory cache. Cheap + idempotent; guarded
// by a short TTL so a serverless instance picks up changes made elsewhere.
export async function hydrateConnectorCache(force = false): Promise<void> {
  if (!secretsConfigured()) return;
  if (!force && hydrated && Date.now() - hydratedAt < HYDRATE_TTL_MS) return;
  const db = serviceClient();
  if (!db) return;
  const { data } = await db.from("app_secrets").select("field, ciphertext, iv");
  for (const row of data ?? []) {
    try { store[(row as any).field] = decryptSecret((row as any).ciphertext, (row as any).iv); } catch { /* skip corrupt */ }
  }
  hydrated = true;
  hydratedAt = Date.now();
}

// Persist connector values (encrypted) AND update the in-memory cache. Falls
// back to memory-only when encryption/DB isn't configured (local dev).
export async function setConnectorValues(values: Record<string, string | null>): Promise<void> {
  const db = secretsConfigured() ? serviceClient() : null;
  for (const [field, value] of Object.entries(values)) {
    const v = value && value.trim() ? value.trim() : null;
    if (v) {
      store[field] = v;
      if (db) {
        const { ciphertext, iv } = encryptSecret(v);
        await db.from("app_secrets").upsert(
          { field, ciphertext, iv, updated_at: new Date().toISOString() },
          { onConflict: "field" },
        );
      }
    } else {
      delete store[field];
      if (db) await db.from("app_secrets").delete().eq("field", field);
    }
  }
}

export function getConnectorValue(field: string): string | null {
  if (store[field]) return store[field];
  const env = process.env[field];
  return env && env.trim() ? env : null;
}

export function runtimeHas(field: string): boolean {
  return Boolean(store[field]);
}
