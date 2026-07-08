"use client";
import dynamic from "next/dynamic";
import { ChartSkeleton } from "./ChartSkeleton";
export const MarginChart = dynamic(
  () => import("./MarginChart.impl").then((m) => m.MarginChart),
  { ssr: false, loading: () => <ChartSkeleton height={256} /> },
);
