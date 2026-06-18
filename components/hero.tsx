"use client";

import { useEffect, useState } from "react";

// Dashboard hero band: cinematic jasmine image (Gemini-generated) with a
// gradient scrim, serif greeting, and a subtle scroll parallax on the image.
export function Hero({ subtitle }: { subtitle?: string }) {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const onScroll = () => setOffset(window.scrollY * 0.25);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="relative mb-8 overflow-hidden rounded-3xl border border-white/10 shadow-glass">
      {/* Background image with parallax */}
      <div
        className="absolute inset-0 animate-hero-zoom bg-cover bg-center"
        style={{
          backgroundImage: "url('/images/hero-jasmine.jpg')",
          transform: `translateY(${offset}px) scale(1.05)`,
          willChange: "transform",
        }}
        aria-hidden
      />
      {/* Scrim: darken left/bottom for text legibility, fade the top white strip */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, rgba(10,14,12,0.92) 0%, rgba(10,14,12,0.65) 40%, rgba(10,14,12,0.15) 100%)",
        }}
        aria-hidden
      />
      <div
        className="absolute inset-x-0 top-0 h-16"
        style={{ background: "linear-gradient(180deg, #0a0e0c 0%, transparent 100%)" }}
        aria-hidden
      />

      {/* Content */}
      <div className="relative px-7 py-12 md:px-10 md:py-16">
        <div className="text-xs uppercase tracking-[0.35em] text-brand-400/80">{greeting}</div>
        <h1 className="mt-2 font-display text-4xl font-semibold leading-tight text-[#ece9e0] md:text-5xl">
          <span className="text-shimmer">Noor Investing Lab</span>
        </h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-dim">
          {subtitle ??
            "Your portfolio, researched and explained — live data, AI analysis, and a clear-eyed view of risk."}
        </p>
      </div>
    </div>
  );
}
