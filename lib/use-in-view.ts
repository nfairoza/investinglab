"use client";

import { useEffect, useRef, useState } from "react";

// Tiny IntersectionObserver hook for scroll-reveals + "animate on first view"
// (MO2 — keeps 90% of motion CSS-first, no animation library). Fires once by
// default (`once`), then disconnects. Returns a ref to attach and whether the
// element has entered the viewport. Reduced-motion callers can ignore `inView`
// and just render final state.
export function useInView<T extends Element = HTMLDivElement>(
  { once = true, rootMargin = "0px 0px -10% 0px", threshold = 0.15 }: { once?: boolean; rootMargin?: string; threshold?: number } = {},
): { ref: React.RefObject<T>; inView: boolean } {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // SSR/old browsers: reveal immediately rather than hide content.
    if (typeof IntersectionObserver === "undefined") { setInView(true); return; }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setInView(true);
            if (once) io.disconnect();
          } else if (!once) {
            setInView(false);
          }
        }
      },
      { rootMargin, threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [once, rootMargin, threshold]);

  return { ref, inView };
}
