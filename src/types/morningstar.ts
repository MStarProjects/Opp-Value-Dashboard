export interface MorningstarEnrichmentRecord {
  identifier: {
    isin?: string;
    cusip?: string;
    sedol?: string;
    secid?: string;
    ticker?: string;
    securityName?: string;
  };
  benchmarkWeight?: number;
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
  notes: string[];
}

export interface MorningstarEnrichmentResult {
  records: MorningstarEnrichmentRecord[];
  audit: MorningstarEnrichmentAudit;
}
