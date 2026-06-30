"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Eye, ChevronRight, ChevronDown } from "lucide-react";
import { GlassCard } from "./ui/primitives";

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  return r.json();
}

interface ListSummary { id: string; name: string; kind: string; presetKey: string | null; count: number }
interface ListItem { id: string; symbol: string }

// One list row: header toggles open/closed; when open it lazily loads its items.
function ListRow({ list, open, onToggle }: { list: ListSummary; open: boolean; onToggle: () => void }) {
  // Only fetch the items once the row is opened (lazy — keeps the dashboard light).
  const { data } = useSWR<{ items: ListItem[] }>(open ? `/api/watchlists/${list.id}` : null, fetchJson, { revalidateOnFocus: false });
  const items = data?.items ?? [];
  const href = list.kind === "followed" && list.presetKey ? `/screeners/${list.presetKey}` : "/watchlist";

  return (
    <div className="rounded-lg border border-hairline">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-surface"
      >
        <span className="flex items-center gap-2 min-w-0">
          {open ? <ChevronDown size={14} className="shrink-0 text-accent" /> : <ChevronRight size={14} className="shrink-0 text-ink-faint" />}
          <span className="truncate text-sm font-medium text-ink">{list.name}</span>
        </span>
        <span className="shrink-0 text-[11px] text-ink-faint">{list.count}</span>
      </button>
      {open && (
        <div className="border-t border-hairline px-3 py-2">
          {items.length === 0 ? (
            <p className="text-xs text-ink-faint">
              {list.kind === "followed" ? <Link href={href} className="text-accent hover:underline">Open this list →</Link> : "No stocks yet."}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {items.slice(0, 24).map((it) => (
                <Link key={it.id} href={`/research?symbol=${it.symbol}`} className="rounded-md border border-hairline px-2 py-1 font-mono text-xs text-ink-dim hover:text-accent hover:border-hairline-strong">{it.symbol}</Link>
              ))}
              {items.length > 24 && <span className="self-center text-[11px] text-ink-faint">+{items.length - 24} more</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Dashboard "Watchlist" card: a collapsible list-of-lists. The default (main)
// list starts expanded; only one list is open at a time.
export function DashboardWatchlists() {
  const { data: lists } = useSWR<ListSummary[]>("/api/watchlists", fetchJson, { revalidateOnFocus: true });
  const [openId, setOpenId] = useState<string | null>(null);

  // Default: expand the "default" (main) list once lists arrive.
  useEffect(() => {
    if (openId == null && lists && lists.length > 0) {
      const main = lists.find((l) => l.kind === "default") ?? lists[0];
      setOpenId(main.id);
    }
  }, [lists, openId]);

  const hasAny = Array.isArray(lists) && lists.length > 0;

  return (
    <GlassCard hover>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink"><Eye size={15} className="text-accent" /> Watchlist</div>
        <Link href="/watchlist" className="text-xs text-accent hover:underline">Open</Link>
      </div>
      {!hasAny ? (
        <p className="mt-2 text-sm text-ink-faint">Nothing on your watchlist yet.</p>
      ) : (
        <div className="mt-2 space-y-1.5">
          {lists!.map((l) => (
            <ListRow
              key={l.id}
              list={l}
              open={openId === l.id}
              onToggle={() => setOpenId((cur) => (cur === l.id ? null : l.id))}
            />
          ))}
        </div>
      )}
    </GlassCard>
  );
}
