"use client";

import { useState } from "react";
import useSWR from "swr";
import { Target, Check, X, Pencil, Plus } from "lucide-react";
import { fetchJson } from "@/lib/fetch-json";
import { useEntitlement } from "@/components/use-entitlement";

// MV2 — category targets on the Spending page. Progress rings + pace dots for
// targeted categories, and an opt-in "Set targets" suggestion flow (accept/edit/
// skip per category). All numbers deterministic from /api/money/targets.
interface TargetRow {
  category: string; target: number; spent: number; ratio: number;
  pace: "ahead" | "on" | "behind"; projected: number; expectedByNow: number;
}
interface Suggestion { category: string; p50: number; suggested: number; monthsUsed: number }

const money = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const PACE_LABEL = { ahead: "over pace", on: "on pace", behind: "under pace" } as const;
const PACE_CLS = { ahead: "text-rose-300", on: "text-ink-dim", behind: "text-emerald-300" } as const;

export function CategoryTargets() {
  const entitled = useEntitlement("money_targets");
  const { data, mutate } = useSWR<{ targets: TargetRow[]; suggestions: Suggestion[] }>("/api/money/targets", fetchJson, { revalidateOnFocus: false });
  const [showSuggest, setShowSuggest] = useState(false);

  if (!entitled) return null;
  const targets = data?.targets ?? [];
  const suggestions = data?.suggestions ?? [];

  async function save(category: string, monthlyTarget: number, suggestedFrom?: number) {
    await fetch("/api/money/targets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ category, monthlyTarget, suggestedFrom }) });
    mutate();
  }
  async function remove(category: string) {
    await fetch(`/api/money/targets?category=${encodeURIComponent(category)}`, { method: "DELETE" });
    mutate();
  }

  return (
    <div className="rounded-2xl border border-hairline bg-surface p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink"><Target size={16} className="text-brand-400" /> Category targets</div>
        {suggestions.length > 0 && (
          <button onClick={() => setShowSuggest((v) => !v)} className="inline-flex items-center gap-1 rounded-md border border-hairline px-2.5 py-1 text-xs text-ink-dim hover:bg-surface-raised hover:text-ink">
            <Plus size={12} /> Set targets
          </button>
        )}
      </div>

      {targets.length === 0 && !showSuggest && (
        <p className="mt-2 text-xs text-ink-faint">No targets yet. Targets are suggested from your own typical spending — set one to see pace and month-end results.</p>
      )}

      {/* Progress rings */}
      {targets.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {targets.map((t) => <RingCard key={t.category} t={t} onEdit={(v) => save(t.category, v)} onRemove={() => remove(t.category)} />)}
        </div>
      )}

      {/* Suggestion flow */}
      {showSuggest && suggestions.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-hairline pt-3">
          <p className="text-xs text-ink-faint">Suggested from your median of the last 3 months. Accept, edit, or skip — targets are yours, never imposed.</p>
          {suggestions.map((s) => <SuggestRow key={s.category} s={s} onAccept={(v) => save(s.category, v, s.p50)} />)}
        </div>
      )}
    </div>
  );
}

function RingCard({ t, onEdit, onRemove }: { t: TargetRow; onEdit: (v: number) => void; onRemove: () => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  const pct = Math.min(100, Math.round(t.ratio * 100));
  const over = t.ratio > 1;
  const color = over ? "#FB7185" : t.pace === "ahead" ? "#FBBF24" : "#16D27E";
  const r = 26, circ = 2 * Math.PI * r;

  return (
    <div className="rounded-xl border border-hairline p-3 text-center">
      <div className="relative mx-auto h-16 w-16">
        <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
          <circle cx="32" cy="32" r={r} fill="none" stroke="var(--hairline)" strokeWidth="6" />
          <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={circ * (1 - Math.min(1, t.ratio))} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-ink">{pct}%</div>
      </div>
      <div className="mt-1 truncate text-xs font-medium text-ink" title={t.category}>{t.category}</div>
      <div className="text-[11px] text-ink-faint">{money(t.spent)} / {money(t.target)}</div>
      <div className={`text-[10px] ${PACE_CLS[t.pace]}`}>● {PACE_LABEL[t.pace]}</div>
      {editing ? (
        <div className="mt-1 flex items-center justify-center gap-1">
          <input autoFocus type="number" inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} placeholder={String(t.target)}
            className="w-16 rounded border border-hairline bg-surface px-1 py-0.5 text-[11px] text-ink" />
          <button onClick={() => { const v = Number(val); if (v > 0) onEdit(v); setEditing(false); }} className="text-emerald-400"><Check size={13} /></button>
          <button onClick={() => setEditing(false)} className="text-ink-faint"><X size={13} /></button>
        </div>
      ) : (
        <div className="mt-1 flex items-center justify-center gap-2">
          <button onClick={() => { setVal(String(t.target)); setEditing(true); }} className="text-ink-faint hover:text-ink"><Pencil size={11} /></button>
          <button onClick={onRemove} className="text-ink-faint hover:text-rose-300"><X size={12} /></button>
        </div>
      )}
    </div>
  );
}

function SuggestRow({ s, onAccept }: { s: Suggestion; onAccept: (v: number) => void }) {
  const [val, setVal] = useState(String(s.suggested));
  const [skipped, setSkipped] = useState(false);
  if (skipped) return null;
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-hairline px-3 py-2 text-xs">
      <div className="text-ink-dim">
        <span className="text-ink">{s.category}</span> typically {money(s.p50)} — set{" "}
        <input type="number" inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} className="w-16 rounded border border-hairline bg-surface px-1 py-0.5 text-ink" />?
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => onAccept(Number(val) || s.suggested)} className="rounded-md bg-brand-500/15 px-2 py-1 text-brand-300 hover:bg-brand-500/25">Set</button>
        <button onClick={() => setSkipped(true)} className="text-ink-faint hover:text-ink">Skip</button>
      </div>
    </div>
  );
}
