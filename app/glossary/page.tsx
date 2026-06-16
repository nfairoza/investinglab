import { GLOSSARY } from "@/lib/glossary";

export default function GlossaryPage() {
  const entries = Object.values(GLOSSARY).sort((a, b) => a.term.localeCompare(b.term));
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold text-slate-100">Glossary</h1>
      <p className="mt-1 text-sm text-slate-400">
        Every term the app uses, in plain English. These same definitions power the hover tooltips.
      </p>
      <dl className="mt-6 space-y-4">
        {entries.map((e) => (
          <div key={e.term} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <dt className="font-semibold text-slate-100">{e.term}</dt>
            <dd className="mt-1 text-sm text-slate-300">{e.short}</dd>
            <dd className="mt-1 text-sm text-slate-400">
              <span className="font-medium text-slate-300">Why it matters:</span> {e.why}
            </dd>
            {e.example && <dd className="mt-1 text-sm italic text-slate-500">e.g. {e.example}</dd>}
          </div>
        ))}
      </dl>
    </div>
  );
}
