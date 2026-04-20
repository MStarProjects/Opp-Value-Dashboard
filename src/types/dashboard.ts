import type { SourceRole } from "@/lib/data-sources";
import type { CanonicalHolding } from "@/types/holdings";
import type { PortfolioSummaryMetrics, SectorExposureRow } from "@/types/metrics";
import type { ReconciliationIssue } from "@/types/reconciliation";

export interface SourceSnapshot {
  fileName: string;
  role: SourceRole;
  dateToken?: string;
  sheetCount: number;
}

export interface DashboardState {
  asOfLabel?: string;
  sources: SourceSnapshot[];
  holdings: CanonicalHolding[];
  summary: PortfolioSummaryMetrics;
  sectorExposure: SectorExposureRow[];
  topActivePositions: CanonicalHolding[];
  topBenchmarkGaps: CanonicalHolding[];
  stockDetail?: CanonicalHolding;
  issues: ReconciliationIssue[];
}
