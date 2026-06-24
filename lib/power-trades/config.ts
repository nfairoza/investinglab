import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PowerTradeSource } from "./types";

// =============================================================================
// Power Trades — source flags + service client. A flag is honored ONLY for a
// source whose adapter is actually built (`built: true`). Enabling an unbuilt
// source would produce empty/confusing results, so the registry tracks both.
// All keys are server-side only — never NEXT_PUBLIC_.
// =============================================================================

const flag = (name: string, def = false) => {
  const v = process.env[name];
  if (v == null) return def;
  return v === "1" || v.toLowerCase() === "true";
};

export interface SourceDef {
  source: PowerTradeSource;
  label: string;
  built: boolean;       // is there a real adapter + sync this phase?
  enabled: boolean;     // env flag (only meaningful when built)
}

// The registry. Phase 1: only fmp_congress is built + on by default.
export function sourceRegistry(): SourceDef[] {
  return [
    { source: "fmp_congress", label: "Congressional (House + Senate) via FMP", built: true,  enabled: flag("POWER_TRADES_ENABLE_CONGRESS", true) },
    { source: "quiver",       label: "Quiver (politician/insider) — optional", built: false, enabled: flag("POWER_TRADES_ENABLE_QUIVER") },
    { source: "sec_form_4",   label: "SEC Form 4 (EDGAR) — corporate insiders", built: true,  enabled: flag("POWER_TRADES_ENABLE_SEC_FORM4") },
    { source: "executive_oge",label: "Executive / OGE disclosures (partial · curated)", built: true,  enabled: flag("POWER_TRADES_ENABLE_EXECUTIVE") },
    { source: "fec",          label: "FEC (OpenFEC) — Influence Context (not trades)",        built: true,  enabled: flag("POWER_TRADES_ENABLE_FEC") },
    // OpenSecrets discontinued its public API on 2025-04-15. The adapter is kept
    // but permanently disabled (built:false) so it can never be flag-enabled
    // against a dead endpoint. A commercial data agreement would be required to
    // revive it (commercial@opensecrets.org).
    { source: "opensecrets",  label: "OpenSecrets — public API discontinued (2025-04-15)",    built: false, enabled: false },
  ];
}

// True only when a source is both built AND enabled by its flag.
export function isSourceActive(source: PowerTradeSource): boolean {
  const d = sourceRegistry().find((s) => s.source === source);
  return Boolean(d && d.built && d.enabled);
}

// Service-role client (bypasses RLS) for the Power Trades tables, which have no
// policies. Returns null if env isn't configured.
export function powerServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false } });
}

// The FMP key used by the rest of the app (market + congress data).
export function fmpKey(): string {
  return process.env.FMP_API_KEY || process.env.MARKET_DATA_API_KEY || "";
}

// Influence-context keys (server-side only; never NEXT_PUBLIC_).
// FEC: api.data.gov key (also works for Congress.gov). OpenSecrets: free key.
export function fecKey(): string {
  return process.env.FEC_API_KEY || "";
}
export function openSecretsKey(): string {
  return process.env.OPENSECRETS_API_KEY || "";
}
