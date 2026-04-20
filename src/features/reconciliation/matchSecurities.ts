import type {
  CanonicalHolding,
  HoldingMatchCandidate,
} from "@/types/holdings";
import type { MatchResult } from "@/types/reconciliation";

export function matchSecurity(
  candidate: HoldingMatchCandidate,
  canonicalHoldings: CanonicalHolding[],
): MatchResult {
  if (candidate.isin) {
    const matched = canonicalHoldings.find((holding) => holding.isin === candidate.isin);
    if (matched) {
      return {
        method: "isin_exact",
        confidence: 1,
        matchedCanonicalId: matched.canonicalId,
      };
    }
  }

  if (candidate.ticker) {
    const matched = canonicalHoldings.find(
      (holding) => holding.ticker?.toLowerCase() === candidate.ticker?.toLowerCase(),
    );

    if (matched) {
      return {
        method: "ticker_exact",
        confidence: 0.95,
        matchedCanonicalId: matched.canonicalId,
      };
    }
  }

  const normalizedCandidateName = candidate.securityName?.trim().toLowerCase();
  if (normalizedCandidateName) {
    const matched = canonicalHoldings.find(
      (holding) => holding.securityName.trim().toLowerCase() === normalizedCandidateName,
    );

    if (matched) {
      return {
        method: "name_exact",
        confidence: 0.9,
        matchedCanonicalId: matched.canonicalId,
      };
    }
  }

  return {
    method: "unmatched",
    confidence: 0,
  };
}
