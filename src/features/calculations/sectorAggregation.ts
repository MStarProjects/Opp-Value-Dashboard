import type { CanonicalHolding } from "@/types/holdings";
import type { DistributionRow, ExposureRow } from "@/types/metrics";

function buildExposure(
  holdings: CanonicalHolding[],
  accessor: (holding: CanonicalHolding) => string | undefined,
  basis: "targetWeight" | "driftedWeight" = "targetWeight",
): ExposureRow[] {
  const grouped = new Map<string, ExposureRow>();

  for (const holding of holdings) {
    const label = accessor(holding) ?? "Unclassified";
    const existing = grouped.get(label) ?? {
      label,
      portfolioWeight: 0,
      benchmarkWeight: 0,
      modelWeight: 0,
      activeVsBenchmark: 0,
      activeVsModel: 0,
    };

    const weight = holding[basis] ?? 0;
    existing.portfolioWeight += weight;
    existing.benchmarkWeight = (existing.benchmarkWeight ?? 0) + (holding.benchmarkWeight ?? 0);
    existing.modelWeight = (existing.modelWeight ?? 0) + (holding.modelWeight ?? 0);
    existing.activeVsBenchmark =
      existing.portfolioWeight - (existing.benchmarkWeight ?? 0);
    existing.activeVsModel = existing.portfolioWeight - (existing.modelWeight ?? 0);

    grouped.set(label, existing);
  }

  return [...grouped.values()].sort(
    (left, right) => right.portfolioWeight - left.portfolioWeight,
  );
}

export function buildSectorExposure(
  holdings: CanonicalHolding[],
  basis: "targetWeight" | "driftedWeight" = "targetWeight",
): ExposureRow[] {
  return buildExposure(holdings, (holding) => holding.sector, basis);
}

export function buildCountryExposure(
  holdings: CanonicalHolding[],
  basis: "targetWeight" | "driftedWeight" = "targetWeight",
): ExposureRow[] {
  return buildExposure(holdings, (holding) => holding.country, basis);
}

export function buildMoatDistribution(
  holdings: CanonicalHolding[],
  basis: "targetWeight" | "driftedWeight" = "targetWeight",
): DistributionRow[] {
  const grouped = new Map<string, DistributionRow>();

  for (const holding of holdings) {
    const label = holding.moat ?? "Unknown";
    const existing = grouped.get(label) ?? {
      label,
      portfolioWeight: 0,
      comparisonWeight: 0,
    };

    existing.portfolioWeight += holding[basis] ?? 0;
    existing.comparisonWeight = (existing.comparisonWeight ?? 0) + (holding.modelWeight ?? 0);
    grouped.set(label, existing);
  }

  return [...grouped.values()].sort(
    (left, right) => right.portfolioWeight - left.portfolioWeight,
  );
}

export function buildPfvDistribution(
  holdings: CanonicalHolding[],
  basis: "targetWeight" | "driftedWeight" = "targetWeight",
): DistributionRow[] {
  const buckets = [
    { label: "< 0.8x", min: Number.NEGATIVE_INFINITY, max: 0.8 },
    { label: "0.8x - 1.0x", min: 0.8, max: 1.0 },
    { label: "1.0x - 1.2x", min: 1.0, max: 1.2 },
    { label: "> 1.2x", min: 1.2, max: Number.POSITIVE_INFINITY },
  ];

  const distribution = buckets.map<DistributionRow>((bucket) => ({
    label: bucket.label,
    portfolioWeight: 0,
    comparisonWeight: 0,
  }));

  for (const holding of holdings) {
    const pfv = holding.priceToFairValue;
    if (pfv == null) {
      continue;
    }

    const bucketIndex = buckets.findIndex(
      (bucket) => pfv >= bucket.min && pfv < bucket.max,
    );

    if (bucketIndex < 0) {
      continue;
    }

    distribution[bucketIndex].portfolioWeight += holding[basis] ?? 0;
    distribution[bucketIndex].comparisonWeight =
      (distribution[bucketIndex].comparisonWeight ?? 0) + (holding.modelWeight ?? 0);
  }

  return distribution;
}
