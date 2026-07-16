"use client";

import { useState } from "react";
import { categoryStyle } from "@/lib/categories";

// 24px leading icon for a transaction / merchant row. Fallback chain:
//   1. Plaid merchant logo (logoUrl) — lazy-loaded, rounded, never stretched,
//      with the category circle as placeholder (no layout shift).
//   2. The category's Lucide icon in a circle tinted with the category accent.
//   3. A neutral initial-letter circle (unknown merchant + unknown category).
// NO emoji anywhere — Lucide only for category glyphs.
export function MerchantIcon({ logoUrl, merchant, category, size = 24 }: {
  logoUrl?: string | null; merchant?: string | null; category: string; size?: number;
}) {
  const [broken, setBroken] = useState(false);
  const { icon: Icon, color } = categoryStyle(category);
  const dim = { width: size, height: size };

  if (logoUrl && !broken) {
    return (
      <span className="relative inline-flex shrink-0 overflow-hidden rounded-full bg-surface-raised" style={dim} aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element -- merchant logos come from unbounded external CDNs; a lazy <img> with the circle placeholder is the safe choice (next/image would require whitelisting every merchant domain). */}
        <img src={logoUrl} alt="" loading="lazy" width={size} height={size}
          onError={() => setBroken(true)}
          className="h-full w-full rounded-full object-contain" />
      </span>
    );
  }

  // Category-tinted circle with the Lucide glyph.
  const initial = (merchant || "").trim().charAt(0).toUpperCase();
  const knownCategory = category && category !== "Other";
  if (knownCategory || !initial) {
    return (
      <span className="inline-flex shrink-0 items-center justify-center rounded-full" style={{ ...dim, background: `${color}22` }} aria-hidden>
        <Icon size={Math.round(size * 0.55)} style={{ color }} />
      </span>
    );
  }

  // Neutral initial-letter circle.
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-surface-raised text-ink-dim" style={dim} aria-hidden>
      <span style={{ fontSize: Math.round(size * 0.42) }} className="font-semibold">{initial}</span>
    </span>
  );
}
