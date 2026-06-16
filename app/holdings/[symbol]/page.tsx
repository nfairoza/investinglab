import { HoldingDetail } from "@/components/holding-detail";

export default function Page({ params }: { params: { symbol: string } }) {
  return <HoldingDetail symbol={params.symbol.toUpperCase()} />;
}
