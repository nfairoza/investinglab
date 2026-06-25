import { notFound } from "next/navigation";
import { presetByKey } from "@/lib/screener/presets";
import { ScreenerListDetail } from "@/components/screener-list-detail";

export const metadata = { title: "Trending list" };

export default function Page({ params }: { params: { key: string } }) {
  const preset = presetByKey(params.key);
  if (!preset) notFound();
  return <ScreenerListDetail presetKey={preset.key} />;
}
