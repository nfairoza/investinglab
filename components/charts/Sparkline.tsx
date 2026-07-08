"use client";
import dynamic from "next/dynamic";
import { ChartSkeleton } from "./ChartSkeleton";
export const Sparkline = dynamic(
  () => import("./Sparkline.impl").then((m) => m.Sparkline),
  { ssr: false, loading: () => <ChartSkeleton height={64} /> },
);
