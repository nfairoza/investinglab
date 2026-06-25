"use client";

import { useState } from "react";
import useSWR from "swr";
import { Plus, X, Check } from "lucide-react";

// "+" → add a single symbol to one or more user-created lists. Mirrors the
// Robinhood "Add to Your Lists" sheet: checkboxes per custom list + create-new.
// Followed lists are NOT shown (they're live references, not item stores).
interface ListRow { id: string; name: string; kind: string; count: number }
const fetchJson = (u: string) => fetch(u).then((r) => r.json());

export function AddToList({ symbol, onClose }: { symbol: string; onClose: () => void }) {
  const { data: lists, mutate } = useSWR<ListRow[]>("/api/watchlists", fetchJson, { revalidateOnFocus: false });
  const targets = (lists ?? []).filter((l) => l.kind !== "followed");
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  async function addTo(listId: string) {
    setBusy(listId);
    try {
      await fetch(`/api/watchlists/${listId}/items`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol }) });
      setDone((d) => new Set(d).add(listId));
    } finally { setBusy(null); }
  }

  async function createAndAdd() {
    const name = newName.trim();
    if (!name) return;
    setBusy("new");
    try {
      const r = await fetch("/api/watchlists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      const created = await r.json();
      if (created?.id) {
        await fetch(`/api/watchlists/${created.id}/items`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol }) });
        setDone((d) => new Set(d).add(created.id));
      }
      setNewName(""); setCreating(false); await mutate();
    } finally { setBusy(null); }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl glass p-5" style={{ background: "var(--surface-solid)" }}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">Add {symbol} to a list</h3>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-ink-faint hover:text-ink"><X size={16} /></button>
        </div>

        <div className="mt-3 max-h-72 space-y-1 overflow-y-auto">
          {creating ? (
            <div className="flex items-center gap-2">
              <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createAndAdd()}
                placeholder="New list name" className="flex-1 rounded-md border border-hairline bg-surface px-2.5 py-1.5 text-sm text-ink focus:border-brand-500 focus:outline-none" />
              <button onClick={createAndAdd} disabled={busy === "new"} className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-50">Add</button>
            </div>
          ) : (
            <button onClick={() => setCreating(true)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-brand-300 hover:bg-surface">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-500/15"><Plus size={15} /></span> Create new list
            </button>
          )}

          {targets.map((l) => {
            const added = done.has(l.id);
            return (
              <button key={l.id} onClick={() => !added && addTo(l.id)} disabled={busy === l.id || added}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-surface disabled:opacity-70">
                <span className={`flex h-5 w-5 items-center justify-center rounded border ${added ? "border-emerald-500 bg-emerald-500/20" : "border-hairline"}`}>
                  {added && <Check size={13} className="text-emerald-400" />}
                </span>
                <span className="flex-1 text-ink">{l.name}</span>
                <span className="text-[11px] text-ink-faint">{l.count} item{l.count !== 1 ? "s" : ""}</span>
              </button>
            );
          })}
          {targets.length === 0 && !creating && <p className="px-2 py-3 text-xs text-ink-faint">No lists yet — create one above.</p>}
        </div>

        <button onClick={onClose} className="mt-3 w-full rounded-lg border border-hairline py-2 text-sm text-ink-dim hover:text-ink">Done</button>
      </div>
    </div>
  );
}
