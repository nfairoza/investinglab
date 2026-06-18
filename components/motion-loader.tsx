"use client";

import { useMemo } from "react";
import { AiThinking } from "./ai-thinking";

// =============================================================================
// Seamless CSS/SVG motion-graphic loaders — pure motion graphics (no video, no
// photos), so they loop perfectly with no visible cut. Themed per page, with a
// few variants chosen at random each mount. Accent color comes from theme tokens
// (positive/violet/etc.); reduced-motion users get the static base gradient.
// =============================================================================

type Scene = "grid" | "radar" | "wave" | "constellation" | "bars" | "orbit";

// Which scenes suit which page (the random pick draws from these).
const SCENES_BY_PAGE: Record<string, Scene[]> = {
  predictions: ["wave", "radar", "constellation"],
  doctor: ["bars", "orbit", "grid"],
  congress: ["constellation", "grid", "radar"],
  research: ["wave", "grid", "orbit"],
  default: ["grid", "wave", "radar", "constellation", "bars", "orbit"],
};

function pick<T>(arr: T[]): T {
  // Math.random is fine here (presentation only, not in a workflow script).
  return arr[Math.floor(Math.random() * arr.length)] ?? arr[0];
}

export function MotionLoader({
  page = "default", label, height = 220,
}: { page?: keyof typeof SCENES_BY_PAGE; label?: string; height?: number }) {
  // Pick a scene once per mount so it stays stable while visible.
  const scene = useMemo(() => pick(SCENES_BY_PAGE[page] ?? SCENES_BY_PAGE.default), [page]);

  return (
    <div
      className="relative overflow-hidden rounded-lg border border-hairline"
      style={{ height, background: "radial-gradient(120% 120% at 50% 0%, var(--accent-soft), transparent 55%), var(--surface)" }}
    >
      <div className="absolute inset-0 motion-reduce:hidden">{renderScene(scene)}</div>
      {/* bottom scrim + label */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(0deg, var(--bg) 2%, transparent 55%)" }} aria-hidden />
      <div className="absolute inset-x-0 bottom-0 p-4"><AiThinking label={label} /></div>
    </div>
  );
}

function renderScene(scene: Scene) {
  switch (scene) {
    case "grid": return <GridScene />;
    case "radar": return <RadarScene />;
    case "wave": return <WaveScene />;
    case "constellation": return <ConstellationScene />;
    case "bars": return <BarsScene />;
    case "orbit": return <OrbitScene />;
  }
}

// ── Scrolling tech grid (data flowing) ───────────────────────────────────────
function GridScene() {
  return (
    <div className="absolute inset-0" style={{
      backgroundImage:
        "linear-gradient(var(--accent-soft) 1px, transparent 1px), linear-gradient(90deg, var(--accent-soft) 1px, transparent 1px)",
      backgroundSize: "40px 40px",
      animation: "mg-scroll-diag 2.4s linear infinite",
      maskImage: "radial-gradient(80% 80% at 50% 40%, #000 40%, transparent 100%)",
      WebkitMaskImage: "radial-gradient(80% 80% at 50% 40%, #000 40%, transparent 100%)",
    }} />
  );
}

// ── Radar sweep + expanding rings (scanning) ─────────────────────────────────
function RadarScene() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      {[0, 1, 2].map((i) => (
        <span key={i} className="absolute rounded-full border" style={{
          width: 220, height: 220, borderColor: "var(--accent)",
          animation: `mg-radar 2.4s ease-out ${i * 0.8}s infinite`,
        }} />
      ))}
      <span className="absolute h-1/2 w-px origin-bottom" style={{
        background: "linear-gradient(transparent, var(--accent))",
        top: 0, animation: "mg-rotate 3s linear infinite",
      }} />
    </div>
  );
}

// ── Flowing wave lines (price/data stream) ───────────────────────────────────
function WaveScene() {
  return (
    <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 400 200">
      {[0, 1, 2].map((i) => (
        <path key={i}
          d="M0 100 C 50 60, 90 140, 140 100 S 240 60, 290 100 S 360 140, 400 100"
          fill="none" stroke="var(--accent)" strokeWidth={1.5}
          strokeOpacity={0.7 - i * 0.2}
          strokeDasharray="14 10"
          style={{ animation: `mg-dash ${5 + i * 2}s linear infinite`, transform: `translateY(${i * 14 - 14}px)` }}
        />
      ))}
    </svg>
  );
}

// ── Constellation: drifting nodes + connecting lines (network/politics) ──────
function ConstellationScene() {
  const nodes = [[60, 60], [160, 110], [260, 70], [330, 140], [110, 160], [220, 40]];
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 200">
      <g stroke="var(--accent)" strokeOpacity={0.3} strokeWidth={1}>
        {nodes.slice(1).map(([x, y], i) => (
          <line key={i} x1={nodes[i][0]} y1={nodes[i][1]} x2={x} y2={y}
            strokeDasharray="6 8" style={{ animation: `mg-dash ${6 + i}s linear infinite` }} />
        ))}
      </g>
      {nodes.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={3.5} fill="var(--accent)"
          style={{ animation: `mg-float ${2.6 + (i % 3) * 0.6}s ease-in-out ${i * 0.2}s infinite` }} />
      ))}
    </svg>
  );
}

// ── Equalizer bars (analysis crunching) ──────────────────────────────────────
function BarsScene() {
  return (
    <div className="absolute inset-0 flex items-center justify-center gap-1.5">
      {Array.from({ length: 14 }).map((_, i) => (
        <span key={i} className="w-2 origin-bottom rounded-full" style={{
          height: 90, background: "linear-gradient(var(--accent), transparent)",
          animation: `mg-bar ${1 + (i % 5) * 0.25}s ease-in-out ${i * 0.08}s infinite`,
        }} />
      ))}
    </div>
  );
}

// ── Orbiting rings (modeling/compute) ────────────────────────────────────────
function OrbitScene() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      {[140, 200, 260].map((d, i) => (
        <span key={d} className="absolute rounded-full border" style={{
          width: d, height: d, borderColor: "var(--accent-soft)",
          animation: `${i % 2 ? "mg-rotate-rev" : "mg-rotate"} ${6 + i * 3}s linear infinite`,
        }}>
          <span className="absolute h-2 w-2 rounded-full" style={{ background: "var(--accent)", top: -4, left: "50%" }} />
        </span>
      ))}
      <span className="h-3 w-3 rounded-full" style={{ background: "var(--accent)", boxShadow: "0 0 16px var(--accent)" }} />
    </div>
  );
}
