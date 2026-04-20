import type { CanonicalHolding } from "@/types/holdings";
import type { SectorExposureRow } from "@/types/metrics";

export function buildSectorExposure(
  holdings: CanonicalHolding[],
  basis: "targetWeight" | "driftedWeight" = "targetWeight",
): SectorExposureRow[] {
  const sectorMap = new Map<string, SectorExposureRow>();

  for (const holding of holdings) {
    const sector = holding.sector ?? "Unclassified";
    const existing = sectorMap.get(sector) ?? {
      sector,
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

    sectorMap.set(sector, existing);
  }

  return [...sectorMap.values()].sort(
    (left, right) => right.portfolioWeight - left.portfolioWeight,
  );
}
