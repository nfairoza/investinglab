"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";

// =============================================================================
// Primitive component library — the single component system for the rebuild.
// All visuals reference semantic theme tokens (light + dark aware).
// =============================================================================

// ── GlassCard ────────────────────────────────────────────────────────────────
export function GlassCard({
  children, className, hover = false, as: As = "div", ...rest
}: { children: React.ReactNode; className?: string; hover?: boolean; as?: any } & React.HTMLAttributes<HTMLElement>) {
  return (
    <As className={clsx("glass p-5", hover && "card-hover", className)} {...rest}>
      {children}
    </As>
  );
}

// ── SectionHeader (page template title block) ────────────────────────────────
export function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-ink-dim">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// "What should I look at first?" callout — consistent across pages.
export function FirstLook({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border px-3 py-2.5 text-sm" style={{ borderColor: "var(--hairline-gold)", background: "var(--accent-soft)", color: "var(--text)" }}>
      <span className="font-medium text-accent">What to look at first — </span>
      <span className="text-ink-dim">{children}</span>
    </div>
  );
}

// ── Badge ────────────────────────────────────────────────────────────────────
type Tone = "neutral" | "positive" | "negative" | "accent";
const toneStyle: Record<Tone, React.CSSProperties> = {
  neutral: { borderColor: "var(--hairline-strong)", color: "var(--text-dim)" },
  positive: { borderColor: "var(--positive)", background: "var(--positive-soft)", color: "var(--positive)" },
  negative: { borderColor: "var(--negative)", background: "var(--negative-soft)", color: "var(--negative)" },
  accent: { borderColor: "var(--hairline-gold)", background: "var(--accent-soft)", color: "var(--accent)" },
};
export function Badge({ children, tone = "neutral", className }: { children: React.ReactNode; tone?: Tone; className?: string }) {
  return <span className={clsx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", className)} style={toneStyle[tone]}>{children}</span>;
}

// ── Button ───────────────────────────────────────────────────────────────────
export function Button({
  children, variant = "default", className, ...rest
}: { children: React.ReactNode; variant?: "default" | "gold" | "ghost" } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base = "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    gold: "btn-gold",
    default: "border border-hairline-strong text-ink hover:bg-surface",
    ghost: "text-ink-dim hover:text-ink hover:bg-surface",
  };
  return <button className={clsx(base, variants[variant], className)} {...rest}>{children}</button>;
}

// ── Input ────────────────────────────────────────────────────────────────────
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx("input-luxe w-full px-3 py-2 text-sm", props.className)} />;
}

// ── Skeleton ─────────────────────────────────────────────────────────────────
export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded-md", className)} style={{ background: "var(--surface-raised)" }} />;
}

// ── EmptyState (botanical) ───────────────────────────────────────────────────
export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-hairline px-6 py-12 text-center" style={{ background: "var(--surface)" }}>
      <Blossom className="mb-3 h-10 w-10 opacity-50" />
      <p className="text-sm font-medium text-ink">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-xs text-ink-dim">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ── ChartFrame: wraps a chart with title/caption/badge + unavailable state ────
export function ChartFrame({
  title, caption, badge, timestamp, unavailable, unavailableNote, children, className,
}: {
  title: string; caption?: string; badge?: React.ReactNode; timestamp?: React.ReactNode;
  unavailable?: boolean; unavailableNote?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <GlassCard hover className={className}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-ink">{title}</div>
          {caption && <div className="mt-0.5 text-xs text-ink-dim">{caption}</div>}
        </div>
        {badge}
      </div>
      {unavailable ? (
        <div className="mt-4 flex h-48 flex-col items-center justify-center gap-2 rounded-md border border-hairline text-center" style={{ background: "var(--surface)" }}>
          <Blossom className="h-8 w-8 opacity-40" />
          <p className="text-xs text-ink-dim">{unavailableNote ?? "Live data unavailable."}</p>
        </div>
      ) : (
        <div className="mt-3">{children}</div>
      )}
      {timestamp && <div className="mt-2">{timestamp}</div>}
    </GlassCard>
  );
}

// ── CountUp: animates a number to its value (reduced-motion aware) ────────────
export function CountUp({ value, decimals = 0, prefix = "", suffix = "", className, duration = 900 }: {
  value: number; decimals?: number; prefix?: string; suffix?: string; className?: string; duration?: number;
}) {
  const [display, setDisplay] = useState(value || 0);
  const raf = useRef<number>();
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // No animation when reduced-motion, non-finite, or the tab is hidden
    // (rAF is paused in background tabs — would otherwise stick at the start).
    if (reduce || !Number.isFinite(value) || (typeof document !== "undefined" && document.hidden)) {
      setDisplay(value || 0); return;
    }
    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplay(from + (value - from) * eased);
      if (t < 1) raf.current = requestAnimationFrame(tick);
      else setDisplay(value); // guarantee exact final value
    };
    raf.current = requestAnimationFrame(tick);
    // Safety: if rAF hasn't progressed shortly, snap to the value.
    const fallback = setTimeout(() => setDisplay((d) => (d === 0 && value !== 0 ? value : d)), 400);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); clearTimeout(fallback); };
  }, [value, duration]);
  return <span className={clsx("font-mono tnum", className)}>{prefix}{display.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}</span>;
}

// ── ScrollReveal: fades children in on first viewport entry ───────────────────
export function ScrollReveal({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { el.classList.add("is-visible"); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { setTimeout(() => el.classList.add("is-visible"), delay); io.unobserve(el); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [delay]);
  return <div ref={ref} className={clsx("reveal", className)}>{children}</div>;
}

// ── Tabs: one themed tab component, reused everywhere ─────────────────────────
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (id: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={clsx("rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
            t.id === value ? "text-ink" : "border-hairline text-ink-dim hover:bg-surface")}
          style={t.id === value ? { borderColor: "var(--hairline-gold)", background: "var(--accent-soft)" } : undefined}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── Botanical line-art blossom (SVG motif, currentColor) ──────────────────────
// rukMoney brand mark — the RM + growth-arrow monogram (teal→green) from the
// logo set. Kept named "Blossom" so existing call sites need no change.
// eslint-disable-next-line @next/next/no-img-element
export function Blossom({ className }: { className?: string }) {
  return <img src="/brand/rm-icon.svg" alt="rukMoney" className={className} aria-hidden />;
}
