"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Plus, Star, ExternalLink, Trash2, Pencil } from "lucide-react";
import { WatchlistManager } from "./watchlist-manager";
import { WatchlistRecs } from "./watchlist-recs";

// Multi-list watchlist shell: a list selector across the top, then the selected
// list's content. Default + custom lists use the editable WatchlistManager;
// followed (trending) lists link out to their live detail page.
interface ListRow { id: string; name: string; kind: string; presetKey: string | null; count: number }
const fetchJson = (u: string) => fetch(u).then((r) => r.json());

export function WatchlistPage() {
  const { data: lists, mutate } = useSWR<ListRow[]>("/api/watchlists", fetchJson, { revalidateOnFocus: false });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");

  const all = lists ?? [];
  // Default selection: first list (default sorts first).
  const active = all.find((l) => l.id === activeId) ?? all[0];

  async function createList() {
    const name = newName.trim();
    if (!name) return;
    const r = await fetch("/api/watchlists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    const created = await r.json();
    setNewName(""); setCreating(false);
    await mutate();
    if (created?.id) setActiveId(created.id);
  }

  async function deleteList(id: string) {
    await fetch(`/api/watchlists?id=${id}`, { method: "DELETE" });
    if (activeId === id) setActiveId(null);
    await mutate();
  }

  async function unfollow(presetKey: string) {
    await fetch(`/api/watchlists/follow?presetKey=${presetKey}`, { method: "DELETE" });
    setActiveId(null);
    await mutate();
  }

  async function renameList(id: string, name: string) {
    const n = name.trim();
    if (!n) { setRenaming(null); return; }
    await fetch("/api/watchlists", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, name: n }) });
    setRenaming(null);
    await mutate();
  }

  return (
    <div className="lg:grid lg:grid-cols-[1fr_300px] lg:gap-5">
      {/* Main column: the user's lists are the focus */}
      <div className="space-y-4">
      {/* List selector */}
      <div className="flex flex-wrap items-center gap-2">
        {all.map((l) => {
          const isActive = active?.id === l.id;
          return (
            <button key={l.id} onClick={() => setActiveId(l.id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${isActive ? "border-brand-500 bg-brand-500/10 text-ink" : "border-hairline text-ink-dim hover:text-ink"}`}>
              {l.kind === "followed" && <Star size={12} className="text-brand-400" />}
              {l.name}
              <span className="text-[11px] text-ink-faint">{l.kind === "followed" ? "list" : l.count}</span>
            </button>
          );
        })}
        {creating ? (
          <span className="inline-flex items-center gap-1.5">
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createList()}
              placeholder="List name" className="rounded-full border border-hairline bg-surface px-3 py-1.5 text-sm text-ink focus:border-brand-500 focus:outline-none" />
            <button onClick={createList} className="rounded-full bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500">Create</button>
          </span>
        ) : (
          <button onClick={() => setCreating(true)} className="inline-flex items-center gap-1 rounded-full border border-dashed border-hairline px-3 py-1.5 text-sm text-ink-dim hover:text-ink">
            <Plus size={14} /> New list
          </button>
        )}
      </div>

      {!active && <p className="text-sm text-ink-faint">No lists yet.</p>}

      {/* Active list content */}
      {active && active.kind === "followed" && active.presetKey && (
        <div className="rounded-2xl glass p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-ink"><Star size={14} className="text-brand-400" /> {active.name}</div>
              <p className="mt-1 text-xs text-ink-dim">A followed trending list — opens live, always current.</p>
            </div>
            <div className="flex items-center gap-2">
              <Link href={`/screeners/${active.presetKey}`} className="inline-flex items-center gap-1 rounded-md border border-hairline px-3 py-1.5 text-xs text-brand-300 hover:bg-surface">Open <ExternalLink size={12} /></Link>
              <button onClick={() => unfollow(active.presetKey!)} className="inline-flex items-center gap-1 rounded-md border border-hairline px-3 py-1.5 text-xs text-ink-dim hover:text-rose-300"><Trash2 size={12} /> Unfollow</button>
            </div>
          </div>
        </div>
      )}

      {active && active.kind !== "followed" && (
        <div>
          {/* List header: rename (any list) + delete (custom only) */}
          <div className="mb-2 flex items-center justify-between">
            {renaming === active.id ? (
              <span className="inline-flex items-center gap-1.5">
                <input autoFocus value={renameVal} onChange={(e) => setRenameVal(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") renameList(active.id, renameVal); if (e.key === "Escape") setRenaming(null); }}
                  className="rounded-md border border-hairline bg-surface px-2.5 py-1 text-sm text-ink focus:border-brand-500 focus:outline-none" />
                <button onClick={() => renameList(active.id, renameVal)} className="text-xs text-brand-400 hover:underline">Save</button>
                <button onClick={() => setRenaming(null)} className="text-xs text-ink-faint hover:text-ink">Cancel</button>
              </span>
            ) : (
              <button onClick={() => { setRenaming(active.id); setRenameVal(active.name); }} className="inline-flex items-center gap-1 text-xs text-ink-faint hover:text-ink">
                <Pencil size={12} /> Rename
              </button>
            )}
            {active.kind === "custom" && (
              <button onClick={() => deleteList(active.id)} className="inline-flex items-center gap-1 text-xs text-ink-faint hover:text-rose-300"><Trash2 size={12} /> Delete list</button>
            )}
          </div>
          {/* default list uses the compat endpoint (no listId); custom passes listId */}
          <WatchlistManager listId={active.kind === "default" ? undefined : active.id} />
        </div>
      )}
      </div>

      {/* Right rail: "You might like" sits beside the lists on desktop, below on
          mobile — secondary to the user's own lists. */}
      <aside className="mt-4 lg:mt-0">
        <div className="lg:sticky lg:top-4">
          <WatchlistRecs />
        </div>
      </aside>
    </div>
  );
}
