"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Landmark, PlusCircle, Bell, TrendingUp, X } from "lucide-react";

// Global "+ / Connect" action sheet. Opened by window event "open-add" (mobile
// bottom-bar + and the desktop top-bar button). Bottom sheet on phones, centered
// dialog on desktop. Routes to the right place per action — no blank "+" page.
export function AddSheet() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("open-add", onOpen);
    return () => window.removeEventListener("open-add", onOpen);
  }, []);

  if (!open) return null;

  const go = (href: string) => { setOpen(false); router.push(href); };

  const actions = [
    { icon: Landmark, label: "Connect an account", desc: "Bank, card, brokerage or retirement (Plaid)", onClick: () => go("/settings") },
    { icon: PlusCircle, label: "Add manual asset / liability", desc: "House, car, private loan…", onClick: () => go("/networth") },
    { icon: TrendingUp, label: "Add a holding", desc: "Track a stock you own", onClick: () => go("/holdings") },
    { icon: Bell, label: "Create an alert", desc: "Price, earnings or score triggers", onClick: () => go("/alerts") },
  ];

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div
        className="relative w-full max-w-md rounded-t-2xl border border-hairline sm:rounded-2xl animate-fade-in-up"
        style={{ background: "var(--surface-solid)", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
          <span className="text-sm font-semibold text-ink">Add or connect</span>
          <button onClick={() => setOpen(false)} className="text-ink-faint hover:text-ink"><X size={18} /></button>
        </div>
        <div className="p-2">
          {actions.map((a) => (
            <button key={a.label} onClick={a.onClick}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-surface">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-hairline bg-surface">
                <a.icon size={16} className="text-brand-400" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">{a.label}</span>
                <span className="block text-xs text-ink-faint">{a.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
