// =============================================================================
// Persistent file-based database using lowdb (JSON file on disk).
// Stored at data/db.json — gitignored so your data never goes to GitHub.
// Works on your laptop, on EC2, anywhere — no external service needed.
// =============================================================================

import { join } from "path";
import { LowSync } from "lowdb";
import { JSONFileSync } from "lowdb/node";

// ---- Types ------------------------------------------------------------------

export interface Holding {
  id: string;
  symbol: string;
  shares: number;
  avgCost: number;
  note?: string;
  source?: string; // "manual" | "etrade"
  createdAt: string;
  updatedAt: string;
}

export interface WatchItem {
  id: string;
  symbol: string;
  idealBuy?: number;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface JournalEntry {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  entryReason: string;
  targetPrice?: number;
  stopLoss?: number;
  exitCriteria?: string;
  status: "open" | "closed";
  result1w?: string;
  result1m?: string;
  createdAt: string;
  updatedAt: string;
}

interface Schema {
  holdings: Holding[];
  watchlist: WatchItem[];
  journal: JournalEntry[];
}

// ---- Singleton --------------------------------------------------------------

const DEFAULT: Schema = { holdings: [], watchlist: [], journal: [] };

const dbPath = join(process.cwd(), "data", "db.json");
const adapter = new JSONFileSync<Schema>(dbPath);
const db = new LowSync<Schema>(adapter, DEFAULT);

db.read();

export function getDb(): LowSync<Schema> {
  db.read(); // refresh from disk on every call
  return db;
}

// Serialize read-modify-write operations so overlapping requests can't clobber
// each other's writes (last-writer-wins on the whole JSON file). Single-user
// app, but a sync POST can overlap a manual add — this makes that safe.
let writeChain: Promise<unknown> = Promise.resolve();

export function withDbWrite<T>(fn: (db: LowSync<Schema>) => T): Promise<T> {
  const run = writeChain.then(() => {
    db.read();
    const result = fn(db);
    db.write();
    return result;
  });
  // keep the chain alive regardless of individual failures
  writeChain = run.catch(() => undefined);
  return run;
}

export function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function now(): string {
  return new Date().toISOString();
}
