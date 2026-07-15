"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { useEntitlement } from "@/components/use-entitlement";
import { minPlanFor, type Feature } from "@/lib/billing/entitlements";

// BILL B2 — <Locked feature="…"> renders children when entitled, else the real
// card blurred/locked with value copy + an upgrade CTA. While billing is off,
// useEntitlement returns true for everyone → children render, no lock. Server
// routes still enforce; this is display-only.
export function Locked({ feature, title, children }: { feature: Feature; title?: string; children: React.ReactNode }) {
  const entitled = useEntitlement(feature);
  if (entitled) return <>{children}</>;

  const plan = minPlanFor(feature);
  return (
    <div className="relative overflow-hidden rounded-2xl border border-hairline">
      <div className="pointer-events-none select-none blur-sm saturate-50 opacity-60" aria-hidden>
        {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-bg/60 p-4 text-center backdrop-blur-[2px]">
        <Lock size={20} className="text-brand-400" />
        <div className="text-sm font-semibold text-ink">{title ?? "A Premium feature"}</div>
        <p className="max-w-xs text-xs text-ink-dim">Upgrade to {plan === "pro" ? "Pro" : "Premium"} to unlock this. Your data stays yours either way.</p>
        <Link href="/pricing" className="btn-gold mt-1 rounded-md px-3 py-1.5 text-xs">Start free trial</Link>
      </div>
    </div>
  );
}
