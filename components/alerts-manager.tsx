"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { Bell, BellRing, X, Sparkles, Plus, RefreshCw, Clock } from "lucide-react";
import { TickerInput } from "./ticker-input";
import { evaluateAlert, describeAlert, formatTriggerValue, needsScore, isExpired, describeExpiry, type AlertContext } from "@/lib/alerts/evaluate";
import type { Alert } from "@/lib/db";
import type { DataResult, Quote } from "@/lib/providers/types";
import type { StockScore } from "@/lib/scoring/score";

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// Don't refire an alert that's been sitting past its threshold. Once triggered,
// stay quiet for this window unless the condition clears and re-crosses.
const REARM_MS = 6 * 60 * 60 * 1000; // 6h

const TYPE_LABEL: Record<Alert["type"], string> = {
  price: "Price target",
  dayMove: "Day move %",
  earnings: "Earnings soon",
  score: "Score change",
};

export function AlertsManager() {
  const { data: alerts = [], mutate } = useSWR<Alert[]>("/api/alerts", fetchJson, { revalidateOnFocus: true });

  // ── Add form ────────────────────────────────────────────────────────────────
  const [symbol, setSymbol] = useState("");
  const [type, setType] = useState<Alert["type"]>("price");
  const [direction, setDirection] = useState<"above" | "below">("below");
  const [price, setPrice] = useState("");
  const [movePct, setMovePct] = useState("5");
  const [withinDays, setWithinDays] = useState("7");
  const [scoreOp, setScoreOp] = useState<"above" | "below">("below");
  const [scoreValue, setScoreValue] = useState("40");
  const [note, setNote] = useState("");
  const [expiresAt, setExpiresAt] = useState(""); // datetime-local string; "" = persistent
  const [addErr, setAddErr] = useState<string | null>(null);

  // ── Notification permission ──────────────────────────────────────────────────
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | "unsupported">("default");
  useEffect(() => {
    if (typeof Notification === "undefined") setNotifPerm("unsupported");
    else setNotifPerm(Notification.permission);
  }, []);
  async function askNotif() {
    if (typeof Notification === "undefined") return;
    const p = await Notification.requestPermission();
    setNotifPerm(p);
  }

  async function addAlert() {
    const s = symbol.trim().toUpperCase();
    if (!s) { setAddErr("Pick a ticker first."); return; }
    setAddErr(null);
    const payload: Record<string, unknown> = { symbol: s, type, note: note.trim() || undefined };
    if (type === "price") { payload.direction = direction; payload.price = Number(price); }
    if (type === "dayMove") payload.movePct = Number(movePct);
    if (type === "earnings") payload.withinDays = Number(withinDays);
    if (type === "score") { payload.scoreOp = scoreOp; payload.scoreValue = Number(scoreValue); }
    if (expiresAt) {
      const t = new Date(expiresAt).getTime();
      if (!Number.isFinite(t)) { setAddErr("Invalid expiry date/time."); return; }
      if (t <= Date.now()) { setAddErr("Expiry must be in the future."); return; }
      payload.expiresAt = new Date(t).toISOString();
    }

    const r = await fetch("/api/alerts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) { const j = await r.json().catch(() => ({})); setAddErr((j as any).error ?? "Could not add alert."); return; }
    setSymbol(""); setPrice(""); setNote(""); setExpiresAt("");
    mutate();
  }

  async function toggle(a: Alert) {
    await fetch("/api/alerts", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: a.id, enabled: !a.enabled }),
    });
    mutate();
  }
  async function remove(id: string) {
    await fetch(`/api/alerts?id=${id}`, { method: "DELETE" });
    mutate();
  }

  // ── AI-suggested alerts ───────────────────────────────────────────────────────
  interface Suggestion {
    symbol: string; type: Alert["type"]; reason?: string;
    direction?: "above" | "below"; price?: number; movePct?: number;
    withinDays?: number; scoreOp?: "above" | "below"; scoreValue?: number;
    expiresAt?: string; // ISO; present when the AI deems the alert time-bound
  }
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const ranSuggest = useRef(false);

  const sigOf = (s: Suggestion) => `${s.symbol}-${s.type}-${s.price ?? ""}${s.movePct ?? ""}${s.withinDays ?? ""}${s.scoreValue ?? ""}`;
  // Hide suggestions that already match an existing alert.
  function alreadyExists(s: Suggestion): boolean {
    return alerts.some((a) => a.symbol === s.symbol && a.type === s.type);
  }

  async function loadSuggestions(force = false) {
    setSuggestBusy(true);
    try {
      if (!force) {
        const cached = await fetch("/api/alerts/suggest").then((r) => r.json());
        if (cached.cached && Array.isArray(cached.suggestions)) { setSuggestions(cached.suggestions); return; }
        if (cached.data?.suggestions) setSuggestions(cached.data.suggestions);
      }
      const fresh = await fetch("/api/alerts/suggest", { method: "POST" }).then((r) => r.json());
      if (Array.isArray(fresh.suggestions)) setSuggestions(fresh.suggestions);
    } catch { /* ignore — manual add still works */ }
    finally { setSuggestBusy(false); }
  }

  useEffect(() => {
    if (ranSuggest.current) return;
    ranSuggest.current = true;
    loadSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function approve(s: Suggestion) {
    const payload: Record<string, unknown> = { symbol: s.symbol, type: s.type, note: s.reason };
    if (s.type === "price") { payload.direction = s.direction ?? "below"; payload.price = s.price; }
    if (s.type === "dayMove") payload.movePct = s.movePct;
    if (s.type === "earnings") payload.withinDays = s.withinDays;
    if (s.type === "score") { payload.scoreOp = s.scoreOp ?? "below"; payload.scoreValue = s.scoreValue; }
    // Pass through the AI's time-bound expiry only if it's still in the future.
    if (s.expiresAt) {
      const t = new Date(s.expiresAt).getTime();
      if (Number.isFinite(t) && t > Date.now()) payload.expiresAt = new Date(t).toISOString();
    }
    await fetch("/api/alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setDismissed((d) => new Set(d).add(sigOf(s)));
    mutate();
  }

  const visibleSuggestions = suggestions.filter((s) => !dismissed.has(sigOf(s)) && !alreadyExists(s));

  // ── Polling engine ────────────────────────────────────────────────────────────
  // Re-read the latest alerts inside the interval via a ref so we don't restart
  // the timer on every list change.
  const alertsRef = useRef<Alert[]>(alerts);
  alertsRef.current = alerts;
  const [lastCheck, setLastCheck] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function runCheck() {
      if (typeof document !== "undefined" && document.hidden) return; // skip when tab hidden
      const list = alertsRef.current.filter((a) => a.enabled && !isExpired(a));
      if (!list.length) return;

      // Gather the per-symbol data we need, once per symbol.
      const symbols = Array.from(new Set(list.map((a) => a.symbol)));
      const wantScore = new Set(list.filter(needsScore).map((a) => a.symbol));
      const ctxBySym = new Map<string, AlertContext>();

      await Promise.all(symbols.map(async (sym) => {
        const ctx: AlertContext = { price: null, changePct: null, earningsInDays: null, score: null };
        try {
          const q = await fetch(`/api/quote?symbol=${sym}`).then((r) => r.json()) as DataResult<Quote>;
          ctx.price = q.data?.price ?? null;
          ctx.changePct = q.data?.changePct ?? null;
        } catch { /* leave nulls */ }
        if (wantScore.has(sym)) {
          try {
            const s = await fetch(`/api/score?symbol=${sym}`).then((r) => r.json()) as DataResult<StockScore>;
            ctx.score = s.data?.overall ?? null;
            ctx.earningsInDays = s.data?.earningsInDays ?? null;
          } catch { /* leave nulls */ }
        }
        ctxBySym.set(sym, ctx);
      }));

      if (cancelled) return;
      const nowMs = Date.now();
      let any = false;

      for (const a of list) {
        const ctx = ctxBySym.get(a.symbol);
        if (!ctx) continue;
        const res = evaluateAlert(a, ctx);
        if (!res) continue;
        const recently = a.lastTriggeredAt ? nowMs - new Date(a.lastTriggeredAt).getTime() < REARM_MS : false;
        if (res.triggered && !recently) {
          any = true;
          // Persist the trigger.
          await fetch("/api/alerts", {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: a.id, trigger: { value: res.value, at: new Date(nowMs).toISOString() } }),
          }).catch(() => {});
          // Desktop notification (if allowed).
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            try {
              new Notification(`${a.symbol} alert`, {
                body: `${describeAlert(a)} — now ${formatTriggerValue(a, res.value)}`,
                tag: a.id, // collapse repeats
              });
            } catch { /* some browsers throw if not from a user gesture */ }
          }
        }
      }
      setLastCheck(new Date(nowMs).toISOString());
      if (any) mutate();
    }

    runCheck(); // run once on mount
    const id = setInterval(runCheck, 60_000);
    return () => { cancelled = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-expire time-bound alerts ─────────────────────────────────────────────
  // While the page is open, drop alerts whose expiry has passed so they "go away"
  // without a manual refresh. The server also prunes them on read.
  useEffect(() => {
    let cancelled = false;
    async function prune() {
      const expired = alertsRef.current.filter((a) => isExpired(a));
      if (!expired.length) return;
      await Promise.all(expired.map((a) => fetch(`/api/alerts?id=${a.id}`, { method: "DELETE" }).catch(() => {})));
      if (!cancelled) mutate();
    }
    prune();
    const id = setInterval(prune, 30_000);
    return () => { cancelled = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hide any not-yet-pruned expired alerts from every view.
  const liveAlerts = alerts.filter((a) => !isExpired(a));

  // Triggered feed: alerts that have fired, newest first.
  const triggered = [...liveAlerts]
    .filter((a) => a.lastTriggeredAt)
    .sort((a, b) => (b.lastTriggeredAt! > a.lastTriggeredAt! ? 1 : -1));

  const inputCls = "w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-brand-500 focus:outline-none";

  return (
    <div className="space-y-5">
      {/* Notification banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl glass p-4">
        <div className="flex items-center gap-2 text-sm text-ink-dim">
          <Bell size={16} className="text-accent" />
          Alerts are checked every ~60s <span className="font-medium text-ink">while this app is open</span> in your browser. They won&apos;t fire when it&apos;s closed.
        </div>
        {notifPerm === "granted" ? (
          <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-700 dark:text-emerald-300">● Desktop notifications on</span>
        ) : notifPerm === "unsupported" ? (
          <span className="text-xs text-ink-faint">Desktop notifications not supported here</span>
        ) : (
          <button onClick={askNotif} className="rounded-md border border-brand-500/50 bg-brand-500/10 px-3 py-1.5 text-xs font-medium text-brand-300 hover:bg-brand-500/20">
            Enable desktop notifications
          </button>
        )}
      </div>

      {/* Add form */}
      <div className="rounded-xl glass p-4">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {(Object.keys(TYPE_LABEL) as Alert["type"][]).map((t) => (
            <button key={t} onClick={() => setType(t)}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                type === t ? "tab-active" : "border-hairline text-ink-dim hover:bg-surface"
              }`}>
              {TYPE_LABEL[t]}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
          <TickerInput value={symbol} onChange={setSymbol} onSelect={setSymbol} placeholder="Search ticker…" className={inputCls} />

          {/* Type-specific inputs */}
          {type === "price" && (
            <div className="flex gap-2">
              <select value={direction} onChange={(e) => setDirection(e.target.value as "above" | "below")}
                className={inputCls} style={{ background: "var(--surface-solid)", color: "var(--text)" }}>
                <option value="below">drops to / below</option>
                <option value="above">rises to / above</option>
              </select>
              <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="$ price" inputMode="decimal" className={inputCls} />
            </div>
          )}
          {type === "dayMove" && (
            <input value={movePct} onChange={(e) => setMovePct(e.target.value)} placeholder="move %" inputMode="decimal" className={inputCls} />
          )}
          {type === "earnings" && (
            <input value={withinDays} onChange={(e) => setWithinDays(e.target.value)} placeholder="within N days" inputMode="numeric" className={inputCls} />
          )}
          {type === "score" && (
            <div className="flex gap-2">
              <select value={scoreOp} onChange={(e) => setScoreOp(e.target.value as "above" | "below")}
                className={inputCls} style={{ background: "var(--surface-solid)", color: "var(--text)" }}>
                <option value="below">falls to / below</option>
                <option value="above">rises to / above</option>
              </select>
              <input value={scoreValue} onChange={(e) => setScoreValue(e.target.value)} placeholder="0–100" inputMode="numeric" className={inputCls} />
            </div>
          )}

          <button onClick={addAlert} className="btn-gold rounded-md px-4 py-2 text-sm">Add alert</button>
        </div>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className={`${inputCls} mt-2`} />
        {/* Optional expiry — leave blank for a persistent alert */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-[11px] text-ink-faint">
            <Clock size={12} /> Expires (optional)
          </label>
          <input
            type="datetime-local"
            value={expiresAt}
            min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
            onChange={(e) => setExpiresAt(e.target.value)}
            className={`${inputCls} max-w-[15rem]`}
            style={{ colorScheme: "dark" }}
          />
          {expiresAt && (
            <button onClick={() => setExpiresAt("")} className="text-[11px] text-ink-faint hover:text-rose-300">Clear · keep persistent</button>
          )}
        </div>
        {addErr && <p className="mt-2 text-[11px] text-rose-400">{addErr}</p>}
      </div>

      {/* Active alerts */}
      <div>
        <h2 className="mb-2 text-sm font-medium text-ink-dim">Active alerts ({liveAlerts.length})</h2>
        {liveAlerts.length === 0 ? (
          <div className="rounded-lg border border-hairline bg-surface p-6 text-center text-sm text-ink-faint">
            No alerts yet. Add one above — e.g. notify me when AMD drops below $480.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl glass">
            <div className="divide-y divide-hairline">
              {liveAlerts.map((a) => {
                const tripped = a.lastTriggeredAt && Date.now() - new Date(a.lastTriggeredAt).getTime() < REARM_MS;
                const expiry = describeExpiry(a);
                return (
                  <div key={a.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                    <span className={tripped ? "text-accent" : "text-ink-faint"}>
                      {tripped ? <BellRing size={15} /> : <Bell size={15} />}
                    </span>
                    <a href={`/research?symbol=${a.symbol}`} className="w-16 shrink-0 font-semibold text-brand-300 hover:underline">{a.symbol}</a>
                    <span className="w-28 shrink-0 text-[11px] uppercase tracking-wide text-ink-faint">{TYPE_LABEL[a.type]}</span>
                    <span className="min-w-0 flex-1 truncate text-ink-dim">
                      {describeAlert(a)}
                      {a.note && <span className="ml-2 text-xs text-ink-faint">· {a.note}</span>}
                    </span>
                    {expiry && (
                      <span title={`Auto-removes ${new Date(a.expiresAt!).toLocaleString()}`}
                        className="hidden shrink-0 items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300 sm:inline-flex">
                        <Clock size={10} /> {expiry}
                      </span>
                    )}
                    {a.lastTriggeredAt && (
                      <span className="hidden shrink-0 text-[11px] text-ink-faint sm:inline">
                        last: {formatTriggerValue(a, a.lastValue ?? 0)} · {new Date(a.lastTriggeredAt).toLocaleString()}
                      </span>
                    )}
                    {/* enable toggle */}
                    <button onClick={() => toggle(a)} title={a.enabled ? "Pause" : "Resume"}
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        a.enabled ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                  : "border border-hairline text-ink-faint"
                      }`}>
                      {a.enabled ? "ON" : "OFF"}
                    </button>
                    <button onClick={() => remove(a.id)} title="Remove" className="shrink-0 rounded p-1 text-ink-faint hover:text-rose-300"><X size={14} /></button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {lastCheck && <p className="mt-1.5 text-[11px] text-ink-faint">Last checked {new Date(lastCheck).toLocaleTimeString()}.</p>}
      </div>

      {/* AI-suggested alerts */}
      <div className="rounded-xl glass p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Sparkles size={15} className="text-accent" /> Suggested by AI
          </div>
          <button onClick={() => loadSuggestions(true)} disabled={suggestBusy}
            className="flex items-center gap-1.5 text-xs text-accent hover:underline disabled:opacity-50">
            <RefreshCw size={11} className={suggestBusy ? "animate-spin" : ""} /> {suggestBusy ? "Thinking…" : "Refresh"}
          </button>
        </div>
        <p className="mt-0.5 text-[11px] text-ink-faint">
          AI scans your holdings, watchlist & the market for the alerts worth setting. Approve the ones you want.
        </p>
        {suggestBusy && visibleSuggestions.length === 0 ? (
          <p className="mt-3 text-sm text-ink-faint">Researching what to watch…</p>
        ) : visibleSuggestions.length === 0 ? (
          <p className="mt-3 text-sm text-ink-faint">No new suggestions right now — you&apos;re covered.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {visibleSuggestions.map((s) => (
              <div key={sigOf(s)} className="flex items-center gap-3 rounded-lg border border-hairline bg-surface px-3 py-2 text-sm">
                <span className="w-14 shrink-0 font-semibold text-brand-300">{s.symbol}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-ink-dim">
                    {describeAlert(s as unknown as Alert)}
                    {s.expiresAt && describeExpiry(s) && (
                      <span title={`Auto-removes ${new Date(s.expiresAt).toLocaleString()}`}
                        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                        <Clock size={10} /> {describeExpiry(s)}
                      </span>
                    )}
                  </div>
                  {s.reason && <div className="truncate text-[11px] text-ink-faint">{s.reason}</div>}
                </div>
                <button onClick={() => approve(s)} title="Add this alert"
                  className="flex shrink-0 items-center gap-1 rounded-md border border-brand-500/50 bg-brand-500/10 px-2.5 py-1 text-[11px] font-medium text-brand-300 hover:bg-brand-500/20">
                  <Plus size={12} /> Add
                </button>
                <button onClick={() => setDismissed((d) => new Set(d).add(sigOf(s)))} title="Dismiss"
                  className="shrink-0 rounded p-1 text-ink-faint hover:text-rose-300"><X size={13} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Triggered feed */}
      {triggered.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-medium text-ink-dim">Recently triggered</h2>
          <div className="space-y-2">
            {triggered.slice(0, 12).map((a) => (
              <div key={`fired-${a.id}`} className="flex items-center gap-3 rounded-lg border border-hairline bg-surface px-3 py-2 text-sm">
                <BellRing size={14} className="shrink-0 text-accent" />
                <span className="font-semibold text-brand-300">{a.symbol}</span>
                <span className="min-w-0 flex-1 truncate text-ink-dim">{describeAlert(a)} — hit {formatTriggerValue(a, a.lastValue ?? 0)}</span>
                <span className="shrink-0 text-[11px] text-ink-faint">{new Date(a.lastTriggeredAt!).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] text-ink-faint">
        Saved to <code>data/db.json</code>. Alerts evaluate live FMP data while the app is open. Research and educational analysis, not financial advice.
      </p>
    </div>
  );
}
