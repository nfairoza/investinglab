"use client";
import dynamic from "next/dynamic";
import { ChartSkeleton } from "./ChartSkeleton";
export const GlowSparkline = dynamic(
  () => import("./GlowSparkline.impl").then((m) => m.GlowSparkline),
  { ssr: false, loading: () => <ChartSkeleton height={96} /> },
);
