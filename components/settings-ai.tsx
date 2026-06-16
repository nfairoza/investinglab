"use client";

import { useEffect, useState } from "react";

type Status = { configured: boolean; source: "runtime" | "env" | "none"; model: string };

const MODELS = ["claude-sonnet-4-6", "claude-opus-4-8", "claude-haiku-4-5-20251001"];

export function SettingsAI() {
  const [status, setStatus] = useState<Status | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(MODELS[0]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() {
    setMsg(null);
    try {
      const r = await fetch("/api/ai/status");
      const s = (await r.json()) as Status;
      setStatus(s);
      if (s.model) setModel(s.model);
    } catch {
      setStatus(null);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/ai/key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, model }),
      });
      if (!r.ok) {
        setMsg("Could not save — is the key blank?");
      } else {
        setStatus((await r.json()) as Status);
        setApiKey(""); // don't keep the key in the field
        setMsg("Saved for this session.");
      }
    } catch {
      setMsg("Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/ai/key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clear: true }),
      });
      setStatus((await r.json()) as Status);
      setMsg("Runtime key cleared.");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMsg("Testing…");
    try {
      const r = await fetch("/api/ai/test", { method: "POST" });
      const j = (await r.json()) as { ok: boolean; model?: string; error?: string };
      setMsg(j.ok ? `Connection OK (${j.model}).` : `Test failed: ${j.error ?? "unknown error"}`);
    } catch (e) {
      setMsg(`Test failed: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-4 rounded-xl border border-slate-800 bg-slate-900/40 p-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">AI research (Claude)</h2>
        <p className="mt-1 text-sm text-slate-400">
          The research engine uses Anthropic&apos;s Claude. Add a key here to enable it.
        </p>
      </div>

      {/* Status line */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-slate-400">Status:</span>
        {status?.configured ? (
          <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
            Configured ({status.source === "env" ? "from environment" : "this session"})
          </span>
        ) : (
          <span className="rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-rose-300">
            No key set
          </span>
        )}
        <button onClick={refresh} className="ml-1 rounded-md border border-slate-700 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800">
          Refresh
        </button>
      </div>

      <div className="space-y-2">
        <label className="block text-sm text-slate-300">Claude API key</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-ant-…"
          className="w-full rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-brand-500 focus:outline-none"
        />
        <label className="block pt-1 text-sm text-slate-300">Model</label>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="w-full rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 focus:border-brand-500 focus:outline-none"
        >
          {MODELS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={save}
          disabled={busy || !apiKey.trim()}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          Save key
        </button>
        <button
          onClick={test}
          disabled={busy || !status?.configured}
          className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
        >
          Test connection
        </button>
        <button
          onClick={clear}
          disabled={busy || status?.source !== "runtime"}
          className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-400 hover:bg-slate-800 disabled:opacity-50"
        >
          Clear
        </button>
        {msg && <span className="text-sm text-slate-400">{msg}</span>}
      </div>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-relaxed text-amber-200/90">
        <span className="font-medium">Security note.</span> A key entered here is sent to your own
        server and held in memory for this dev session only — it is never stored in the browser and
        does not survive a restart. For a real deployment, set{" "}
        <code className="rounded bg-slate-800 px-1">ANTHROPIC_API_KEY</code> in your environment
        (e.g. <code className="rounded bg-slate-800 px-1">.env.local</code> or Vercel) instead, and
        keep keys server-side. Get a key from the Anthropic Console.
      </div>
    </div>
  );
}
