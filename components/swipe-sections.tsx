"use client";

import { useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { MOBILE_TABS } from "@/lib/nav";

// The swipeable top-level lanes are the 5 primary IA tabs, derived from
// lib/nav MOBILE_TABS (M0.6 — single source, so the IA can't desync the swipe
// order from the bottom bar). Each lane = a tab; its `match` prefixes decide
// which sub-page belongs to which lane.
const ORDER = MOBILE_TABS.map((t) => t.href);

// Which swipe lane the current path belongs to (so swiping from any sub-page
// still moves to the neighbouring section). Uses the same match logic the bar
// uses to highlight, so they always agree.
function laneIndex(path: string): number {
  return MOBILE_TABS.findIndex((t) =>
    t.exact ? path === t.href : t.match.some((m) => path === m || path.startsWith(m + "/")),
  );
}

// Walk up from the touch target; if any ancestor scrolls horizontally OR is
// explicitly marked data-no-page-swipe (charts/stock-map — SVGs that scrub but
// don't scroll, M0.3), this is a content gesture — don't page-swipe.
function startedInHorizontalScroller(target: EventTarget | null, stop: HTMLElement): boolean {
  let el = target as HTMLElement | null;
  while (el && el !== stop) {
    if (el.dataset && el.dataset.noPageSwipe !== undefined) return true;
    const style = window.getComputedStyle(el);
    const ox = style.overflowX;
    if ((ox === "auto" || ox === "scroll") && el.scrollWidth > el.clientWidth + 4) return true;
    el = el.parentElement;
  }
  return false;
}

export function SwipeSections({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname() || "/";
  const containerRef = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number; ok: boolean } | null>(null);

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    const ok = containerRef.current ? !startedInHorizontalScroller(e.target, containerRef.current) : true;
    start.current = { x: t.clientX, y: t.clientY, ok };
  }

  function onTouchEnd(e: React.TouchEvent) {
    const s = start.current; start.current = null;
    if (!s || !s.ok) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    // Require a mostly-horizontal, decisive swipe.
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.8) return;

    const lane = laneIndex(path);
    if (lane < 0) return;
    const next = dx < 0 ? lane + 1 : lane - 1;
    if (next < 0 || next >= ORDER.length) return;
    router.push(ORDER[next]);
  }

  return (
    <div ref={containerRef} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} className="h-full">
      {children}
    </div>
  );
}
