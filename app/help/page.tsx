import { HelpContent } from "@/components/help-content";

export const metadata = { title: "Help" };

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink">Help &amp; support</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-dim">
          Answers, quick links, and the AI assistant — whatever you need to get going.
        </p>
      </div>
      <HelpContent />
    </div>
  );
}
