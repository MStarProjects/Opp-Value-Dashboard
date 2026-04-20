export interface PortfolioSummaryMetrics {
  totalWeight: number;
  holdingCount: number;
  weightedForwardPE?: number;
  weightedPriceToBook?: number;
  weightedRoe?: number;
  weightedPriceToFairValue?: number;
  weightedUpsideToFairValue?: number;
  missingMetricCount: number;
}

export interface ExposureRow {
  label: string;
  portfolioWeight: number;
  benchmarkWeight?: number;
  modelWeight?: number;
  activeVsBenchmark?: number;
  activeVsModel?: number;
}

export interface DistributionRow {
  label: string;
  portfolioWeight: number;
  comparisonWeight?: number;
}
