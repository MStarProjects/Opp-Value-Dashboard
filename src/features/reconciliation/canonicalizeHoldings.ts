import type { CanonicalHolding, HoldingMatchCandidate } from "@/types/holdings";

function createCanonicalId(candidate: HoldingMatchCandidate): string {
  const parts = [
    candidate.isin,
    candidate.ticker,
    candidate.securityName,
    `${candidate.sourceSheet}-${candidate.rowIndex}`,
  ].filter(Boolean);

  return parts.join("__");
}

export function canonicalizeHoldings(
  candidates: HoldingMatchCandidate[],
): CanonicalHolding[] {
  return candidates.map((candidate) => ({
    canonicalId: createCanonicalId(candidate),
    securityName: candidate.securityName ?? "Unknown Security",
    ticker: candidate.ticker,
    isin: candidate.isin,
    secid: candidate.secid,
    sourceSheets: [candidate.sourceSheet],
    matchMethod: "seed_row",
    matchConfidence: 1,
    reconciliationStatus: "matched",
    dataQualityFlags: [],
  }));
}
