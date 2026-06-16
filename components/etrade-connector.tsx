"use client";

import { useEffect, useState } from "react";
import type { EtradeAccount } from "@/lib/etrade/token-store";

interface Status {
  hasCredentials: boolean;
  connected: boolean;
  connectedAt: string | null;
  accounts: EtradeAccount[];
  selectedAccountIdKey: string | null;
  sandbox: boolean;
}

// E*TRADE returns accountId already masked (e.g. "XXXX1234"). Show the last 4
// so identical account descriptions can be told apart.
function accountLabel(a: EtradeAccount): string {
  const tail = (a.accountId || "").replace(/[^0-9]/g, "").slice(-4);
  const suffix = tail ? ` ••${tail}` : "";
  return `${a.accountName} (${a.accountType})${suffix}`;
}

export function EtradeConnector() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState("");

  // Env-var fields (only shown when env vars aren't set)
  const [consumerKey, setConsumerKey] = useState("");
  const [consumerSecret, setConsumerSecret] = useState("");

  // Out-of-band verification code (E*TRADE shows this after you authorize)
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [code, setCode] = useState("");

  async function refresh() {
    try {
      const r = await fetch("/api/etrade/status");
      const s = (await r.json()) as Status;
      setStatus(s);
      if (s.selectedAccountIdKey) setSelectedKey(s.selectedAccountIdKey);
    } catch {
      setStatus(null);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function saveCredentials() {
    if (!consumerKey.trim() || !consumerSecret.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      // Store in server env-equivalent via connectors key route (reusing existing infra)
      await fetch("/api/connectors/key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectorId: "etrade",
          values: {
            ETRADE_CONSUMER_KEY: consumerKey.trim(),
            ETRADE_CONSUMER_SECRET: consumerSecret.trim(),
          },
        }),
      });
      setConsumerKey("");
      setConsumerSecret("");
      await refresh();
      setMsg("Credentials saved for this session. Click 'Connect to E*TRADE' to authorize.");
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/etrade/connect");
      const j = (await r.json()) as { authorizeUrl?: string; error?: string };
      if (j.error) { setMsg(`Error: ${j.error}`); return; }
      if (j.authorizeUrl) {
        // Open E*TRADE in a new tab; user authorizes, copies the code, comes back.
        window.open(j.authorizeUrl, "_blank", "noopener");
        setAwaitingCode(true);
        setMsg("A new tab opened. Log in, click Accept, then paste the code E*TRADE shows you below.");
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed to start connection");
    } finally {
      setBusy(false);
    }
  }

  async function submitCode() {
    if (!code.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/etrade/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || j.error) { setMsg(`Error: ${j.error ?? "verification failed"}`); return; }
      setAwaitingCode(false);
      setCode("");
      await refresh();
      setMsg("Connected to E*TRADE successfully.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  async function selectAccount() {
    if (!selectedKey) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/etrade/select-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountIdKey: selectedKey }),
      });
      if (r.ok) {
        await refresh();
        setMsg("Account selected. Go to Holdings and click 'Sync from E*TRADE'.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setMsg(null);
    try {
      await fetch("/api/etrade/disconnect", { method: "POST" });
      await refresh();
      setMsg("Disconnected.");
    } finally {
      setBusy(false);
    }
  }

  const selectedAccount = status?.accounts.find((a) => a.accountIdKey === status.selectedAccountIdKey);

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-5 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-100">E*TRADE — Portfolio sync</span>
          <span className="rounded-full border border-slate-600 px-2 py-0.5 text-[10px] text-slate-400">Read-only</span>
          {status?.sandbox && (
            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300">SANDBOX</span>
          )}
        </div>
        {status?.connected ? (
          <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300">
            ● Connected
          </span>
        ) : (
          <span className="rounded-full border border-slate-600 bg-slate-800/40 px-2 py-0.5 text-[11px] text-slate-400">
            Not connected
          </span>
        )}
      </div>

      <p className="text-sm text-slate-400">
        Pull your real brokerage positions from E*TRADE — no password ever touches this app.
        You log in on E*TRADE's own site, paste back the code it gives you, then pick which account to sync.
        <span className="ml-1 text-slate-500">Tokens expire at midnight ET daily (just reconnect when that happens).</span>
      </p>

      {/* Step 1: Credentials (only shown when not yet configured) */}
      {!status?.hasCredentials && (
        <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">Step 1 — Developer credentials</div>
          <p className="text-xs text-slate-500">
            Get a free consumer key from{" "}
            <a href="https://developer.etrade.com" target="_blank" rel="noreferrer" className="text-brand-400 underline">
              developer.etrade.com
            </a>
            . Or set <code className="rounded bg-slate-800 px-1 text-slate-300">ETRADE_CONSUMER_KEY</code> and{" "}
            <code className="rounded bg-slate-800 px-1 text-slate-300">ETRADE_CONSUMER_SECRET</code> in{" "}
            <code className="rounded bg-slate-800 px-1 text-slate-300">.env.local</code> to persist across restarts.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              type="password"
              value={consumerKey}
              onChange={(e) => setConsumerKey(e.target.value)}
              placeholder="Consumer key"
              className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-brand-500 focus:outline-none"
            />
            <input
              type="password"
              value={consumerSecret}
              onChange={(e) => setConsumerSecret(e.target.value)}
              placeholder="Consumer secret"
              className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-brand-500 focus:outline-none"
            />
          </div>
          <button
            onClick={saveCredentials}
            disabled={busy || !consumerKey.trim() || !consumerSecret.trim()}
            className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            Save credentials
          </button>
        </div>
      )}

      {/* Step 2: OAuth connect (out-of-band code flow) */}
      {status?.hasCredentials && !status.connected && (
        <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">Authorize access</div>
          <p className="text-xs text-slate-500">
            Your developer key is set, so this app is registered with E*TRADE. You still need to
            <span className="text-slate-300"> log in once</span> so E*TRADE can grant this app read access to
            <span className="text-slate-300"> your</span> account — the consumer key only identifies the app, not you.
          </p>
          {status?.sandbox && (
            <p className="text-xs text-amber-400/80">
              Sandbox mode — uses test account data, not your real portfolio. To switch to production, remove <code className="rounded bg-slate-800 px-1">ETRADE_SANDBOX=true</code> from <code className="rounded bg-slate-800 px-1">.env.local</code>.
            </p>
          )}

          {!awaitingCode ? (
            <>
              <p className="text-xs text-slate-500">
                Clicking below opens E*TRADE in a <span className="text-slate-300">new tab</span>. Log in, click
                <span className="text-slate-300"> Accept</span>, and E*TRADE will show you a short verification code.
                Come back here and paste it.
              </p>
              <button onClick={connect} disabled={busy}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50">
                {busy ? "Opening…" : "Connect to E*TRADE"}
              </button>
            </>
          ) : (
            <>
              <p className="text-xs text-slate-500">
                Paste the verification code E*TRADE showed you after you clicked Accept:
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitCode()}
                  placeholder="Verification code"
                  className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-brand-500 focus:outline-none"
                />
                <button onClick={submitCode} disabled={busy || !code.trim()}
                  className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50">
                  {busy ? "Verifying…" : "Verify & connect"}
                </button>
                <button onClick={() => { setAwaitingCode(false); setCode(""); setMsg(null); }}
                  className="rounded-md border border-slate-700 px-3 py-2 text-xs text-slate-400 hover:bg-slate-800">
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Step 3: Pick account */}
      {status?.connected && !status.selectedAccountIdKey && (
        <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">Step 3 — Select account to sync</div>
          <select
            value={selectedKey}
            onChange={(e) => setSelectedKey(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 focus:border-brand-500 focus:outline-none"
          >
            <option value="">Pick an account…</option>
            {status.accounts.map((a) => (
              <option key={a.accountIdKey} value={a.accountIdKey}>
                {accountLabel(a)}
              </option>
            ))}
          </select>
          <button
            onClick={selectAccount}
            disabled={busy || !selectedKey}
            className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            Use this account
          </button>
        </div>
      )}

      {/* Connected + account selected */}
      {status?.connected && status.selectedAccountIdKey && (
        <div className="space-y-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium text-emerald-200">
                {selectedAccount ? accountLabel(selectedAccount) : status.selectedAccountIdKey}
              </div>
            </div>
            {status.connectedAt && (
              <div className="text-xs text-slate-500">
                Connected {new Date(status.connectedAt).toLocaleTimeString()}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href="/holdings"
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
            >
              Go to Holdings → Sync
            </a>
            {/* Account change */}
            <select
              value={selectedKey}
              onChange={(e) => setSelectedKey(e.target.value)}
              className="rounded-md border border-slate-700 bg-slate-900/60 px-2 py-1.5 text-xs text-slate-300 focus:border-brand-500 focus:outline-none"
            >
              {status.accounts.map((a) => (
                <option key={a.accountIdKey} value={a.accountIdKey}>
                  {accountLabel(a)}
                </option>
              ))}
            </select>
            {selectedKey !== status.selectedAccountIdKey && (
              <button onClick={selectAccount} disabled={busy} className="rounded-md border border-slate-700 px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50">
                Switch account
              </button>
            )}
            <button onClick={disconnect} disabled={busy} className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800 disabled:opacity-50">
              Disconnect
            </button>
          </div>
        </div>
      )}

      {/* Expired token state — reconnect button */}
      {status?.connected && msg?.includes("expired") && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-200">
          Session expired (E*TRADE tokens reset at midnight ET).{" "}
          <button onClick={connect} className="underline font-medium hover:text-amber-100">
            Reconnect now
          </button>
        </div>
      )}

      {msg && (
        <p className={`text-sm ${msg.toLowerCase().includes("error") || msg.includes("failed") ? "text-rose-400" : "text-slate-400"}`}>
          {msg}
        </p>
      )}

      <p className="text-[11px] text-slate-600">
        This app never sees your E*TRADE password. OAuth tokens are stored in server memory only and expire at midnight ET.
        No trading, order placement, or account modification is possible through this connector.
      </p>
    </div>
  );
}
