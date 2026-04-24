export interface MorningstarEnrichmentRecord {
  identifier: {
    canonicalId?: string;
    isin?: string;
    cusip?: string;
    sedol?: string;
    secid?: string;
    ticker?: string;
    securityName?: string;
  };
  matchedBenchmark?: {
    name?: string;
    secId?: string;
    isin?: string;
    cusip?: string;
    weight?: number;
  };
  benchmarkWeight?: number;
  benchmarkMatchMethod?: string;
  usedBenchmarkFallbackMetrics?: boolean;
  isCashLike?: boolean;
  priceToFairValue?: number;
  moat?: string;
  uncertainty?: string;
  forwardPE?: number;
  roe?: number;
  priceToBook?: number;
  sector?: string;
  country?: string;
  apiReturn1M?: number;
  apiReturnMtd?: number;
  apiReturnYtd?: number;
  apiReturn1Y?: number;
  pfvOverrideSecId?: string;
  forwardPEOverrideSecId?: string;
}

export interface MorningstarBenchmarkHoldingsSnapshot {
  latestDate?: string;
  records: Array<Record<string, string | number | boolean | null>>;
}

export interface MorningstarEnrichmentAudit {
  provider: "morningstar-internal-api";
  status: "stubbed" | "configured";
  benchmarkInvestmentId?: string;
  directDataSetIdOrName?: string;
  requestedFieldGroups: string[];
  matchedByIsin: number;
  matchedByTicker: number;
  unmatchedHoldings: number;
  workbookFallbackRows: number;
  benchmarkConstituentCount: number;
  benchmarkMatchedExactly?: number;
  benchmarkMatchedByEquivalent?: number;
  offBenchmarkRows?: number;
  cashLikeRows?: number;
  benchmarkFallbackMetricRows?: number;
  adrOverrideRows?: number;
  notes: string[];
}

export interface MorningstarEnrichmentResult {
  records: MorningstarEnrichmentRecord[];
  audit: MorningstarEnrichmentAudit;
  benchmarkHoldings?: MorningstarBenchmarkHoldingsSnapshot;
}
