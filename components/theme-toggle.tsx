"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

type Theme = "light" | "dark";

function current(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("light") ? "light" : "dark";
}

// Accessible light/dark switch. Applies instantly by swapping the <html> class
// and persists to localStorage. The no-flash init script in layout sets the
// initial class before paint; this just toggles + remembers.
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>("dark");
  useEffect(() => setTheme(current()), []);

  function apply(next: Theme) {
    const d = document.documentElement;
    d.classList.remove("light", "dark");
    d.classList.add(next);
    d.style.colorScheme = next;
    try { localStorage.setItem("theme", next); } catch { /* ignore */ }
    setTheme(next);
  }

  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      onClick={() => apply(next)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className={`group flex items-center gap-2 rounded-md border border-hairline text-ink-dim hover:text-ink hover:bg-surface transition-colors ${
        compact ? "h-8 w-8 justify-center" : "px-3 py-2 text-sm"
      }`}
    >
      {theme === "dark" ? <Moon size={15} /> : <Sun size={15} />}
      {!compact && <span className="capitalize">{theme}</span>}
    </button>
  );
}
