"use client";
import dynamic from "next/dynamic";
import { ChartSkeleton } from "./ChartSkeleton";
export const GainLossBar = dynamic(
  () => import("./GainLossBar.impl").then((m) => m.GainLossBar),
  { ssr: false, loading: () => <ChartSkeleton height={220} /> },
);
