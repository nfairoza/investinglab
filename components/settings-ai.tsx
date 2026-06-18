"use client";

import { useEffect, useState } from "react";

type Status = {
  configured: boolean;
  source: "runtime" | "env" | "none";
  model: string;
  hasClaude?: boolean;
  hasGemini?: boolean;
  strategy?: string;
};

// id = exact Anthropic model id; label = friendly name + when to use it.
const MODELS: { id: string; label: string }[] = [
  { id: "claude-opus-4-8", label: "Opus 4.8 — most capable (deepest analysis, higher cost)" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6 — balanced (fast + strong, default)" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5 — fastest + cheapest" },
];

const STRATEGIES: { id: string; label: string; desc: string }[] = [
  { id: "smart", label: "Smart (auto)", desc: "Opus 4.8 leads deep analysis (predictions, Portfolio Doctor, research, congress); Gemini handles big-context & casual chat. Each falls back to the other. Best accuracy where it matters, lowest cost elsewhere." },
  { id: "quality", label: "Quality (always best)", desc: "Always use the most capable model for every task. Highest accuracy, highest cost." },
  { id: "economy", label: "Economy (cost-saving)", desc: "Prefer cheap/fast models; only escalate the heaviest analysis to Opus." },
];

export function SettingsAI() {
  const [status, setStatus] = useState<Status | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(MODELS[0].id);
  const [strategy, setStrategy] = useState("smart");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function applyStrategy(next: string) {
    setStrategy(next);
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/ai/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy: next }),
      });
      if (r.ok) {
        setStatus((await r.json()) as Status);
        setMsg(`Routing strategy set to ${next}.`);
      } else {
        setMsg("Could not set strategy.");
      }
    } catch {
      setMsg("Could not set strategy.");
    } finally {
      setBusy(false);
    }
  }

  async function applyModel(next: string) {
    setModel(next);
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/ai/model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: next }),
      });
      if (r.ok) {
        setStatus((await r.json()) as Status);
        setMsg(`Model set to ${next} for this session.`);
      } else {
        setMsg("Could not set model.");
      }
    } catch {
      setMsg("Could not set model.");
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    setMsg(null);
    try {
      const r = await fetch("/api/ai/status");
      const s = (await r.json()) as Status;
      setStatus(s);
      if (s.model) setModel(s.model);
      if (s.strategy) setStrategy(s.strategy);
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
    <div className="max-w-2xl space-y-4 rounded-xl glass p-5">
      <div>
        <h2 className="text-lg font-semibold text-ink">AI research (Claude)</h2>
        <p className="mt-1 text-sm text-ink-dim">
          The research engine uses Anthropic&apos;s Claude. Add a key here to enable it.
        </p>
      </div>

      {/* Status line */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-ink-dim">Status:</span>
        {status?.configured ? (
          <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
            Configured ({status.source === "env" ? "from environment" : "this session"})
          </span>
        ) : (
          <span className="rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-rose-300">
            No key set
          </span>
        )}
        <button onClick={refresh} className="ml-1 rounded-md border border-white/10 px-2 py-0.5 text-xs text-ink-dim hover:bg-surface-raised">
          Refresh
        </button>
      </div>

      {/* Model picker — applies immediately, independent of the key */}
      <div className="space-y-2">
        <label className="block text-sm text-ink-dim">Model</label>
        <select
          value={model}
          onChange={(e) => applyModel(e.target.value)}
          disabled={busy}
          className="w-full rounded-md border border-white/10 bg-black/25 px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none disabled:opacity-50"
        >
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        {status?.model && (
          <p className="text-xs text-ink-faint">
            Active model: <span className="text-brand-300">{status.model}</span>
            {" "}— the manual default. In Smart mode the router may pick a different model per task (below).
          </p>
        )}
      </div>

      {/* Routing strategy — task-aware model selection */}
      <div className="space-y-2 border-t border-white/10 pt-4">
        <label className="block text-sm text-ink-dim">Routing strategy</label>
        <select
          value={strategy}
          onChange={(e) => applyStrategy(e.target.value)}
          disabled={busy}
          className="w-full rounded-md border border-white/10 bg-black/25 px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none disabled:opacity-50"
        >
          {STRATEGIES.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
        <p className="text-xs text-ink-faint">{STRATEGIES.find((s) => s.id === strategy)?.desc}</p>
        {/* Provider availability — routing needs both for full benefit */}
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className={`rounded-full border px-2 py-0.5 ${status?.hasClaude ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-hairline-strong text-ink-faint"}`}>
            Claude {status?.hasClaude ? "✓" : "— no key"}
          </span>
          <span className={`rounded-full border px-2 py-0.5 ${status?.hasGemini ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-hairline-strong text-ink-faint"}`}>
            Gemini {status?.hasGemini ? "✓" : "— no key"}
          </span>
          {!(status?.hasClaude && status?.hasGemini) && (
            <span className="text-amber-300/80">Add both keys for full smart routing + fallback.</span>
          )}
        </div>
      </div>

      {/* API key */}
      <div className="space-y-2 border-t border-white/10 pt-4">
        <label className="block text-sm text-ink-dim">Claude API key</label>
        <p className="text-xs text-ink-faint">
          Already set via <code className="rounded bg-surface-raised px-1">.env.local</code>? You can leave this blank.
          Enter a key here only to override it for this session.
        </p>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-ant-…"
          className="w-full rounded-md border border-white/10 bg-black/25 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-brand-500 focus:outline-none"
        />
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
          className="rounded-md border border-white/10 px-3 py-1.5 text-sm text-ink hover:bg-surface-raised disabled:opacity-50"
        >
          Test connection
        </button>
        <button
          onClick={clear}
          disabled={busy || status?.source !== "runtime"}
          className="rounded-md border border-white/10 px-3 py-1.5 text-sm text-ink-dim hover:bg-surface-raised disabled:opacity-50"
        >
          Clear
        </button>
        {msg && <span className="text-sm text-ink-dim">{msg}</span>}
      </div>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-relaxed text-amber-200/90">
        <span className="font-medium">Security note.</span> A key entered here is sent to your own
        server and held in memory for this dev session only — it is never stored in the browser and
        does not survive a restart. For a real deployment, set{" "}
        <code className="rounded bg-surface-raised px-1">ANTHROPIC_API_KEY</code> in your environment
        (e.g. <code className="rounded bg-surface-raised px-1">.env.local</code> or Vercel) instead, and
        keep keys server-side. Get a key from the Anthropic Console.
      </div>
    </div>
  );
}
