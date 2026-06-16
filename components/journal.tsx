"use client";

import { useState } from "react";
import { useLocalList, newId, type JournalEntry } from "@/lib/local-store";

export function Journal() {
  const { items, ready, add, remove, update } = useLocalList<JournalEntry>("stockpilot.journal");
  const [symbol, setSymbol] = useState("");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [reason, setReason] = useState("");
  const [target, setTarget] = useState("");
  const [stop, setStop] = useState("");
  const [exit, setExit] = useState("");

  function addEntry() {
    const sym = symbol.trim().toUpperCase();
    if (!sym || !reason.trim()) return;
    add({
      id: newId(),
      symbol: sym,
      side,
      entryReason: reason.trim(),
      targetPrice: Number(target) > 0 ? Number(target) : undefined,
      stopLoss: Number(stop) > 0 ? Number(stop) : undefined,
      exitCriteria: exit.trim() || undefined,
      status: "open",
      createdAt: new Date().toISOString(),
    });
    setSymbol(""); setReason(""); setTarget(""); setStop(""); setExit("");
  }

  const input = "rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-brand-500 focus:outline-none";

  return (
    <div className="space-y-4">
      {/* Add form */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-2">
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
        <button onClick={addEntry} className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600">
          Log trade
        </button>
      </div>

      {ready && items.length === 0 && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-6 text-center text-sm text-slate-500">
          No trades logged yet. Logging your reasoning, target, and exit plan is how you get better over time.
        </div>
      )}

      {[...items].reverse().map((e) => (
        <div key={e.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-100">{e.symbol}</span>
              <span className={`rounded-md border px-2 py-0.5 text-xs ${e.side === "buy" ? "border-emerald-500/40 text-emerald-300" : "border-rose-500/40 text-rose-300"}`}>
                {e.side === "buy" ? "Bought" : "Sold"}
              </span>
              <span className="text-xs text-slate-500">{new Date(e.createdAt).toLocaleDateString()}</span>
              <span className={`rounded-full border px-2 py-0.5 text-[11px] ${e.status === "open" ? "border-brand-500/40 text-brand-300" : "border-slate-600 text-slate-400"}`}>
                {e.status}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => update(e.id, { status: e.status === "open" ? "closed" : "open" })} className="text-xs text-slate-400 hover:text-slate-200">
                {e.status === "open" ? "Mark closed" : "Reopen"}
              </button>
              <button onClick={() => remove(e.id)} className="text-xs text-slate-500 hover:text-rose-300">Remove</button>
            </div>
          </div>

          <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <Field label="Why I entered" value={e.entryReason} />
            <Field label="Exit plan" value={e.exitCriteria ?? "—"} />
            <Field label="Target" value={e.targetPrice != null ? `$${e.targetPrice}` : "—"} />
            <Field label="Stop-loss" value={e.stopLoss != null ? `$${e.stopLoss}` : "—"} />
          </div>

          {/* Result tracking */}
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              defaultValue={e.result1w ?? ""}
              onBlur={(ev) => update(e.id, { result1w: ev.target.value })}
              placeholder="Result after 1 week…"
              className={input}
            />
            <input
              defaultValue={e.result1m ?? ""}
              onBlur={(ev) => update(e.id, { result1m: ev.target.value })}
              placeholder="Result after 1 month…"
              className={input}
            />
          </div>
        </div>
      ))}

      <p className="text-[11px] text-slate-600">
        Saved in your browser for now; moves to your account once sign-in is wired. Research and
        educational analysis, not financial advice.
      </p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-slate-800/60 py-1">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="text-right text-slate-300">{value}</span>
    </div>
  );
}
