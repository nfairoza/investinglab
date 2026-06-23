import { SettingsAI } from "@/components/settings-ai";
import { Connectors, SectionHeading, ConnectorList } from "@/components/connectors";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { isAdminUser } from "@/lib/supabase-data";

export const metadata = { title: "Connectors" };

export default async function Page() {
  // Platform API keys are admin-only. Regular users are redirected home —
  // they manage their own broker connections elsewhere (per-user).
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!isAdminUser(user)) redirect("/");
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink">Connectors &amp; API keys</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-dim">
          One place for every data source and the AI layer. Add keys as you get them — the app
          switches from demo to live automatically when a key is detected.
        </p>
      </div>

      {/* ── AI providers ── */}
      <section className="space-y-3">
        <SectionHeading title="AI providers" subtitle="Power the research memos, predictions, and the chat widget. Claude is primary; Gemini is the fallback." />
        <SettingsAI />
        <ConnectorList category="ai" />
      </section>

      {/* ── Brokerage / portfolio ── */}
      <section className="space-y-3">
        <SectionHeading title="Brokerage" subtitle="Brokerage connections are per-user. Every user connects their own E*TRADE under Settings. The E*TRADE app credentials below identify this app to E*TRADE for everyone." />
        <a href="/brokerage" className="inline-block rounded-md border border-hairline px-3 py-1.5 text-sm text-ink-dim hover:bg-surface hover:text-ink">
          Go to Connect brokerage →
        </a>
      </section>

      {/* ── Finance data + other (rendered by Connectors) ── */}
      <Connectors />
    </div>
  );
}
