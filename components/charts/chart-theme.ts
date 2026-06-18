"use client";

import { useEffect, useState } from "react";

// Reads the active theme's chart colors from CSS variables so Recharts re-themes
// with the light/dark toggle. Re-reads when the <html> class changes.
export interface ChartTheme {
  grid: string;
  axis: string;
  positive: string;
  negative: string;
  accent: string;
  neutral: string;
  tooltipBg: string;
  hairline: string;
  text: string;
}

function read(): ChartTheme {
  if (typeof window === "undefined") {
    return { grid: "#ffffff10", axis: "#6b7568", positive: "#5FA873", negative: "#C97A6D", accent: "#E4C264", neutral: "#9AA89B", tooltipBg: "rgba(12,16,13,0.96)", hairline: "#ffffff14", text: "#ECEAE2" };
  }
  const s = getComputedStyle(document.documentElement);
  const v = (n: string, f: string) => (s.getPropertyValue(n).trim() || f);
  return {
    grid: v("--chart-grid", "#ffffff10"),
    axis: v("--chart-axis", "#6b7568"),
    positive: v("--positive", "#5FA873"),
    negative: v("--negative", "#C97A6D"),
    accent: v("--accent", "#E4C264"),
    neutral: v("--neutral", "#9AA89B"),
    tooltipBg: v("--tooltip-bg", "rgba(12,16,13,0.96)"),
    hairline: v("--hairline-strong", "#ffffff14"),
    text: v("--text", "#ECEAE2"),
  };
}

export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(read);
  useEffect(() => {
    setTheme(read());
    const obs = new MutationObserver(() => setTheme(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return theme;
}

// Shared Recharts tooltip style from the active theme.
export function tooltipStyle(t: ChartTheme): React.CSSProperties {
  return { background: t.tooltipBg, border: `1px solid ${t.hairline}`, borderRadius: 10, fontSize: 12, color: t.text };
}
