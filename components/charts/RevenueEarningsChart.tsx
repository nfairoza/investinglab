"use client";
import dynamic from "next/dynamic";
import { ChartSkeleton } from "./ChartSkeleton";
export const RevenueEarningsChart = dynamic(
  () => import("./RevenueEarningsChart.impl").then((m) => m.RevenueEarningsChart),
  { ssr: false, loading: () => <ChartSkeleton height={256} /> },
);
