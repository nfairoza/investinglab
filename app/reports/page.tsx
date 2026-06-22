import { ReportsManager } from "@/components/reports-manager";

export const metadata = { title: "Reports" };

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink">Reports</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-dim">
          Generate a custom report of your portfolio — pick the sections you want and download as a
          branded PDF or an Excel workbook.
        </p>
      </div>
      <ReportsManager />
    </div>
  );
}
