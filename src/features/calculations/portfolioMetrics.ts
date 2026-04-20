import type { CanonicalHolding } from "@/types/holdings";
import type { PortfolioSummaryMetrics } from "@/types/metrics";

type WeightedMetricKey =
  | "forwardPE"
  | "priceToBook"
  | "roe"
  | "priceToFairValue"
  | "upsideToFairValue";

function getWeight(holding: CanonicalHolding, basis: "targetWeight" | "driftedWeight") {
  return holding[basis] ?? 0;
}

function weightedAverage(
  holdings: CanonicalHolding[],
  metric: WeightedMetricKey,
  basis: "targetWeight" | "driftedWeight",
): number | undefined {
  let weightedSum = 0;
  let denominator = 0;

  for (const holding of holdings) {
    const metricValue = holding[metric];
    const weight = getWeight(holding, basis);

    if (metricValue == null || weight <= 0) {
      continue;
    }

    weightedSum += metricValue * weight;
    denominator += weight;
  }

  if (denominator === 0) {
    return undefined;
  }

  return weightedSum / denominator;
}

export function summarizePortfolio(
  holdings: CanonicalHolding[],
  basis: "targetWeight" | "driftedWeight" = "targetWeight",
): PortfolioSummaryMetrics {
  const totalWeight = holdings.reduce((sum, holding) => sum + getWeight(holding, basis), 0);
  const missingMetricCount = holdings.filter(
    (holding) =>
      holding.forwardPE == null ||
      holding.priceToBook == null ||
      holding.roe == null,
  ).length;

  return {
    totalWeight,
    holdingCount: holdings.length,
    weightedForwardPE: weightedAverage(holdings, "forwardPE", basis),
    weightedPriceToBook: weightedAverage(holdings, "priceToBook", basis),
    weightedRoe: weightedAverage(holdings, "roe", basis),
    weightedPriceToFairValue: weightedAverage(holdings, "priceToFairValue", basis),
    weightedUpsideToFairValue: weightedAverage(holdings, "upsideToFairValue", basis),
    missingMetricCount,
  };
}
