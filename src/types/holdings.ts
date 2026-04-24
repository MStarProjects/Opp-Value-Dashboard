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
  currency?: string;
  sector?: string;
  industry?: string;
  moat?: string;
  currencyContribution?: number;
  targetWeight?: number;
  driftedWeight?: number;
  benchmarkWeight?: number;
  modelWeight?: number;
  activeWeightVsBenchmark?: number;
  activeWeightVsModel?: number;
  price?: number;
  mtdReturn?: number;
  oneMonthReturn?: number;
  ytdReturn?: number;
  oneYearReturn?: number;
  apiReturn1M?: number;
  apiReturnMtd?: number;
  apiReturnYtd?: number;
  apiReturn1Y?: number;
  hasApiPriceToFairValue?: boolean;
  hasApiMoat?: boolean;
  contributionToReturnMtd?: number;
  contributionToReturnYtd?: number;
  contributionToReturnOneMonth?: number;
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
