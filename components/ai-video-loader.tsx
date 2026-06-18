"use client";

import { useEffect, useRef, useState } from "react";
import { AiThinking } from "./ai-thinking";

// Ambient "AI is working" loader: a looping Veo video as a soft backdrop with
// the provider-aware AiThinking line overlaid. Honors reduced-motion (shows a
// static gradient instead), lazy-pauses when the tab is hidden, and degrades to
// a plain gradient if the video can't load. Use inside a card while AI works.
export function AiVideoLoader({ label, height = 160 }: { label?: string; height?: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [reduced, setReduced] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setReduced(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
    // Pause when the tab is hidden to save resources.
    const onVis = () => { const v = ref.current; if (!v) return; if (document.hidden) v.pause(); else v.play().catch(() => {}); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const showVideo = !reduced && !failed;

  return (
    <div className="relative overflow-hidden rounded-lg border border-hairline" style={{ height, background: "linear-gradient(135deg, var(--accent-soft), transparent 60%), var(--surface)" }}>
      {showVideo && (
        <video
          ref={ref}
          autoPlay muted loop playsInline preload="metadata"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover opacity-60"
          aria-hidden
        >
          <source src="/videos/ai-working.mp4" type="video/mp4" />
        </video>
      )}
      {/* Scrim so the overlaid text stays legible over the video */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(0deg, var(--bg) 4%, transparent 60%)" }} aria-hidden />
      <div className="absolute inset-x-0 bottom-0 p-4">
        <AiThinking label={label} />
      </div>
    </div>
  );
}
