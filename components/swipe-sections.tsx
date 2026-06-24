"use client";

import { useRef } from "react";
import { useRouter, usePathname } from "next/navigation";

// The four swipeable top-level destinations, in order. Swiping left/right on a
// phone navigates between them; the bottom bar stays in sync (it highlights by
// path). Order matches the bottom bar's primary tabs.
const ORDER = ["/", "/dashboard", "/research", "/networth"];

// Which swipe lane the current path belongs to (so swiping from any Invest or
// Money sub-page still moves to the neighbouring section).
function laneIndex(path: string): number {
  if (path === "/") return 0;
  if (["/dashboard", "/holdings", "/rankings", "/map", "/predictions", "/portfolio-doctor", "/congress", "/watchlist", "/journal"].some((p) => path.startsWith(p))) return 1;
  if (path.startsWith("/research")) return 2;
  if (["/networth", "/accounts", "/transactions", "/spending", "/advisor", "/alerts"].some((p) => path.startsWith(p))) return 3;
  return -1;
}

// Walk up from the touch target; if any ancestor scrolls horizontally, this is a
// content swipe (chart, wide table, carousel, stock-map) — don't page-swipe.
function startedInHorizontalScroller(target: EventTarget | null, stop: HTMLElement): boolean {
  let el = target as HTMLElement | null;
  while (el && el !== stop) {
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
