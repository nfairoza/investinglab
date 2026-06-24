"use client";

import { useState } from "react";
import { FilePlus2 } from "lucide-react";

// ADMIN ONLY (rendered inside Source Diagnostics, gated by the parent tab + the
// API route). Manually enter a notable executive 278-T transaction. A real
// oge.gov source URL is REQUIRED — the server rejects anything else, and family
// names / addresses are rejected too (OGE privacy design).
const TX_TYPES = ["buy", "sell", "exchange", "option", "gift", "income", "holding", "unknown"];

export function ManualExecutiveEntry({ onAdded }: { onAdded?: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    personName: "", office: "", ticker: "", assetName: "",
    transactionType: "buy", transactionDate: "", disclosureDate: "", amountLabel: "", sourceUrl: "",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/power-trades/manual-record", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      const j = await r.json();
      if (!r.ok || j.error) { setMsg(`Rejected: ${j.error ?? "failed"}`); return; }
      setMsg("Added. Verified-source executive transaction saved.");
      setForm({ personName: "", office: "", ticker: "", assetName: "", transactionType: "buy", transactionDate: "", disclosureDate: "", amountLabel: "", sourceUrl: "" });
      onAdded?.();
    } catch (e) { setMsg(e instanceof Error ? e.message : "failed"); }
    finally { setBusy(false); }
  }

  const inputCls = "rounded-md border border-hairline bg-surface px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:border-brand-500 focus:outline-none";

  return (
    <div className="rounded-2xl glass p-5">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 text-sm font-semibold text-ink">
        <FilePlus2 size={15} className="text-brand-400" /> Add executive 278-T record (manual, verified source)
        <span className="ml-auto text-[11px] text-ink-faint">{open ? "hide" : "open"}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] text-ink-faint">
            For notable executive-branch transactions disclosed in OGE Form 278-T. A real{" "}
            <span className="text-ink-dim">oge.gov</span> source URL is required. Do not enter family-member
            names or addresses — they are rejected (OGE privacy design).
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input value={form.personName} onChange={set("personName")} placeholder="Official name (e.g. Scott Bessent)" className={inputCls} />
            <input value={form.office} onChange={set("office")} placeholder="Office / title (optional)" className={inputCls} />
            <input value={form.ticker} onChange={set("ticker")} placeholder="Ticker (optional)" className={inputCls} />
            <input value={form.assetName} onChange={set("assetName")} placeholder="Asset name (optional)" className={inputCls} />
            <select value={form.transactionType} onChange={set("transactionType")} className={inputCls} style={{ background: "var(--surface-solid)", color: "var(--text)" }}>
              {TX_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <input value={form.amountLabel} onChange={set("amountLabel")} placeholder="Amount range (e.g. $1,001 - $15,000)" className={inputCls} />
            <label className="text-[10px] text-ink-faint">Transaction date<input type="date" value={form.transactionDate} onChange={set("transactionDate")} className={`${inputCls} mt-0.5 w-full`} /></label>
            <label className="text-[10px] text-ink-faint">Disclosure date<input type="date" value={form.disclosureDate} onChange={set("disclosureDate")} className={`${inputCls} mt-0.5 w-full`} /></label>
          </div>
          <input value={form.sourceUrl} onChange={set("sourceUrl")} placeholder="Required: OGE document URL (https://...oge.gov/...)" className={`${inputCls} w-full`} />
          <div className="flex items-center gap-2">
            <button onClick={submit} disabled={busy} className="rounded-md border border-brand-500/50 bg-brand-500/10 px-3 py-1.5 text-xs font-medium text-brand-300 hover:bg-brand-500/20 disabled:opacity-50">
              {busy ? "Saving…" : "Add record"}
            </button>
            {msg && <span className={`text-xs ${msg.startsWith("Rejected") ? "text-rose-300" : "text-emerald-300"}`}>{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
