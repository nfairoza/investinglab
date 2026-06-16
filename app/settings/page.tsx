export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-100">Settings</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          App preferences will live here. API keys and the AI layer have moved to{" "}
          <a href="/connectors" className="text-brand-400 underline">Connectors</a> — add your
          stock-data key, Claude key, and other providers there.
        </p>
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 text-sm text-slate-400">
        Coming soon: base currency, default Beginner mode, theme. For now, head to{" "}
        <a href="/connectors" className="text-brand-400 underline">Connectors</a> to set up data sources.
      </div>
    </div>
  );
}
