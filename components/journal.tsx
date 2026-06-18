"use client";

import { useState } from "react";
import useSWR from "swr";
import type { JournalEntry } from "@/lib/db";

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export function Journal() {
  const { data: items = [], mutate } = useSWR<JournalEntry[]>("/api/journal", fetchJson, {
    revalidateOnFocus: true,
  });

  const [symbol, setSymbol] = useState("");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [reason, setReason] = useState("");
  const [target, setTarget] = useState("");
  const [stop, setStop] = useState("");
  const [exit, setExit] = useState("");

  async function addEntry() {
    const sym = symbol.trim().toUpperCase();
    if (!sym || !reason.trim()) return;
    await fetch("/api/journal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol: sym, side, entryReason: reason.trim(),
        targetPrice: Number(target) > 0 ? Number(target) : undefined,
        stopLoss: Number(stop) > 0 ? Number(stop) : undefined,
        exitCriteria: exit.trim() || undefined,
      }),
    });
    setSymbol(""); setReason(""); setTarget(""); setStop(""); setExit("");
    mutate();
  }

  async function toggleStatus(e: JournalEntry) {
    await fetch("/api/journal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: e.id, status: e.status === "open" ? "closed" : "open" }),
    });
    mutate();
  }

  async function updateResult(id: string, field: "result1w" | "result1m", value: string) {
    await fetch("/api/journal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, [field]: value }),
    });
    mutate();
  }

  async function removeEntry(id: string) {
    await fetch(`/api/journal?id=${id}`, { method: "DELETE" });
    mutate();
  }

  const input = "rounded-md border border-white/10 bg-black/25 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-brand-500 focus:outline-none";

  return (
    <div className="space-y-4">
      {/* Add form */}
      <div className="rounded-xl glass p-4 space-y-2">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="Ticker" className={input} />
          <select value={side} onChange={(e) => setSide(e.target.value as "buy" | "sell")} className={input}>
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
          </select>
          <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Target $" inputMode="decimal" className={input} />
          <input value={stop} onChange={(e) => setStop(e.target.value)} placeholder="Stop-loss $" inputMode="decimal" className={input} />
        </div>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why did you enter?" rows={2} className={`${input} w-full`} />
        <input value={exit} onChange={(e) => setExit(e.target.value)} placeholder="What would make you exit?" className={`${input} w-full`} />
        <button onClick={addEntry} className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-500">
          Log trade
        </button>
      </div>

      {items.length === 0 && (
        <div className="rounded-lg border border-white/5 bg-black/20 p-6 text-center text-sm text-ink-faint">
          No trades logged yet. Logging your reasoning, target, and exit plan is how you improve over time.
        </div>
      )}

      {[...items].reverse().map((e) => (
        <div key={e.id} className="rounded-xl glass p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-ink">{e.symbol}</span>
              <span className={`rounded-md border px-2 py-0.5 text-xs ${e.side === "buy" ? "border-emerald-500/40 text-emerald-300" : "border-rose-500/40 text-rose-300"}`}>
                {e.side === "buy" ? "Bought" : "Sold"}
              </span>
              <span className="text-xs text-ink-faint">{new Date(e.createdAt).toLocaleDateString()}</span>
              <span className={`rounded-full border px-2 py-0.5 text-[11px] ${e.status === "open" ? "border-brand-500/40 text-brand-300" : "border-hairline-strong text-ink-dim"}`}>
                {e.status}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => toggleStatus(e)} className="text-xs text-ink-dim hover:text-ink">
                {e.status === "open" ? "Mark closed" : "Reopen"}
              </button>
              <button onClick={() => removeEntry(e.id)} className="text-xs text-ink-faint hover:text-rose-300">Remove</button>
            </div>
          </div>

          <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <Field label="Why I entered" value={e.entryReason} />
            <Field label="Exit plan" value={e.exitCriteria ?? "—"} />
            <Field label="Target" value={e.targetPrice != null ? `$${e.targetPrice}` : "—"} />
            <Field label="Stop-loss" value={e.stopLoss != null ? `$${e.stopLoss}` : "—"} />
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              defaultValue={e.result1w ?? ""}
              onBlur={(ev) => updateResult(e.id, "result1w", ev.target.value)}
              placeholder="Result after 1 week…"
              className={input}
            />
            <input
              defaultValue={e.result1m ?? ""}
              onBlur={(ev) => updateResult(e.id, "result1m", ev.target.value)}
              placeholder="Result after 1 month…"
              className={input}
            />
          </div>
        </div>
      ))}

      <p className="text-[11px] text-ink-faint">
        Saved to <code>data/db.json</code> — persists across restarts. Research and educational analysis, not financial advice.
      </p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-white/5 py-1">
      <span className="shrink-0 text-ink-faint">{label}</span>
      <span className="text-right text-ink-dim">{value}</span>
    </div>
  );
}
