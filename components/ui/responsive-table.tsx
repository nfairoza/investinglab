"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

// M0.2 — one primitive, two renderings. On md+ it's a real <table> (dense,
// scannable). Below md each row becomes a stacked card: a primary line
// (title + trailing value) and a secondary line (meta), with an optional
// chevron that navigates or expands. Wide tables stop needing overflow-x-auto
// on phones — the horizontal scroll that made them unusable one-handed.
//
// Callers describe columns once (for the desktop table) and provide a compact
// card shape per row (for phones), so a single data map drives both.

export interface Column<T> {
  key: string;
  header: string;
  align?: "left" | "right";
  className?: string;
  cell: (row: T) => React.ReactNode;
}

export interface CardShape {
  title: React.ReactNode;       // primary line, left
  value?: React.ReactNode;      // primary line, right (e.g. $ value)
  meta?: React.ReactNode;       // secondary line (qty · category · date)
  href?: string;                // tap → navigate
  onClick?: () => void;         // tap → expand/act (ignored if href set)
}

export function ResponsiveTable<T>({
  rows,
  columns,
  card,
  rowKey,
  tableClassName,
  emptyText,
}: {
  rows: T[];
  columns: Column<T>[];
  card: (row: T) => CardShape;
  rowKey: (row: T, i: number) => string;
  tableClassName?: string;
  emptyText?: string;
}) {
  if (!rows.length && emptyText) {
    return <div className="rounded-lg border border-hairline bg-surface p-6 text-center text-sm text-ink-faint">{emptyText}</div>;
  }

  return (
    <>
      {/* Desktop / tablet: real table */}
      <div className="hidden overflow-x-auto rounded-2xl border border-hairline md:block">
        <table className={tableClassName || "w-full text-left text-sm"}>
          <thead className="bg-surface text-xs uppercase tracking-wide text-ink-faint">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={`px-3 py-2 ${c.align === "right" ? "text-right" : ""} ${c.className ?? ""}`}>{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.map((r, i) => (
              <tr key={rowKey(r, i)} className="hover:bg-surface">
                {columns.map((c) => (
                  <td key={c.key} className={`px-3 py-2 ${c.align === "right" ? "text-right tabular-nums" : ""} ${c.className ?? ""}`}>{c.cell(r)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phone: stacked cards, ≥44px tall, chevron affordance */}
      <div className="space-y-2 md:hidden">
        {rows.map((r, i) => {
          const c = card(r);
          const inner = (
            <div className="flex min-h-[44px] items-center gap-3 rounded-xl border border-hairline bg-surface p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium text-ink">{c.title}</span>
                  {c.value != null && <span className="shrink-0 text-sm tabular-nums text-ink">{c.value}</span>}
                </div>
                {c.meta != null && <div className="mt-0.5 truncate text-xs text-ink-faint">{c.meta}</div>}
              </div>
              {(c.href || c.onClick) && <ChevronRight size={16} className="shrink-0 text-ink-faint" />}
            </div>
          );
          if (c.href) return <Link key={rowKey(r, i)} href={c.href} className="block active:opacity-80">{inner}</Link>;
          if (c.onClick) return <button key={rowKey(r, i)} onClick={c.onClick} className="block w-full text-left active:opacity-80">{inner}</button>;
          return <div key={rowKey(r, i)}>{inner}</div>;
        })}
      </div>
    </>
  );
}
