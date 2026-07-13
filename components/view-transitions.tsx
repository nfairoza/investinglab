"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { recordNavIntent } from "@/lib/nav-timing";

// SMOOTH S3 — View Transitions as PROGRESSIVE ENHANCEMENT.
//
// Where the browser supports document.startViewTransition (and the user hasn't
// asked for reduced motion), same-origin in-app navigations crossfade (150ms, see
// globals.css) instead of hard-swapping. Everywhere else this is a total no-op —
// the click falls through to Next's normal <Link> handling.
//
// Implementation: a single capturing click listener finds the nearest internal
// <a>, and if VT is available, wraps router.push in startViewTransition. We are
// deliberately conservative about which clicks we touch (primary button, no
// modifier keys, no target=_blank, no download, no hash-only, same origin) so we
// never hijack a click Next/the browser should handle itself.
export function ViewTransitions() {
  const router = useRouter();

  useEffect(() => {
    const doc = document as Document & { startViewTransition?: (cb: () => void) => void };
    const hasVT = typeof doc.startViewTransition === "function";
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)");

    function onClick(e: MouseEvent) {
      // Only plain left-clicks with no modifiers — let ctrl/cmd/middle-click open
      // tabs, etc., untouched.
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const el = (e.target as HTMLElement | null)?.closest("a");
      if (!el) return;
      const a = el as HTMLAnchorElement;
      // Skip anything that isn't a same-origin, same-tab, real in-app navigation.
      if (a.target && a.target !== "_self") return;
      if (a.hasAttribute("download")) return;
      if (a.origin !== window.location.origin) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      // Same URL (hash-only or identical) → nothing to transition/measure.
      if (a.href === window.location.href) return;

      const url = a.pathname + a.search + a.hash;
      // Stamp the navigation intent for nav-timing (S5) regardless of whether we
      // take over the click — this is the "click" moment we measure to.
      recordNavIntent(a.pathname);

      // Crossfade is a pure enhancement: only intercept when VT is supported AND
      // reduced-motion is off. Otherwise let Next's <Link> handle the click (intent
      // is already stamped, so timing still works).
      if (!hasVT || reduce?.matches) return;

      e.preventDefault();
      try {
        doc.startViewTransition!(() => { router.push(url); });
      } catch {
        router.push(url);
      }
    }

    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, [router]);

  return null;
}
