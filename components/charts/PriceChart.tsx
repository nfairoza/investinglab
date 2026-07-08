"use client";
import dynamic from "next/dynamic";
import { ChartSkeleton } from "./ChartSkeleton";
export const PriceChart = dynamic(
  () => import("./PriceChart.impl").then((m) => m.PriceChart),
  { ssr: false, loading: () => <ChartSkeleton height={240} /> },
);
