"use client";
import dynamic from "next/dynamic";
import { ChartSkeleton } from "./ChartSkeleton";
export const PriceHistoryChart = dynamic(
  () => import("./PriceHistoryChart.impl").then((m) => m.PriceHistoryChart),
  { ssr: false, loading: () => <ChartSkeleton height={200} /> },
);
