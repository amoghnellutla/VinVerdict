"use client";

import { createContext, useContext, useEffect } from "react";
import type { CostParts } from "@/lib/report/costs";

export type SetReportPart = <K extends keyof CostParts>(key: K, value: CostParts[K] | null) => void;

/**
 * Where the cost panels leave what they currently show (your state, fees,
 * years, miles), so the downloadable report matches the page. Result keeps
 * the values in a ref: nothing re-renders; the report reads them when you download.
 */
export const ReportPartsContext = createContext<SetReportPart | null>(null);

export function useReportPart<K extends keyof CostParts>(key: K, value: CostParts[K] | null) {
  const set = useContext(ReportPartsContext);
  useEffect(() => {
    set?.(key, value);
  }, [set, key, value]);
}
