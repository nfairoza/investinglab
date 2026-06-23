"use client";

import { useEffect, useRef, useState } from "react";
import { CountUp } from "./ui/primitives";

// Cinematic dashboard hero: theme-aware jasmine image, gradient scrim, serif
// greeting, and a hero stat that counts up. Parallax via rAF, reduced-motion safe.
export function Hero({
  total, totalGain, badge,
}: { total?: number | null; totalGain?: number | null; badge?: React.ReactNode }) {
  const [offset, setOffset] = useState(0);
  const rafRef = useRef<number>();

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const onScroll = () => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        setOffset(window.scrollY * 0.22);
        rafRef.current = undefined;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const hasValue = typeof total === "number" && total > 0;
  const gainUp = (totalGain ?? 0) >= 0;

  return (
    <div className="relative overflow-hidden rounded-lg border border-hairline shadow-glass">
      {/* Theme-aware hero image (light variant swaps via CSS below) */}
      <div
        className="hero-img absolute inset-0 animate-hero-zoom bg-cover bg-center"
        style={{ transform: `translateY(${offset}px) scale(1.06)`, willChange: "transform" }}
        aria-hidden
      />
      {/* Scrim for legibility (token-driven so it works in both themes) */}
      <div className="hero-scrim absolute inset-0" aria-hidden />

      <div className="relative px-7 py-12 md:px-10 md:py-16">
        <div className="text-xs uppercase tracking-[0.35em]" style={{ color: "var(--accent)" }}>{greeting}</div>
        <h1 className="mt-2 font-display text-3xl font-bold leading-tight sm:text-4xl md:text-5xl">
          <span className="text-ink">ruk</span><span className="text-shimmer">Money</span>
        </h1>

        {hasValue ? (
          <div className="mt-5">
            <div className="text-[11px] uppercase tracking-wide text-ink-dim">Portfolio value</div>
            <div className="mt-1 flex flex-wrap items-baseline gap-3">
              <CountUp value={total!} prefix="$" className="text-3xl font-semibold text-ink sm:text-4xl md:text-5xl" />
              {typeof totalGain === "number" && (
                <span className="font-mono text-sm font-medium" style={{ color: gainUp ? "var(--positive)" : "var(--negative)" }}>
                  {gainUp ? "▲" : "▼"} ${Math.abs(totalGain).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              )}
              {badge}
            </div>
          </div>
        ) : (
          <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-dim">
            Your portfolio, researched and explained — live data, AI analysis, and a clear-eyed view of risk.
          </p>
        )}
      </div>
    </div>
  );
}
