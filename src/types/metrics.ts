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

export interface SectorExposureRow {
  sector: string;
  portfolioWeight: number;
  benchmarkWeight?: number;
  modelWeight?: number;
  activeVsBenchmark?: number;
  activeVsModel?: number;
}
