"use client";

import { useEffect, useRef, useState } from "react";

// Animate a number from its previous value to the target with an ease-out ramp.
// Honors prefers-reduced-motion (jumps straight to the value). Used by the
// Overview KPI tiles so the big numbers count up when they first land / change,
// which reads as "alive" without being distracting.
export function useCountUp(target: number, durationMs = 650): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(0);

  useEffect(() => {
    const reduce = typeof window !== "undefined"
      && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !Number.isFinite(target) || fromRef.current === target) {
      fromRef.current = target;
      setValue(target);
      return;
    }
    const from = fromRef.current;
    const delta = target - from;
    startRef.current = 0;

    const step = (ts: number) => {
      if (!startRef.current) startRef.current = ts;
      const t = Math.min(1, (ts - startRef.current) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // cubic ease-out
      setValue(from + delta * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
      else { fromRef.current = target; setValue(target); }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, durationMs]);

  return value;
}
