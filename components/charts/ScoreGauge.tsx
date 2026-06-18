"use client";

// Compact radial score gauge (0–100) with a label. Pure SVG, theme-token colors.
export function ScoreGauge({ score, label, size = 120 }: { score: number; label?: string; size?: number }) {
  const r = size / 2 - 9;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const color = score >= 70 ? "var(--positive)" : score >= 45 ? "var(--accent)" : "var(--negative)";
  return (
    <div className="flex items-center gap-4">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--hairline-strong)" strokeWidth={8} />
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={8}
            strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
            style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.16,1,0.3,1)" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono text-3xl font-semibold tnum text-ink">{Math.round(score)}</span>
        </div>
      </div>
      {label && <div className="text-sm text-ink-dim">{label}</div>}
    </div>
  );
}
