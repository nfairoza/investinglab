import { serviceClient } from "@/lib/service-client";
import { billingEnabled as envBillingEnabled } from "./entitlements";

// BILL B0 — billing master switch, stored in app_config (admin-toggleable), not
// only env. Cached ~60s so requirePlan/Locked reads are cheap. While OFF, the
// whole product ships free (no gating, no Locked UI, no countdowns). The env
// var (NEXT_PUBLIC_BILLING_ENABLED/BILLING_ENABLED) still forces ON when set —
// the DB flag is the runtime admin control layered on top.

const KEY = "billing_enabled";
let cache: { value: boolean; at: number } | null = null;
const TTL_MS = 60_000;

export async function isBillingOn(): Promise<boolean> {
  if (envBillingEnabled()) return true; // env force-on wins
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  let value = false;
  try {
    const db = serviceClient();
    if (db) {
      const { data } = await db.from("app_config").select("value").eq("key", KEY).maybeSingle();
      value = data?.value === "1" || data?.value === "true";
    }
  } catch { /* default off on any read error */ }
  cache = { value, at: Date.now() };
  return value;
}

export async function setBillingOn(on: boolean): Promise<void> {
  const db = serviceClient();
  if (!db) throw new Error("no service client");
  await db.from("app_config").upsert({ key: KEY, value: on ? "1" : "0", updated_at: new Date().toISOString() }, { onConflict: "key" });
  cache = { value: on, at: Date.now() };
}

export function clearBillingCache(): void { cache = null; }
