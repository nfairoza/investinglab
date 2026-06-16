"use client";

import { useEffect, useState } from "react";

// Local-first persistence for holdings + watchlist. Saved in the browser
// (localStorage) so you can use the app immediately, before auth + Supabase are
// wired. In Phase 4 this is replaced by per-user rows in the `holdings` /
// `watchlist` tables — the shapes below match those columns.

export interface Holding {
  id: string;
  symbol: string;
  shares: number;
  avgCost: number;
  note?: string;
}

export interface WatchItem {
  id: string;
  symbol: string;
  idealBuy?: number;
  note?: string;
}

export interface JournalEntry {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  entryReason: string; // why you entered
  targetPrice?: number;
  stopLoss?: number;
  exitCriteria?: string; // what would make you exit
  status: "open" | "closed";
  result1w?: string; // result after 1 week
  result1m?: string; // result after 1 month
  createdAt: string; // ISO
}

function load<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

// Generic localStorage-backed list with add/remove/update.
export function useLocalList<T extends { id: string }>(key: string) {
  const [items, setItems] = useState<T[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setItems(load<T>(key));
    setReady(true);
  }, [key]);

  useEffect(() => {
    if (ready && typeof window !== "undefined") {
      window.localStorage.setItem(key, JSON.stringify(items));
    }
  }, [key, items, ready]);

  const add = (item: T) => setItems((xs) => [...xs, item]);
  const remove = (id: string) => setItems((xs) => xs.filter((x) => x.id !== id));
  const update = (id: string, patch: Partial<T>) =>
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  return { items, ready, add, remove, update };
}

export const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
