"use client";
import dynamic from "next/dynamic";
import { ChartSkeleton } from "./ChartSkeleton";
export const AllocationDonut = dynamic(
  () => import("./AllocationDonut.impl").then((m) => m.AllocationDonut),
  { ssr: false, loading: () => <ChartSkeleton height={300} /> },
);
