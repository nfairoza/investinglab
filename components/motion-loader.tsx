"use client";

import { useMemo } from "react";
import { AiThinking } from "./ai-thinking";

// =============================================================================
// Flat-2D explainer-style motion graphics (think logo-reveal / cartoon scene).
// Pure CSS/SVG, loop perfectly by construction, no video/photos. Colorful — uses
// the same palette as the allocation donut so it feels on-theme. Wide (fills the
// card), themed per page, with a random scene each mount (round-robin feel).
// Reduced-motion users get a calm static gradient.
// =============================================================================

// Shared palette — matches AllocationDonut so the whole app feels cohesive.
const C = {
  violet: "#8B7CF6",
  mint: "#34E0A1",
  sky: "#60A5FA",
  amber: "#F59E0B",
  rose: "#FB7185",
  cyan: "#22D3EE",
  lilac: "#A78BFA",
  gold: "#FBBF24",
  green: "#4ADE80",
  pink: "#F472B6",
};

type Scene = "city" | "skyline" | "ribbons" | "constellation" | "confetti" | "orbit" | "rocket";

const SCENES_BY_PAGE: Record<string, Scene[]> = {
  predictions: ["ribbons", "skyline", "rocket", "constellation"],
  doctor: ["skyline", "orbit", "city", "confetti"],
  congress: ["constellation", "city", "ribbons"],
  research: ["ribbons", "skyline", "orbit", "rocket"],
  default: ["city", "skyline", "ribbons", "constellation", "confetti", "orbit", "rocket"],
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] ?? arr[0];
}

export function MotionLoader({
  page = "default", label, height = 240,
}: { page?: keyof typeof SCENES_BY_PAGE; label?: string; height?: number }) {
  const scene = useMemo(() => pick(SCENES_BY_PAGE[page] ?? SCENES_BY_PAGE.default), [page]);

  // No card/box — the animation sits on transparent space (like a PNG), so it
  // blends into whatever's behind it.
  return (
    <div className="flex w-full flex-col items-center gap-2">
      <div className="relative w-full" style={{ height }}>
        <div className="absolute inset-0 motion-reduce:hidden">{renderScene(scene)}</div>
        <div className="absolute inset-0 hidden motion-reduce:block"
          style={{ background: "radial-gradient(50% 50% at 50% 50%, var(--accent-soft), transparent 70%)" }} aria-hidden />
      </div>
      <AiThinking label={label} />
    </div>
  );
}

function renderScene(scene: Scene) {
  switch (scene) {
    case "city": return <City />;
    case "skyline": return <Skyline />;
    case "ribbons": return <Ribbons />;
    case "constellation": return <Constellation />;
    case "confetti": return <Confetti />;
    case "orbit": return <Orbit />;
    case "rocket": return <Rocket />;
  }
}

// ── City: flat landscape with hills, trees, a building, sun + drifting cloud ──
function City() {
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 800 300" preserveAspectRatio="xMidYMid slice">
      {/* sun */}
      <g style={{ transformOrigin: "660px 70px", animation: "mg-spin-slow 18s linear infinite" }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <rect key={i} x={657} y={36} width={6} height={14} rx={3} fill={C.gold}
            transform={`rotate(${i * 45} 660 70)`} />
        ))}
        <circle cx={660} cy={70} r={20} fill={C.gold} />
      </g>
      {/* cloud */}
      <g style={{ animation: "mg-drift 6s ease-in-out infinite alternate" }}>
        <ellipse cx={150} cy={70} rx={42} ry={20} fill={C.sky} opacity={0.85} />
        <ellipse cx={120} cy={78} rx={26} ry={15} fill={C.cyan} opacity={0.7} />
      </g>
      {/* hills */}
      <path d="M0 230 Q 200 150 400 220 T 800 210 L800 300 L0 300 Z" fill={C.mint} opacity={0.85} />
      <path d="M0 260 Q 250 200 520 250 T 800 250 L800 300 L0 300 Z" fill={C.green} opacity={0.7} />
      {/* building */}
      <g style={{ transformOrigin: "440px 230px", animation: "mg-bob 4s ease-in-out infinite" }}>
        <rect x={410} y={120} width={60} height={110} rx={6} fill={C.violet} />
        <rect x={432} y={96} width={16} height={28} rx={4} fill={C.rose} />
        {Array.from({ length: 6 }).map((_, i) => (
          <rect key={i} x={420 + (i % 2) * 24} y={134 + Math.floor(i / 2) * 26} width={16} height={14} rx={2} fill={C.gold} opacity={0.9} />
        ))}
      </g>
      {/* trees */}
      {[{ x: 250, c: C.amber }, { x: 300, c: C.pink }, { x: 600, c: C.lilac }].map((t, i) => (
        <g key={i} style={{ transformOrigin: `${t.x}px 230px`, animation: `mg-bob ${3.4 + i * 0.5}s ease-in-out ${i * 0.3}s infinite` }}>
          <rect x={t.x - 3} y={205} width={6} height={30} fill={C.green} />
          <ellipse cx={t.x} cy={196} rx={20} ry={26} fill={t.c} />
        </g>
      ))}
    </svg>
  );
}

// ── Skyline: rising/falling bars (a chart that breathes), colorful ───────────
function Skyline() {
  const cols = [C.violet, C.mint, C.sky, C.amber, C.rose, C.cyan, C.lilac, C.gold, C.green, C.pink, C.violet, C.mint, C.sky, C.amber];
  return (
    <div className="absolute inset-0 flex items-end justify-center gap-2 px-6 pb-10">
      {cols.map((c, i) => (
        <span key={i} className="flex-1 origin-bottom rounded-t-lg" style={{
          height: `${50 + (i % 5) * 12}%`,
          background: `linear-gradient(${c}, color-mix(in oklab, ${c} 40%, transparent))`,
          animation: `mg-grow ${1.4 + (i % 6) * 0.2}s ease-in-out ${i * 0.07}s infinite`,
        }} />
      ))}
    </div>
  );
}

// ── Ribbons: thick flowing waves in palette colors (price streams) ───────────
function Ribbons() {
  const colors = [C.violet, C.mint, C.sky, C.amber, C.rose];
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 800 300" preserveAspectRatio="none">
      {colors.map((c, i) => (
        <g key={i} style={{ animation: `mg-flow ${6 + i * 1.5}s linear infinite` }}>
          <path
            d={`M-200 ${110 + i * 26} q 100 -34 200 0 t 200 0 t 200 0 t 200 0 t 200 0`}
            fill="none" stroke={c} strokeWidth={10} strokeLinecap="round" opacity={0.8 - i * 0.1} />
        </g>
      ))}
    </svg>
  );
}

// ── Constellation: colorful nodes + links with traveling pulses (network) ────
function Constellation() {
  const nodes: [number, number, string][] = [
    [120, 90, C.violet], [300, 150, C.mint], [520, 80, C.sky], [680, 170, C.amber],
    [220, 220, C.rose], [440, 230, C.cyan], [620, 60, C.gold], [400, 60, C.pink],
  ];
  const links: [number, number][] = [[0, 1], [1, 2], [2, 3], [1, 4], [1, 5], [2, 6], [7, 2], [4, 5]];
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 800 300" preserveAspectRatio="xMidYMid slice">
      <g strokeWidth={1.5} opacity={0.4}>
        {links.map(([a, b], i) => (
          <line key={i} x1={nodes[a][0]} y1={nodes[a][1]} x2={nodes[b][0]} y2={nodes[b][1]}
            stroke={nodes[a][2]} strokeDasharray="6 10" style={{ animation: `mg-dash ${5 + i}s linear infinite` }} />
        ))}
      </g>
      {nodes.map(([x, y, c], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={16} fill={c} opacity={0.18} style={{ transformOrigin: `${x}px ${y}px`, animation: `mg-ping 2.6s ease-out ${i * 0.3}s infinite` }} />
          <circle cx={x} cy={y} r={6} fill={c} style={{ transformOrigin: `${x}px ${y}px`, animation: `mg-pop ${2.4 + (i % 3) * 0.5}s ease-in-out ${i * 0.2}s infinite` }} />
        </g>
      ))}
    </svg>
  );
}

// ── Confetti: popping dots in all palette colors ─────────────────────────────
function Confetti() {
  const dots = Array.from({ length: 40 }, (_, i) => i);
  const cols = Object.values(C);
  // Deterministic pseudo-random positions (index-based) so SSR + client match.
  return (
    <div className="absolute inset-0">
      {dots.map((i) => {
        const left = (i * 53) % 100;
        const top = (i * 37) % 90;
        const c = cols[i % cols.length];
        const size = 6 + (i % 4) * 3;
        return (
          <span key={i} className="absolute rounded-full" style={{
            left: `${left}%`, top: `${top}%`, width: size, height: size, background: c,
            animation: `mg-pop ${1.6 + (i % 5) * 0.3}s ease-in-out ${(i % 7) * 0.18}s infinite`,
          }} />
        );
      })}
    </div>
  );
}

// ── Orbit: colorful planets circling a glowing core ──────────────────────────
function Orbit() {
  const rings = [
    { d: 130, c: C.violet, dur: 5 },
    { d: 200, c: C.mint, dur: 8 },
    { d: 270, c: C.sky, dur: 11 },
  ];
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      {rings.map((r, i) => (
        <span key={i} className="absolute rounded-full border" style={{
          width: r.d, height: r.d, borderColor: r.c, opacity: 0.35,
          animation: `${i % 2 ? "mg-rotate-rev" : "mg-rotate"} ${r.dur}s linear infinite`,
        }}>
          <span className="absolute rounded-full" style={{
            width: 16, height: 16, background: r.c, top: -8, left: "50%", marginLeft: -8,
            boxShadow: `0 0 14px 2px ${r.c}`,
          }} />
        </span>
      ))}
      <span className="rounded-full" style={{ width: 26, height: 26, background: C.gold, boxShadow: `0 0 30px 8px ${C.gold}`, animation: "mg-pop 1.8s ease-in-out infinite" }} />
    </div>
  );
}

// ── Rocket: a rocket climbing with a colorful trail (to the moon vibe) ────────
function Rocket() {
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 800 300" preserveAspectRatio="xMidYMid slice">
      {/* stars */}
      {[[80, 60, C.gold], [200, 110, C.cyan], [700, 90, C.pink], [620, 200, C.mint], [120, 200, C.amber]].map(([x, y, c], i) => (
        <circle key={i} cx={x as number} cy={y as number} r={4} fill={c as string}
          style={{ transformOrigin: `${x}px ${y}px`, animation: `mg-pop ${1.8 + i * 0.4}s ease-in-out ${i * 0.3}s infinite` }} />
      ))}
      {/* climbing rocket group */}
      <g style={{ animation: "mg-bob 2.6s ease-in-out infinite" }}>
        {/* trail */}
        {[C.amber, C.rose, C.violet].map((c, i) => (
          <path key={i} d={`M${400 - i * 4} 240 q ${-30 - i * 10} 40 ${-10} 70`} fill="none" stroke={c} strokeWidth={8 - i * 2} strokeLinecap="round" opacity={0.7}
            style={{ animation: `mg-pop ${0.8 + i * 0.2}s ease-in-out infinite` }} />
        ))}
        {/* body */}
        <g transform="translate(380 120)">
          <path d="M20 0 C 40 20, 40 70, 20 100 C 0 70, 0 20, 20 0 Z" fill={C.violet} />
          <circle cx={20} cy={40} r={9} fill={C.cyan} />
          <path d="M0 80 L-14 110 L8 96 Z" fill={C.rose} />
          <path d="M40 80 L54 110 L32 96 Z" fill={C.rose} />
          <path d="M10 100 Q 20 130 30 100 Z" fill={C.gold} style={{ transformOrigin: "20px 100px", animation: "mg-grow 0.4s ease-in-out infinite" }} />
        </g>
      </g>
    </svg>
  );
}
