"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import type { ToastPayload, ToastKind } from "@/lib/toast";

// SMOOTH S4 — renders toasts fired via lib/toast's `app-toast` window event.
// Mounted once in the app frame. Auto-dismiss after 4.5s; manual close; stacked
// bottom-center above the mobile tab bar. Respects reduced-motion via the global
// animation rules (animate-fade-in).

interface ActiveToast extends ToastPayload { id: number }

const ICON: Record<ToastKind, typeof Info> = { success: CheckCircle2, error: AlertCircle, info: Info };
const TONE: Record<ToastKind, string> = {
  success: "border-emerald-500/40 text-emerald-200",
  error: "border-rose-500/40 text-rose-200",
  info: "border-hairline text-ink",
};

export function ToastHost() {
  const [toasts, setToasts] = useState<ActiveToast[]>([]);

  useEffect(() => {
    let seq = 0;
    function onToast(e: Event) {
      const detail = (e as CustomEvent<ToastPayload>).detail;
      if (!detail?.message) return;
      const id = ++seq;
      setToasts((t) => [...t, { id, message: detail.message, kind: detail.kind ?? "info" }]);
      // Auto-dismiss. Errors linger a bit longer so they're readable.
      const ms = detail.kind === "error" ? 6000 : 4500;
      window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
    }
    window.addEventListener("app-toast", onToast);
    return () => window.removeEventListener("app-toast", onToast);
  }, []);

  if (!toasts.length) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[120] flex flex-col items-center gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+5rem)] md:pb-6"
      role="region" aria-live="polite" aria-label="Notifications">
      {toasts.map((t) => {
        const Icon = ICON[t.kind ?? "info"];
        return (
          <div key={t.id}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm shadow-lg animate-fade-in ${TONE[t.kind ?? "info"]}`}
            style={{ background: "var(--surface-solid)" }}
            role={t.kind === "error" ? "alert" : "status"}>
            <Icon size={16} className="mt-0.5 shrink-0" />
            <span className="min-w-0 flex-1 text-ink">{t.message}</span>
            <button onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
              aria-label="Dismiss" className="shrink-0 text-ink-faint hover:text-ink"><X size={15} /></button>
          </div>
        );
      })}
    </div>
  );
}
