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
}
