"use client";

import { useState } from "react";
import { GLOSSARY } from "@/lib/glossary";

// Wrap any jargon term: <Term id="pe">P/E</Term>
// Works on hover (desktop) and tap (mobile). Definition comes from the shared
// glossary, so it always matches the /glossary page.
export function Term({ id, children }: { id: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const entry = GLOSSARY[id];

  // If the term isn't in the glossary, render the text plainly rather than break.
  if (!entry) return <>{children}</>;

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
        className="cursor-help border-b border-dotted border-brand-400/70 text-inherit focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60"
        aria-label={`Definition: ${entry.term}`}
      >
        {children ?? entry.term}
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-0 top-full z-50 mt-1 block w-64 rounded-lg border border-white/10 bg-surface-raised p-3 text-left text-xs leading-relaxed shadow-xl"
        >
          <span className="block font-semibold text-ink">{entry.term}</span>
          <span className="mt-1 block text-ink-dim">{entry.short}</span>
          <span className="mt-1 block text-ink-dim">
            <b className="text-ink-dim">Why it matters:</b> {entry.why}
          </span>
          {entry.example && (
            <span className="mt-1 block italic text-ink-faint">e.g. {entry.example}</span>
          )}
        </span>
      )}
    </span>
  );
}
