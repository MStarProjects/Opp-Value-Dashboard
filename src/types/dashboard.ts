import type { SourceRole } from "@/lib/data-sources";
import type { AlgoDashboardData } from "@/types/algo";
import type { CanonicalHolding } from "@/types/holdings";
import type {
  DistributionRow,
  ExposureRow,
  PortfolioSummaryMetrics,
} from "@/types/metrics";
import type { ReconciliationIssue } from "@/types/reconciliation";

export interface SourceSnapshot {
  fileName: string;
  role: SourceRole;
  dateToken?: string;
  dateLabel?: string;
  sheetCount: number;
}

export interface DataAuditSummary {
  parsedWorkbookRows: number;
  parsedHoldingRows: number;
  weightedHoldingRows: number;
  duplicateIsinCount: number;
  duplicateTickerCount: number;
  rowsMissingIsin: number;
  rowsMissingTicker: number;
  currencyContributionCoverageCount: number;
  workbookFallbackCoverageCount: number;
  apiReadyByIsinCount: number;
  apiFallbackTickerCount: number;
  apiMatchedCount: number;
}

export interface EnrichmentAudit {
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

export interface DashboardState {
  asOfLabel?: string;
  morningstarAsOfLabel?: string;
  sources: SourceSnapshot[];
  algo: AlgoDashboardData;
  holdings: CanonicalHolding[];
  detailRows: CanonicalHolding[];
  summary: PortfolioSummaryMetrics;
  sectorExposure: ExposureRow[];
  countryExposure: ExposureRow[];
  moatDistribution: DistributionRow[];
  pfvDistribution: DistributionRow[];
  valuationBySector: Array<{
    sector: string;
    portfolioPfv?: number;
    benchmarkWeight?: number;
    apiPfv?: number;
  }>;
  topActivePositions: CanonicalHolding[];
  topUnderweights: CanonicalHolding[];
  topBenchmarkGaps: CanonicalHolding[];
  topUpsidePositions: CanonicalHolding[];
  stockDetail?: CanonicalHolding;
  issues: ReconciliationIssue[];
  audit: DataAuditSummary;
  enrichmentAudit: EnrichmentAudit;
}
