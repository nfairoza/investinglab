"use client";

import { useEffect, useState } from "react";

interface Status {
  cryptoConfigured: boolean;
  stocksConnected: boolean;
  stocksConnectedAt: string | null;
}

export function RobinhoodConnector() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // crypto key fields
  const [apiKey, setApiKey] = useState("");
  const [privKey, setPrivKey] = useState("");

  // stocks login fields
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [mfaStep, setMfaStep] = useState(false);
  const [code, setCode] = useState("");

  async function refresh() {
    try {
      const r = await fetch("/api/robinhood/status");
      setStatus((await r.json()) as Status);
    } catch { setStatus(null); }
  }
  useEffect(() => { refresh(); }, []);

  async function saveCrypto() {
    if (!apiKey.trim() || !privKey.trim()) return;
    setBusy(true); setMsg(null);
    try {
      await fetch("/api/connectors/key", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectorId: "robinhood_crypto", values: {
          ROBINHOOD_CRYPTO_API_KEY: apiKey.trim(), ROBINHOOD_CRYPTO_PRIVATE_KEY: privKey.trim() } }),
      });
      setApiKey(""); setPrivKey("");
      await refresh();
      setMsg("Crypto credentials saved. Sync from the Holdings tab.");
    } finally { setBusy(false); }
  }

  async function login() {
    if (!user.trim() || !pass) return;
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/robinhood/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user.trim(), password: pass }),
      });
      const j = await r.json();
      if (j.ok) { setPass(""); await refresh(); setMsg("Connected to Robinhood (stocks)."); }
      else if (j.challenge) { setMfaStep(true); setMsg("Robinhood texted you a code. Enter it below."); }
      else if (j.mfaRequired || j.workflowId) { setMfaStep(true); setMsg("Enter the code from your authenticator app."); }
      else setMsg(`Error: ${j.error ?? "login failed"}`);
    } finally { setBusy(false); }
  }

  async function submitMfa() {
    if (!code.trim()) return;
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/robinhood/mfa", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const j = await r.json();
      if (j.ok) { setMfaStep(false); setCode(""); setPass(""); await refresh(); setMsg("Connected to Robinhood (stocks)."); }
      else setMsg(`Error: ${j.error ?? "invalid code"}`);
    } finally { setBusy(false); }
  }

  async function disconnect() {
    setBusy(true);
    try { await fetch("/api/robinhood/disconnect", { method: "POST" }); await refresh(); setMsg("Stocks disconnected."); }
    finally { setBusy(false); }
  }

  const input = "w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-brand-500 focus:outline-none";

  return (
    <div className="card-hover rounded-2xl glass p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-ink">Robinhood — portfolio sync</span>
        <span className="rounded-full border border-hairline px-2 py-0.5 text-[10px] text-ink-dim">Read-only</span>
      </div>

      {/* ── Crypto (official API) ── */}
      <div className="rounded-xl border border-hairline bg-surface p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-ink">Crypto — official API</span>
          {status?.cryptoConfigured
            ? <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300">Configured</span>
            : <span className="rounded-full border border-hairline-strong px-2 py-0.5 text-[11px] text-ink-dim">Not set</span>}
        </div>
        <p className="text-xs text-ink-faint">
          Robinhood&apos;s <span className="text-ink-dim">official, supported</span> crypto API — no password.
          Create credentials at Robinhood (web) → Account → Crypto → API. Paste the API key + base64 private key.
        </p>
        <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Crypto API key" className={input} />
        <input type="password" value={privKey} onChange={(e) => setPrivKey(e.target.value)} placeholder="Base64 private key" className={input} />
        <button onClick={saveCrypto} disabled={busy || !apiKey.trim() || !privKey.trim()}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50">
          Save crypto credentials
        </button>
      </div>

      {/* ── Stocks (unofficial login) ── */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-ink">Stocks — login (unofficial)</span>
          {status?.stocksConnected
            ? <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300">● Connected</span>
            : <span className="rounded-full border border-hairline-strong px-2 py-0.5 text-[11px] text-ink-dim">Not connected</span>}
        </div>
        <p className="text-xs text-amber-200/80">
          ⚠ Robinhood has no official stocks API. This logs in with your password via their private API —
          it violates Robinhood&apos;s Terms of Service and they may suspend your account. Use at your own risk.
          Your password is sent to your own server only, used once to get a token, and not stored.
        </p>

        {status?.stocksConnected ? (
          <button onClick={disconnect} disabled={busy} className="rounded-md border border-hairline px-3 py-1.5 text-sm text-ink-dim hover:bg-surface-raised">
            Disconnect stocks
          </button>
        ) : !mfaStep ? (
          <>
            <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="Robinhood email/username" className={input} />
            <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Password" className={input} />
            <button onClick={login} disabled={busy || !user.trim() || !pass}
              className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50">
              {busy ? "Logging in…" : "Log in to Robinhood"}
            </button>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <input value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitMfa()}
              placeholder="Verification code" className="rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-brand-500 focus:outline-none" />
            <button onClick={submitMfa} disabled={busy || !code.trim()} className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50">
              {busy ? "Verifying…" : "Verify"}
            </button>
            <button onClick={() => { setCode(""); login(); }} disabled={busy || !pass} className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink-dim hover:bg-surface-raised disabled:opacity-50" title="Robinhood will send a new code">
              Resend code
            </button>
            <button onClick={() => { setMfaStep(false); setCode(""); }} className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink-dim hover:bg-surface-raised">Cancel</button>
          </div>
        )}
      </div>

      <p className="text-xs text-ink-faint">After connecting, go to <a href="/holdings" className="text-brand-400 underline">Holdings</a> and use Sync from Robinhood.</p>
      {msg && <p className={`text-sm ${msg.toLowerCase().includes("error") ? "text-rose-400" : "text-ink-dim"}`}>{msg}</p>}
    </div>
  );
}
