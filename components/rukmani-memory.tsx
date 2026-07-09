"use client";

import useSWR, { mutate as globalMutate } from "swr";
import { Brain, X } from "lucide-react";
import { fetchJson } from "@/lib/fetch-json";

interface Fact { id: string; fact: string; kind: string; updated_at: string }
const KEY = "/api/chat/memory";

// C5 — "What Rukmani remembers": per-fact delete + clear-all, so memory is never
// invisible or unremovable. Lives in Settings.
export function RukmaniMemory() {
  const { data } = useSWR<{ facts: Fact[] }>(KEY, fetchJson, { revalidateOnFocus: false });
  const facts = data?.facts ?? [];

  async function del(id: string) {
    globalMutate(KEY, (c: { facts: Fact[] } | undefined) => c ? { facts: c.facts.filter((f) => f.id !== id) } : c, { revalidate: false });
    await fetch(`${KEY}?id=${id}`, { method: "DELETE" }).catch(() => {});
    globalMutate(KEY);
  }
  async function clearAll() {
    globalMutate(KEY, { facts: [] }, { revalidate: false });
    await fetch(`${KEY}?all=1`, { method: "DELETE" }).catch(() => {});
    globalMutate(KEY);
  }

  return (
    <div className="rounded-2xl glass p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Brain size={16} className="mt-0.5 shrink-0 text-brand-400" />
          <div>
            <div className="text-sm font-medium text-ink">What Rukmani remembers</div>
            <div className="text-xs text-ink-dim">Durable preferences, goals, and your expertise level — used to tailor answers. Yours to edit.</div>
          </div>
        </div>
        {facts.length > 0 && <button onClick={clearAll} className="shrink-0 text-[11px] text-ink-faint hover:text-rose-400">Clear all</button>}
      </div>
      {facts.length === 0 ? (
        <p className="px-1 py-3 text-xs text-ink-faint">Nothing yet. As you chat, Rukmani notes durable preferences (e.g. &ldquo;keep answers short&rdquo;) here.</p>
      ) : (
        <ul className="space-y-1.5">
          {facts.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 rounded-lg border border-hairline bg-surface px-3 py-2">
              <span className="min-w-0 text-sm text-ink"><span className="mr-2 rounded-full border border-hairline px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-ink-faint">{f.kind}</span>{f.fact}</span>
              <button onClick={() => del(f.id)} aria-label="Forget this" className="shrink-0 text-ink-faint hover:text-rose-400"><X size={14} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
