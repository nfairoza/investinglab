"use client";
import dynamic from "next/dynamic";
import { ChartSkeleton } from "@/components/charts/ChartSkeleton";

// Dynamic import so d3-sankey is code-split out of the main bundle (A3 rule).
export const CashflowSankey = dynamic(
  () => import("./cashflow-sankey.impl").then((m) => m.CashflowSankeyImpl),
  { ssr: false, loading: () => <ChartSkeleton height={420} /> },
);
