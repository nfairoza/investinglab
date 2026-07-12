"use client";

import { useRef, useState } from "react";
import { useSWRConfig } from "swr";
import { Loader2 } from "lucide-react";

// M0.1 — pull-to-refresh for installed PWAs (which have no reload button).
// Touch-only, phones only (the wrapper is inert on md+ via the pointer check).
// Pull past ~70px while scrolled to the very top → spinner → revalidate SWR.
//
// We revalidate ALL live SWR keys (`mutate(() => true)`), not a page-specific
// list: the widget can't know each page's keys, and a full revalidate is the
// safe, correct recovery action a manual reload implies. overscroll-behavior on
// the shell keeps this from fighting iOS rubber-banding.
const THRESHOLD = 70;
const MAX_PULL = 110;

export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const { mutate } = useSWRConfig();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const active = useRef(false);

  function onTouchStart(e: React.TouchEvent) {
    // Only arm when the page is scrolled to the very top and not already busy.
    if (refreshing) return;
    const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
    if (scrollTop > 2) { startY.current = null; return; }
    startY.current = e.touches[0].clientY;
    active.current = true;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!active.current || startY.current == null || refreshing) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy <= 0) { setPull(0); return; }
    // Resistance curve so it feels rubbery, capped.
    const p = Math.min(MAX_PULL, dy * 0.5);
    setPull(p);
  }

  async function onTouchEnd() {
    if (!active.current) return;
    active.current = false;
    startY.current = null;
    if (pull >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPull(THRESHOLD);
      try {
        await mutate(() => true, undefined, { revalidate: true });
      } catch { /* best-effort refresh */ }
      finally {
        setRefreshing(false);
        setPull(0);
      }
    } else {
      setPull(0);
    }
  }

  const showSpinner = refreshing || pull > 8;
  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} className="md:contents">
      {/* Indicator sits above content, revealed by the pull distance. */}
      <div
        className="pointer-events-none flex items-center justify-center overflow-hidden md:hidden"
        style={{ height: pull, transition: active.current ? "none" : "height 200ms ease" }}
        aria-hidden={!showSpinner}
      >
        {showSpinner && (
          <Loader2
            size={22}
            className={refreshing ? "animate-spin" : ""}
            style={{ color: "var(--accent)", opacity: Math.min(1, pull / THRESHOLD), transform: `rotate(${pull * 2}deg)` }}
          />
        )}
      </div>
      {children}
    </div>
  );
}
