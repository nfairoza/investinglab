"use client";
import dynamic from "next/dynamic";
import { ChartSkeleton } from "./ChartSkeleton";
export const PerformanceChart = dynamic(
  () => import("./PerformanceChart.impl").then((m) => m.PerformanceChart),
  { ssr: false, loading: () => <ChartSkeleton height={240} /> },
);
