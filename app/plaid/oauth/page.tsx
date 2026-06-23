"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlaidLink } from "react-plaid-link";

// Plaid OAuth landing page. After a user authenticates at their bank's site,
// the bank redirects back here (must match PLAID_REDIRECT_URI in Plaid + Vercel).
// We resume the SAME Link session using the stored link_token + this full URL,
// finish exchange, then return to Settings.
export default function PlaidOAuthPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    try {
      const t = localStorage.getItem("plaid_link_token");
      if (t) setToken(t);
      else setErr("Link session expired. Please start again from Settings.");
    } catch {
      setErr("Couldn't resume the connection. Please try again from Settings.");
    }
  }, []);

  const onSuccess = useCallback(async (public_token: string) => {
    try {
      await fetch("/api/plaid/exchange", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ public_token }),
      });
    } finally {
      try { localStorage.removeItem("plaid_link_token"); } catch { /* ignore */ }
      router.replace("/settings");
    }
  }, [router]);

  const onExit = useCallback(() => {
    try { localStorage.removeItem("plaid_link_token"); } catch { /* ignore */ }
    router.replace("/settings");
  }, [router]);

  const { open, ready } = usePlaidLink({
    token: token ?? "",
    // The bank appended its OAuth state to this URL; hand the full URL back to Link.
    receivedRedirectUri: typeof window !== "undefined" ? window.location.href : undefined,
    onSuccess,
    onExit,
  });

  // Auto-resume Link as soon as it's ready.
  useEffect(() => {
    if (token && ready) open();
  }, [token, ready, open]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-hairline border-t-brand-500" />
      <p className="text-sm text-ink-dim">{err ?? "Finishing your bank connection…"}</p>
      {err && (
        <button onClick={() => router.replace("/settings")} className="btn-gold rounded-lg px-4 py-2 text-sm">
          Back to Settings
        </button>
      )}
    </div>
  );
}
