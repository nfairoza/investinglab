"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Theme stability guard. The theme is ONLY ever changed by the toggle button
// (which writes localStorage 'theme'). This re-asserts that saved theme on the
// <html> element on every route change and when the tab regains focus, so
// nothing — stale markup, an errant class write, OS-preference changes — can
// flip the theme out from under the user. It never reads the OS preference, so
// it can't introduce erratic light/dark swaps.
export function ThemeGuard() {
  const pathname = usePathname();

  useEffect(() => {
    const apply = () => {
      try {
        const saved = localStorage.getItem("theme");
        if (saved !== "light" && saved !== "dark") return; // leave whatever init set
        const d = document.documentElement;
        if (!d.classList.contains(saved)) {
          d.classList.remove("light", "dark");
          d.classList.add(saved);
          d.style.colorScheme = saved;
        }
      } catch { /* ignore */ }
    };
    apply();
    window.addEventListener("focus", apply);
    return () => window.removeEventListener("focus", apply);
  }, [pathname]);

  return null;
}
