import type { ReconciliationStatus } from "@/types/reconciliation";

export interface CanonicalHolding {
  canonicalId: string;
  securityName: string;
  ticker?: string;
  isin?: string;
  secid?: string;
  cusip?: string;
  sedol?: string;
  country?: string;
  sector?: string;
  industry?: string;
  moat?: string;
  targetWeight?: number;
  driftedWeight?: number;
  benchmarkWeight?: number;
  modelWeight?: number;
  activeWeightVsBenchmark?: number;
  activeWeightVsModel?: number;
  price?: number;
  oneMonthReturn?: number;
  ytdReturn?: number;
  priceToFairValue?: number;
  upsideToFairValue?: number;
  uncertainty?: string;
  forwardPE?: number;
  priceToBook?: number;
  roe?: number;
  sourceSheets: string[];
  matchMethod: string;
  matchConfidence: number;
  reconciliationStatus: ReconciliationStatus;
  dataQualityFlags: string[];
}

export interface HoldingMatchCandidate {
  securityName?: string;
  ticker?: string;
  isin?: string;
  secid?: string;
  sourceSheet: string;
  rowIndex: number;
  fields: Record<string, string | number | null>;
}
