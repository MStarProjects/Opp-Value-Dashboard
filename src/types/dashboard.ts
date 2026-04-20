import type { SourceRole } from "@/lib/data-sources";
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

export interface DashboardState {
  asOfLabel?: string;
  sources: SourceSnapshot[];
  holdings: CanonicalHolding[];
  summary: PortfolioSummaryMetrics;
  sectorExposure: ExposureRow[];
  countryExposure: ExposureRow[];
  moatDistribution: DistributionRow[];
  pfvDistribution: DistributionRow[];
  valuationBySector: Array<{
    sector: string;
    portfolioPfv?: number;
    benchmarkWeight?: number;
    modelPfv?: number;
  }>;
  topActivePositions: CanonicalHolding[];
  topUnderweights: CanonicalHolding[];
  topBenchmarkGaps: CanonicalHolding[];
  topUpsidePositions: CanonicalHolding[];
  stockDetail?: CanonicalHolding;
  issues: ReconciliationIssue[];
}
