"use client";

import { useMemo } from "react";
import { AiThinking } from "./ai-thinking";

// =============================================================================
// Tech-artsy CSS/SVG motion loaders — pure motion graphics (no video, no
// photos), looping perfectly by construction. No card chrome: just the animation
// on a transparent ground with a small status line beneath. Themed per page, a
// random variant each mount. Accent color from theme tokens; reduced-motion
// users get a calm static state.
// =============================================================================

type Scene = "pulsegrid" | "scan" | "stream" | "mesh" | "spectrum" | "orbital" | "comet";

const SCENES_BY_PAGE: Record<string, Scene[]> = {
  predictions: ["stream", "scan", "comet"],
  doctor: ["spectrum", "orbital", "pulsegrid"],
  congress: ["mesh", "pulsegrid", "scan"],
  research: ["stream", "pulsegrid", "orbital"],
  default: ["pulsegrid", "scan", "stream", "mesh", "spectrum", "orbital", "comet"],
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] ?? arr[0];
}

export function MotionLoader({
  page = "default", label, height = 200,
}: { page?: keyof typeof SCENES_BY_PAGE; label?: string; height?: number }) {
  const scene = useMemo(() => pick(SCENES_BY_PAGE[page] ?? SCENES_BY_PAGE.default), [page]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-2" style={{ minHeight: height }}>
      <div className="relative w-full overflow-hidden" style={{ height: height - 36 }}>
        <div className="absolute inset-0 motion-reduce:hidden">{renderScene(scene)}</div>
        {/* reduced-motion fallback: a calm static accent glow */}
        <div className="absolute inset-0 hidden motion-reduce:block"
          style={{ background: "radial-gradient(60% 60% at 50% 50%, var(--accent-soft), transparent 70%)" }} aria-hidden />
      </div>
      <AiThinking label={label} />
    </div>
  );
}

function renderScene(scene: Scene) {
  switch (scene) {
    case "pulsegrid": return <PulseGrid />;
    case "scan": return <Scan />;
    case "stream": return <Stream />;
    case "mesh": return <Mesh />;
    case "spectrum": return <Spectrum />;
    case "orbital": return <Orbital />;
    case "comet": return <Comet />;
  }
}

// ── Pulse grid: dot matrix with a diagonal wave of brightness ────────────────
function PulseGrid() {
  const cols = 16, rows = 6;
  const dots = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) dots.push({ r, c });
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {dots.map(({ r, c }) => (
          <span key={`${r}-${c}`} className="h-1.5 w-1.5 rounded-full" style={{
            background: "var(--accent)",
            animation: "mg-twinkle 1.8s ease-in-out infinite",
            animationDelay: `${(r + c) * 0.08}s`,
          }} />
        ))}
      </div>
    </div>
  );
}

// ── Scan: radar sweep + expanding rings + crosshair ──────────────────────────
function Scan() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      {[0, 1, 2].map((i) => (
        <span key={i} className="absolute rounded-full border-2" style={{
          width: 190, height: 190, borderColor: "var(--accent)",
          animation: `mg-radar 2.6s ease-out ${i * 0.85}s infinite`,
        }} />
      ))}
      <span className="absolute rounded-full" style={{
        width: 190, height: 190,
        background: "conic-gradient(from 0deg, transparent 0deg, var(--accent-soft) 40deg, transparent 80deg)",
        animation: "mg-rotate 2.2s linear infinite",
      }} />
      <span className="absolute h-2 w-2 rounded-full" style={{ background: "var(--accent)", boxShadow: "0 0 16px 3px var(--accent)" }} />
    </div>
  );
}

// ── Stream: flowing wave lines with a soft fill (price/data stream) ──────────
function Stream() {
  return (
    <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 400 160">
      <defs>
        <linearGradient id="ml-stream" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.5" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 1, 2].map((i) => (
        <path key={i}
          d="M0 90 C 50 50, 90 130, 140 90 S 240 50, 290 90 S 360 130, 400 90"
          fill="none" stroke="var(--accent)" strokeWidth={2}
          strokeOpacity={0.75 - i * 0.22} strokeDasharray="18 12"
          style={{ animation: `mg-dash ${4 + i * 1.5}s linear infinite`, transform: `translateY(${i * 16 - 16}px)` }} />
      ))}
      <path d="M0 90 C 50 50, 90 130, 140 90 S 240 50, 290 90 S 360 130, 400 90 L400 160 L0 160 Z"
        fill="url(#ml-stream)" opacity="0.5" />
    </svg>
  );
}

// ── Mesh: network of nodes with pinging pulses (politics/congress) ───────────
function Mesh() {
  const nodes = [[50, 50], [150, 100], [260, 55], [340, 120], [110, 135], [220, 30], [320, 30]];
  const links: [number, number][] = [[0, 1], [1, 2], [2, 3], [1, 4], [2, 5], [5, 6], [0, 4]];
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 160">
      <g stroke="var(--accent)" strokeOpacity={0.35} strokeWidth={1.2}>
        {links.map(([a, b], i) => (
          <line key={i} x1={nodes[a][0]} y1={nodes[a][1]} x2={nodes[b][0]} y2={nodes[b][1]}
            strokeDasharray="5 9" style={{ animation: `mg-dash ${4 + i}s linear infinite` }} />
        ))}
      </g>
      {nodes.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={9} fill="var(--accent)" opacity={0.18}
            style={{ animation: `mg-ping 2.4s ease-out ${i * 0.3}s infinite` }} />
          <circle cx={x} cy={y} r={3.5} fill="var(--accent)"
            style={{ animation: `mg-twinkle ${2.4 + (i % 3) * 0.5}s ease-in-out ${i * 0.2}s infinite` }} />
        </g>
      ))}
    </svg>
  );
}

// ── Spectrum: equalizer bars with a glow, symmetric loop ─────────────────────
function Spectrum() {
  return (
    <div className="absolute inset-0 flex items-end justify-center gap-2 pb-6">
      {Array.from({ length: 18 }).map((_, i) => (
        <span key={i} className="w-2.5 origin-bottom rounded-t-sm" style={{
          height: 110,
          background: "linear-gradient(var(--accent), color-mix(in oklab, var(--accent) 30%, transparent))",
          boxShadow: "0 0 12px -2px var(--accent)",
          animation: `mg-bar ${0.9 + (i % 6) * 0.22}s ease-in-out ${i * 0.06}s infinite`,
        }} />
      ))}
    </div>
  );
}

// ── Orbital: nested rotating rings with satellites + core glow ───────────────
function Orbital() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      {[80, 130, 180].map((d, i) => (
        <span key={d} className="absolute rounded-full border" style={{
          width: d, height: d, borderColor: "var(--accent)", opacity: 0.35,
          animation: `${i % 2 ? "mg-rotate-rev" : "mg-rotate"} ${4 + i * 2.5}s linear infinite`,
        }}>
          <span className="absolute h-2.5 w-2.5 rounded-full" style={{
            background: "var(--accent)", boxShadow: "0 0 10px 2px var(--accent)", top: -5, left: "50%", marginLeft: -5,
          }} />
        </span>
      ))}
      <span className="h-4 w-4 rounded-full" style={{ background: "var(--accent)", boxShadow: "0 0 24px 6px var(--accent)", animation: "mg-twinkle 1.6s ease-in-out infinite" }} />
    </div>
  );
}

// ── Comet: dots racing a circular track, leaving glow trails ─────────────────
function Comet() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="absolute" style={{
          width: 150, height: 150,
          animation: `mg-rotate ${1.6 + i * 0.25}s linear infinite`,
        }}>
          <span className="absolute h-2.5 w-2.5 rounded-full" style={{
            background: "var(--accent)", top: 0, left: "50%", marginLeft: -5,
            boxShadow: "0 0 14px 3px var(--accent)", opacity: 0.9 - i * 0.18,
          }} />
        </span>
      ))}
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent-soft)" }} />
    </div>
  );
}
