"use client";

import { useEffect, useMemo, useState } from "react";

// =============================================================================
// AmbientLoader — the ONE full-region loading treatment app-wide. (Skeletons
// still cover individual cards.) Brand DNA only: near-black canvas, thin luminous
// teal->green line-work with soft glow, abstract "living market graph" motif.
// No cartoons, no flat purple/pink/orange. Full-bleed, edge-fading — reads as the
// page breathing, not a widget.
//
// Motion: slow continuous drift (12-20s), parallax depth (bg drifts slower than
// fg), CSS/SVG transforms + opacity only (no canvas loop). prefers-reduced-motion
// collapses to a static gradient + text. Ambient loops are permitted ONLY while
// loading and stop on content arrival (caller unmounts; 200ms crossfade in).
//
// One motif, tinted + accented per surface via `variant` (accent from the brand
// ramp so it's always in-theme):
//   research   → constellation + horizontal scan-line sweep (reading)
//   powertrades→ constellation points pulse in a radar sweep
//   money      → points flow gently downstream (left→right)
//   default    → the plain drifting constellation
// `ticker` renders the symbol large at ~4% opacity as a watermark, in the accent.
// =============================================================================

export type AmbientVariant = "default" | "research" | "powertrades" | "money";

// Accent per surface — all drawn from the brand teal->green ramp so every loader
// is in-family, just differently weighted.
const ACCENT: Record<AmbientVariant, string> = {
  default: "#16D27E",     // brand green
  research: "#14CC8C",    // green-teal
  powertrades: "#11B4AE", // teal
  money: "#0EA6C9",       // cyan-teal (downstream / flow)
};

interface Node { x: number; y: number; r: number; layer: 0 | 1; delay: number }
interface Link { a: number; b: number; delay: number }

// Deterministic node/link layout (no Math.random → SSR-safe, stable across mounts).
// Two depth layers: layer 0 = far (drifts slower, dimmer), layer 1 = near.
const NODES: Node[] = [
  { x: 90, y: 70, r: 2.4, layer: 0, delay: 0 },
  { x: 210, y: 130, r: 3.2, layer: 1, delay: 1.5 },
  { x: 340, y: 60, r: 2.2, layer: 0, delay: 3 },
  { x: 300, y: 210, r: 3.6, layer: 1, delay: 0.8 },
  { x: 470, y: 150, r: 3.0, layer: 1, delay: 2.2 },
  { x: 560, y: 80, r: 2.4, layer: 0, delay: 4 },
  { x: 640, y: 200, r: 3.4, layer: 1, delay: 1.1 },
  { x: 720, y: 110, r: 2.6, layer: 0, delay: 2.8 },
  { x: 160, y: 230, r: 2.2, layer: 0, delay: 3.6 },
  { x: 420, y: 40, r: 2.0, layer: 0, delay: 5 },
  { x: 520, y: 250, r: 3.0, layer: 1, delay: 0.4 },
  { x: 760, y: 60, r: 2.2, layer: 0, delay: 4.4 },
];
const LINKS: Link[] = [
  { a: 0, b: 1, delay: 0 }, { a: 1, b: 3, delay: 1 }, { a: 1, b: 4, delay: 2 },
  { a: 4, b: 3, delay: 0.5 }, { a: 4, b: 6, delay: 1.5 }, { a: 5, b: 4, delay: 2.5 },
  { a: 6, b: 7, delay: 0.8 }, { a: 3, b: 8, delay: 3 }, { a: 4, b: 9, delay: 3.5 },
  { a: 6, b: 10, delay: 1.2 }, { a: 7, b: 11, delay: 2 }, { a: 2, b: 5, delay: 2.8 },
];

export function AmbientLoader({
  variant = "default",
  ticker,
  label,
  messages,
  height = 240,
}: {
  variant?: AmbientVariant;
  ticker?: string;
  label?: string;
  messages?: string[];
  height?: number;
}) {
  const accent = ACCENT[variant];

  // Rotating status messages (charming copy kept). Falls back to a single label,
  // then to a generic line. Rotates every 3.2s with a fading ellipsis.
  const lines = useMemo(() => {
    if (messages && messages.length) return messages;
    if (label) return [label];
    return ["Working…"];
  }, [messages, label]);
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (lines.length < 2) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % lines.length), 3200);
    return () => clearInterval(id);
  }, [lines]);
  const msg = lines[idx].replace(/…$/, "");

  const gid = `amb-${variant}`;

  return (
    <div
      className="ambient-loader"
      style={{ height }}
      role="status"
      aria-live="polite"
      aria-label={lines[idx]}
    >
      {/* Reduced-motion: static brand gradient wash, no animation. */}
      <div className="ambient-static" aria-hidden style={{ background: `radial-gradient(60% 60% at 50% 45%, ${accent}22, transparent 70%)` }} />

      {/* Motion layer — hidden under prefers-reduced-motion via CSS. */}
      <div className="ambient-motion" aria-hidden>
        {ticker && (
          <div className="ambient-watermark" style={{ color: accent }}>{ticker.toUpperCase()}</div>
        )}
        <svg className="ambient-svg" viewBox="0 0 800 300" preserveAspectRatio="xMidYMid slice">
          <defs>
            <radialGradient id={`${gid}-node`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={accent} stopOpacity="1" />
              <stop offset="100%" stopColor={accent} stopOpacity="0" />
            </radialGradient>
            <filter id={`${gid}-glow`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2.2" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Far layer (slower parallax) */}
          <g className="ambient-far">
            {LINKS.filter((l) => NODES[l.a].layer === 0 || NODES[l.b].layer === 0).map((l, i) => (
              <line key={`fl${i}`} x1={NODES[l.a].x} y1={NODES[l.a].y} x2={NODES[l.b].x} y2={NODES[l.b].y}
                stroke={accent} strokeWidth={0.6} className="ambient-link" style={{ animationDelay: `${l.delay}s` }} />
            ))}
            {NODES.filter((n) => n.layer === 0).map((n, i) => (
              <circle key={`fn${i}`} cx={n.x} cy={n.y} r={n.r} fill={accent} opacity={0.4}
                className="ambient-node" style={{ animationDelay: `${n.delay}s` }} filter={`url(#${gid}-glow)`} />
            ))}
          </g>

          {/* Near layer (faster parallax) */}
          <g className={`ambient-near${variant === "money" ? " ambient-flow" : ""}`}>
            {LINKS.filter((l) => NODES[l.a].layer === 1 && NODES[l.b].layer === 1).map((l, i) => (
              <line key={`nl${i}`} x1={NODES[l.a].x} y1={NODES[l.a].y} x2={NODES[l.b].x} y2={NODES[l.b].y}
                stroke={accent} strokeWidth={0.9} className="ambient-link" style={{ animationDelay: `${l.delay}s` }} />
            ))}
            {NODES.filter((n) => n.layer === 1).map((n, i) => (
              <circle key={`nn${i}`} cx={n.x} cy={n.y} r={n.r} fill={accent}
                className={`ambient-node${variant === "powertrades" ? " ambient-radar" : ""}`}
                style={{ animationDelay: `${variant === "powertrades" ? (n.x / 800) * 3 : n.delay}s` }}
                filter={`url(#${gid}-glow)`} />
            ))}
          </g>

          {/* Research: a slow horizontal scan-line sweep suggesting reading. */}
          {variant === "research" && (
            <rect className="ambient-scan" x={-120} y={0} width={120} height={300} fill={`url(#${gid}-node)`} opacity={0.25} />
          )}
        </svg>
      </div>

      {/* Centered rotating status copy */}
      <div className="ambient-caption">
        <span className="text-sm text-ink-dim">{msg}</span>
        <span className="ambient-ellipsis" aria-hidden><span>.</span><span>.</span><span>.</span></span>
      </div>
    </div>
  );
}
