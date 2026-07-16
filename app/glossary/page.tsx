import { GLOSSARY } from "@/lib/glossary";

export const metadata = { title: "Glossary" };

export default function GlossaryPage() {
  const entries = Object.entries(GLOSSARY).sort((a, b) => a[1].term.localeCompare(b[1].term));
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-3xl font-semibold text-ink">Glossary</h1>
      <p className="mt-1 text-sm text-ink-dim">
        Every term the app uses, in plain English. These same definitions power the hover tooltips.
      </p>
      <dl className="mt-6 space-y-4">
        {entries.map(([id, e]) => (
          <div key={e.term} id={id} className="scroll-mt-24 rounded-xl glass p-4">
            <dt className="font-semibold text-ink">{e.term}</dt>
            <dd className="mt-1 text-sm text-ink-dim">{e.short}</dd>
            <dd className="mt-1 text-sm text-ink-dim">
              <span className="font-medium text-ink-dim">Why it matters:</span> {e.why}
            </dd>
            {e.example && <dd className="mt-1 text-sm italic text-ink-faint">e.g. {e.example}</dd>}
          </div>
        ))}
      </dl>
    </div>
  );
}
