"use client";

import { useState } from "react";
import useSWR from "swr";
import { FileText, FileSpreadsheet, FileDown } from "lucide-react";
import type { Holding, WatchItem, JournalEntry, Alert, CashState } from "@/lib/db";

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

type DatasetKey = "holdings" | "watchlist" | "journal" | "alerts";
const DATASETS: { key: DatasetKey; label: string }[] = [
  { key: "holdings", label: "Holdings" },
  { key: "watchlist", label: "Watchlist" },
  { key: "journal", label: "Journal" },
  { key: "alerts", label: "Alerts" },
];

export function ReportsManager() {
  const { data: holdings = [] } = useSWR<Holding[]>("/api/holdings?withBrokers=1", fetchJson);
  const { data: watchlist = [] } = useSWR<WatchItem[]>("/api/watchlist", fetchJson);
  const { data: journal = [] } = useSWR<JournalEntry[]>("/api/journal", fetchJson);
  const { data: alerts = [] } = useSWR<Alert[]>("/api/alerts", fetchJson);
  const { data: cash } = useSWR<CashState>("/api/cash", fetchJson);

  const [selected, setSelected] = useState<Record<DatasetKey, boolean>>({
    holdings: true, watchlist: true, journal: false, alerts: false,
  });
  const [busy, setBusy] = useState<null | "pdf" | "xlsx">(null);

  function toggle(k: DatasetKey) { setSelected((s) => ({ ...s, [k]: !s[k] })); }

  // Build the table rows for a dataset (headers + body) used by both exporters.
  function tableFor(k: DatasetKey): { head: string[]; rows: (string | number)[][] } {
    if (k === "holdings") return {
      head: ["Ticker", "Shares", "Avg cost", "Source"],
      rows: holdings.map((h) => [h.symbol, h.shares, h.avgCost ? `$${h.avgCost.toFixed(2)}` : "—", h.source ?? "manual"]),
    };
    if (k === "watchlist") return {
      head: ["Ticker", "Ideal buy", "AI action", "Note"],
      rows: watchlist.map((w) => [w.symbol, w.idealBuy != null ? `$${w.idealBuy.toFixed(2)}` : "—", w.aiAction ?? "—", w.note ?? ""]),
    };
    if (k === "journal") return {
      head: ["Ticker", "Side", "Status", "Entry reason"],
      rows: journal.map((j) => [j.symbol, j.side, j.status, j.entryReason ?? ""]),
    };
    return {
      head: ["Ticker", "Type", "Condition", "Enabled"],
      rows: alerts.map((a) => [a.symbol, a.type,
        a.type === "price" ? `${a.direction === "below" ? "≤" : "≥"} $${a.price ?? "—"}`
          : a.type === "dayMove" ? `±${a.movePct ?? "—"}%`
          : a.type === "earnings" ? `within ${a.withinDays ?? "—"}d`
          : `score ${a.scoreOp === "above" ? "≥" : "≤"} ${a.scoreValue ?? "—"}`,
        a.enabled ? "yes" : "no"]),
    };
  }

  const chosen = DATASETS.filter((d) => selected[d.key]);
  const dateStr = new Date().toLocaleString();
  const totalValueNote = `${holdings.length} holdings · cash $${(cash?.amount ?? 0).toLocaleString()}`;

  async function exportPdf() {
    setBusy("pdf");
    try {
      const { default: jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF();
      doc.setFontSize(18); doc.text("rukMoney — Portfolio Report", 14, 18);
      doc.setFontSize(10); doc.setTextColor(120);
      doc.text(`Generated ${dateStr}`, 14, 25);
      doc.text(totalValueNote, 14, 30);
      let y = 40;
      for (const d of chosen) {
        const t = tableFor(d.key);
        doc.setFontSize(13); doc.setTextColor(20); doc.text(d.label, 14, y);
        autoTable(doc, {
          head: [t.head], body: t.rows.length ? t.rows : [["No data", "", "", ""]],
          startY: y + 3, styles: { fontSize: 9 }, headStyles: { fillColor: [22, 210, 126] },
        });
        // @ts-expect-error autotable adds lastAutoTable
        y = (doc.lastAutoTable?.finalY ?? y + 20) + 12;
      }
      doc.setFontSize(8); doc.setTextColor(150);
      doc.text("Research and educational analysis, not financial advice.", 14, doc.internal.pageSize.getHeight() - 10);
      doc.save(`portfolio-report-${Date.now()}.pdf`);
    } finally { setBusy(null); }
  }

  async function exportXlsx() {
    setBusy("xlsx");
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      // Summary sheet
      const summary = [
        ["rukMoney — Portfolio Report"],
        ["Generated", dateStr],
        ["Holdings", holdings.length],
        ["Cash", cash?.amount ?? 0],
        [],
        ["Research and educational analysis, not financial advice."],
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Summary");
      for (const d of chosen) {
        const t = tableFor(d.key);
        const aoa = [t.head, ...t.rows];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), d.label.slice(0, 31));
      }
      XLSX.writeFile(wb, `portfolio-report-${Date.now()}.xlsx`);
    } finally { setBusy(null); }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl glass p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <FileDown size={16} className="text-accent" /> Build a report
        </div>
        <p className="mt-1 text-xs text-ink-faint">Pick what to include, then download as PDF or Excel. Your data only.</p>

        <div className="mt-4 flex flex-wrap gap-2">
          {DATASETS.map((d) => (
            <button key={d.key} onClick={() => toggle(d.key)}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                selected[d.key] ? "tab-active" : "border-hairline text-ink-dim hover:bg-surface"
              }`}>
              {d.label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={exportPdf} disabled={busy !== null || !chosen.length}
            className="flex items-center gap-1.5 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm font-medium text-rose-300 hover:bg-rose-500/20 disabled:opacity-50">
            <FileText size={15} /> {busy === "pdf" ? "Building…" : "Download PDF"}
          </button>
          <button onClick={exportXlsx} disabled={busy !== null || !chosen.length}
            className="flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50">
            <FileSpreadsheet size={15} /> {busy === "xlsx" ? "Building…" : "Download Excel"}
          </button>
        </div>
        {!chosen.length && <p className="mt-2 text-[11px] text-amber-400">Select at least one dataset.</p>}
      </div>

      {/* Live preview of what's included */}
      <div className="rounded-xl glass p-5">
        <div className="text-sm font-semibold text-ink">Preview</div>
        <p className="mt-0.5 text-[11px] text-ink-faint">{totalValueNote} · generated {dateStr}</p>
        <div className="mt-3 space-y-4">
          {chosen.map((d) => {
            const t = tableFor(d.key);
            return (
              <div key={d.key}>
                <div className="mb-1 text-xs font-medium text-ink-dim">{d.label} ({t.rows.length})</div>
                <div className="overflow-x-auto rounded-lg border border-hairline">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface text-ink-faint">
                      <tr>{t.head.map((h) => <th key={h} className="px-2 py-1.5">{h}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {t.rows.slice(0, 8).map((r, i) => (
                        <tr key={i}>{r.map((c, j) => <td key={j} className="px-2 py-1.5 text-ink-dim">{c}</td>)}</tr>
                      ))}
                      {t.rows.length === 0 && <tr><td className="px-2 py-1.5 text-ink-faint" colSpan={t.head.length}>No data</td></tr>}
                    </tbody>
                  </table>
                </div>
                {t.rows.length > 8 && <p className="mt-1 text-[10px] text-ink-faint">+{t.rows.length - 8} more in the export</p>}
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[11px] text-ink-faint">Reports contain only your account&apos;s data. Research and educational analysis, not financial advice.</p>
    </div>
  );
}
