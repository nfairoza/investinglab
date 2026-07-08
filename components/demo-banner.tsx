"use client";

import useSWR from "swr";
import { Sparkles } from "lucide-react";

// Thin banner shown across the top of the app during a demo session. Reads the
// same /api/me the rest of the app uses (which returns isDemo:true for demo
// cookies) so it renders nothing for real users. Offers a clear path to sign up
// and a way to leave the demo.
export function DemoBanner() {
  const { data } = useSWR<{ isDemo?: boolean }>("/api/me");
  if (!data?.isDemo) return null;
  return (
    <div className="demo-banner" role="status">
      <span className="demo-banner-msg">
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
        You&apos;re exploring rukMoney with sample data. Changes aren&apos;t saved.
      </span>
      <span className="demo-banner-actions">
        <a href="/signup" className="demo-banner-cta">Create your account</a>
        <a href="/demo/exit" className="demo-banner-exit">Exit demo</a>
      </span>
    </div>
  );
}
