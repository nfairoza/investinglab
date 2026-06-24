"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Landmark, Home, Car, Gem, FileText, Bell, X, ChevronRight, ArrowLeft } from "lucide-react";

// Global "+ / Connect" action sheet. Opened by window event "open-add".
// Step 1: pick Connect (the recommended path) or a manual item.
// Step 2: manual items each have their OWN card (house, car, valuables, loan…),
// deep-linking to /networth?add=<type> which opens a pre-typed form. Manual
// items live in their own table — they never muddy connected-account balances,
// and the net-worth engine de-dupes so a synced E*TRADE position isn't double
// counted against a manual one.
export function AddSheet() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"main" | "manual">("main");
  const router = useRouter();

  useEffect(() => {
    const onOpen = () => { setStep("main"); setOpen(true); };
    window.addEventListener("open-add", onOpen);
    return () => window.removeEventListener("open-add", onOpen);
  }, []);

  if (!open) return null;

  const close = () => setOpen(false);
  const go = (href: string) => { setOpen(false); router.push(href); };

  // Each manual card maps to a manual_items type (asset or liability).
  const manualAssets = [
    { icon: Home, label: "Home / real estate", desc: "Primary home, rental, land", type: "real_estate" },
    { icon: Car, label: "Vehicle", desc: "Car, motorcycle, boat", type: "vehicle" },
    { icon: Gem, label: "Valuables / other asset", desc: "Jewelry, collectibles, cash elsewhere", type: "other_asset" },
  ];
  const manualLiabilities = [
    { icon: FileText, label: "Loan", desc: "Auto, student, personal loan", type: "loan" },
    { icon: FileText, label: "Mortgage", desc: "Home loan balance", type: "mortgage" },
    { icon: FileText, label: "Other debt", desc: "Anything you owe", type: "other_liability" },
  ];

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={close} />
      <div
        className="relative w-full max-w-md rounded-t-2xl border border-hairline sm:rounded-2xl animate-fade-in-up"
        style={{ background: "var(--surface-solid)", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
          <div className="flex items-center gap-2">
            {step === "manual" && (
              <button onClick={() => setStep("main")} className="text-ink-faint hover:text-ink" aria-label="Back"><ArrowLeft size={16} /></button>
            )}
            <span className="text-sm font-semibold text-ink">{step === "main" ? "Add or connect" : "Add a manual item"}</span>
          </div>
          <button onClick={close} className="text-ink-faint hover:text-ink"><X size={18} /></button>
        </div>

        {step === "main" ? (
          <div className="p-3 space-y-3">
            {/* Recommended: connect real data */}
            <button onClick={() => go("/settings")}
              className="flex w-full items-center gap-3 rounded-xl border border-brand-500/30 bg-brand-500/[0.06] p-4 text-left transition-colors hover:bg-brand-500/10">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ background: "var(--accent-soft)" }}>
                <Landmark size={18} className="text-brand-400" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">Connect an account <span className="rounded-full bg-brand-500/20 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-brand-300">Recommended</span></span>
                <span className="block text-xs text-ink-faint">Bank, card, brokerage or retirement — live balances via Plaid</span>
              </span>
              <ChevronRight size={16} className="shrink-0 text-ink-faint" />
            </button>

            {/* Manual items (own step) */}
            <button onClick={() => setStep("manual")}
              className="flex w-full items-center gap-3 rounded-xl border border-hairline p-4 text-left transition-colors hover:bg-surface">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-hairline bg-surface">
                <Home size={18} className="text-ink-dim" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">Add something manually</span>
                <span className="block text-xs text-ink-faint">House, car, valuables, or a loan — tracked separately</span>
              </span>
              <ChevronRight size={16} className="shrink-0 text-ink-faint" />
            </button>

            {/* Alerts */}
            <button onClick={() => go("/alerts")}
              className="flex w-full items-center gap-3 rounded-xl border border-hairline p-4 text-left transition-colors hover:bg-surface">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-hairline bg-surface">
                <Bell size={18} className="text-ink-dim" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">Create an alert</span>
                <span className="block text-xs text-ink-faint">Price, earnings or score triggers</span>
              </span>
              <ChevronRight size={16} className="shrink-0 text-ink-faint" />
            </button>
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto p-3">
            <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint">Assets</div>
            <div className="space-y-1.5">
              {manualAssets.map((a) => <ManualRow key={a.type} {...a} onClick={() => go(`/networth?add=${a.type}`)} />)}
            </div>
            <div className="px-1 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint">Liabilities</div>
            <div className="space-y-1.5">
              {manualLiabilities.map((a) => <ManualRow key={a.type} {...a} onClick={() => go(`/networth?add=${a.type}`)} />)}
            </div>
            <p className="px-1 pt-3 text-[11px] text-ink-faint">Manual items are kept separate from your connected accounts, so real balances stay clean and nothing is double-counted.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ManualRow({ icon: Icon, label, desc, onClick }: { icon: typeof Home; label: string; desc: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-hairline bg-surface">
        <Icon size={16} className="text-brand-400" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">{label}</span>
        <span className="block text-xs text-ink-faint">{desc}</span>
      </span>
      <ChevronRight size={15} className="shrink-0 text-ink-faint" />
    </button>
  );
}
