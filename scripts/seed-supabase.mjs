// =============================================================================
// One-time seed: copy your existing lowdb (data/db.json) into Supabase under
// YOUR user account. Uses the service-role key to bypass RLS (admin task).
//
// SECURITY: the service-role key is all-powerful. Pass it via env at runtime,
// NEVER commit it. This script reads it from SUPABASE_SECRET_KEY.
//
// USAGE (from the project root, with the dev server able to stop):
//   1. Get your user id: Supabase → Authentication → Users → click your user →
//      copy the UUID (the "ID" / "User UID").
//   2. Run:
//      SUPABASE_SECRET_KEY=<service_role_key> SEED_USER_ID=<your-uuid> \
//        node scripts/seed-supabase.mjs
//
//   (PowerShell:
//      $env:SUPABASE_SECRET_KEY="..."; $env:SEED_USER_ID="..."; node scripts/seed-supabase.mjs )
//
// Re-running is safe-ish: it deletes your existing rows in each table first, then
// inserts from db.json, so you won't get duplicates.
// =============================================================================

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://nlwdtvtqyfbghsflwpyg.supabase.co";
const SECRET = process.env.SUPABASE_SECRET_KEY;
const USER_ID = process.env.SEED_USER_ID;

if (!SECRET) { console.error("Missing SUPABASE_SECRET_KEY env var."); process.exit(1); }
if (!USER_ID) { console.error("Missing SEED_USER_ID env var (your Supabase user UUID)."); process.exit(1); }

const dbPath = join(process.cwd(), "data", "db.json");
if (!existsSync(dbPath)) { console.error("data/db.json not found at " + dbPath); process.exit(1); }
const db = JSON.parse(readFileSync(dbPath, "utf8"));

const sb = createClient(URL, SECRET, { auth: { persistSession: false } });

const u = USER_ID;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

async function reset(table) {
  const { error } = await sb.from(table).delete().eq("user_id", u);
  if (error) console.warn(`  (reset ${table}: ${error.message})`);
}
async function insert(table, rows) {
  if (!rows.length) { console.log(`  ${table}: nothing to insert`); return; }
  const { error } = await sb.from(table).insert(rows);
  if (error) console.error(`  ${table}: ERROR ${error.message}`);
  else console.log(`  ${table}: inserted ${rows.length}`);
}

async function main() {
  console.log(`Seeding Supabase for user ${u} from db.json…`);

  // Holdings
  await reset("holdings");
  await insert("holdings", (db.holdings ?? []).map((h) => ({
    user_id: u, symbol: String(h.symbol).toUpperCase(), shares: Number(h.shares),
    avg_cost: Number(h.avgCost ?? 0), note: h.note ?? null, source: h.source ?? "manual",
    asset_type: h.assetType ?? "stock", days_gain: num(h.daysGain), days_gain_pct: num(h.daysGainPct),
    total_gain: num(h.totalGain), total_gain_pct: num(h.totalGainPct), market_value: num(h.marketValue),
  })));

  // Watchlist
  await reset("watchlist");
  await insert("watchlist", (db.watchlist ?? []).map((w, i) => ({
    user_id: u, symbol: String(w.symbol).toUpperCase(), ideal_buy: num(w.idealBuy), note: w.note ?? null,
    fair_value: w.fairValue ?? null, bull_case: w.bullCase ?? null, bear_case: w.bearCase ?? null,
    catalyst: w.catalyst ?? null, ai_action: w.aiAction ?? null, analyzed_at: w.analyzedAt ?? null,
    sort_order: i,
  })));

  // Journal
  await reset("journal");
  await insert("journal", (db.journal ?? []).map((j) => ({
    user_id: u, symbol: String(j.symbol).toUpperCase(), side: j.side ?? "buy",
    entry_reason: j.entryReason ?? "", target_price: num(j.targetPrice), stop_loss: num(j.stopLoss),
    exit_criteria: j.exitCriteria ?? null, status: j.status ?? "open",
    result_1w: j.result1w ?? null, result_1m: j.result1m ?? null,
  })));

  // Alerts
  await reset("alerts");
  await insert("alerts", (db.alerts ?? []).map((a) => ({
    user_id: u, symbol: String(a.symbol).toUpperCase(), type: a.type, direction: a.direction ?? null,
    price: num(a.price), move_pct: num(a.movePct), within_days: a.withinDays ?? null,
    score_op: a.scoreOp ?? null, score_value: num(a.scoreValue), note: a.note ?? null,
    enabled: a.enabled ?? true, last_triggered_at: a.lastTriggeredAt ?? null,
    last_value: num(a.lastValue), trigger_count: a.triggerCount ?? 0,
  })));

  // Cash (single row upsert)
  if (db.cash && Number(db.cash.amount) > 0) {
    const { error } = await sb.from("cash").upsert(
      { user_id: u, amount: Number(db.cash.amount), source: db.cash.source ?? "manual", updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
    console.log(error ? `  cash: ERROR ${error.message}` : `  cash: set $${db.cash.amount}`);
  } else {
    console.log("  cash: none");
  }

  console.log("Done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
