"use client";

import { useCallback, useEffect, useRef } from "react";
import { needsAutoEnrich } from "@/lib/watchlist/age";

// ENRICH1 — viewport-gated automatic enrichment.
//
// Owns a single IntersectionObserver and hands out a per-row callback ref. When a
// row whose analysis is missing/daily-stale scrolls into view, it fires the enrich
// endpoint ONCE per symbol per session (refresh:false → the server only truly
// regenerates if the shared cache is stale: first-viewer-pays, everyone else
// reuses it; a per-user/day cap backstops runaway). This is how regular users get
// fresh analysis — by staleness on view, never an on-demand "run AI now" button.
//
// Design:
//   - once-per-symbol-per-session guard (`attempted`) so scrolling a row in and out
//     doesn't re-fire; a genuine refresh next session re-evaluates.
//   - in-flight guard (`inFlight`) so two rows for the same symbol don't double-fire.
//   - concurrency cap so a long stale list doesn't burst dozens of requests at once.

interface Row { id: string; symbol: string; analyzedAt?: string | null }

const MAX_CONCURRENT = 3;

export function useViewportEnrich(
  rows: Row[],
  enrich: (id: string) => Promise<void>,
  { enabled = true }: { enabled?: boolean } = {},
): (item: Row) => (el: HTMLElement | null) => void {
  // element → row, so the observer callback can resolve which item is visible.
  const elToRow = useRef(new Map<Element, Row>());
  const observer = useRef<IntersectionObserver | null>(null);
  const attempted = useRef(new Set<string>());   // symbols tried this session
  const inFlight = useRef(new Set<string>());
  // Latest rows/enrich without re-creating the observer each render.
  const rowsRef = useRef(rows);
  const enrichRef = useRef(enrich);
  rowsRef.current = rows;
  enrichRef.current = enrich;

  useEffect(() => {
    if (!enabled || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const row = elToRow.current.get(e.target);
          if (!row) continue;
          maybeEnrich(row);
        }
      },
      { rootMargin: "0px 0px 100px 0px", threshold: 0.1 },
    );
    observer.current = io;
    return () => { io.disconnect(); observer.current = null; };
  }, [enabled]);

  function maybeEnrich(row: Row) {
    if (!needsAutoEnrich(row.analyzedAt)) return;
    if (attempted.current.has(row.symbol) || inFlight.current.has(row.symbol)) return;
    if (inFlight.current.size >= MAX_CONCURRENT) return;   // cap the burst
    attempted.current.add(row.symbol);
    inFlight.current.add(row.symbol);
    enrichRef.current(row.id).finally(() => {
      inFlight.current.delete(row.symbol);
      // After a slot frees, re-scan currently-observed rows so a capped-out stale
      // list still drains instead of stalling.
      for (const r of elToRow.current.values()) maybeEnrich(r);
    });
  }

  // Callback ref to attach to each row's wrapper element.
  return useCallback((item: Row) => (el: HTMLElement | null) => {
    const io = observer.current;
    // Detach any element we were previously tracking for this id.
    for (const [prevEl, r] of elToRow.current) {
      if (r.id === item.id && prevEl !== el) { io?.unobserve(prevEl); elToRow.current.delete(prevEl); }
    }
    if (el) { elToRow.current.set(el, item); io?.observe(el); }
  }, []);
}
