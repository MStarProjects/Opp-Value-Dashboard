import type { CanonicalHolding } from "@/types/holdings";
import type { ReconciliationIssue } from "@/types/reconciliation";

export function detectHoldingIssues(
  holdings: CanonicalHolding[],
): ReconciliationIssue[] {
  return holdings.flatMap((holding) => {
    const issues: ReconciliationIssue[] = [];

    if (!holding.isin && !holding.ticker) {
      issues.push({
        code: "missing_identifier",
        severity: "warning",
        message: "Holding is missing both ISIN and ticker identifiers.",
        sourceSheet: holding.sourceSheets[0] ?? "unknown",
        canonicalId: holding.canonicalId,
      });
    }

    if (holding.targetWeight == null && holding.driftedWeight == null) {
      issues.push({
        code: "missing_weight",
        severity: "warning",
        message: "Holding has no target or drifted weight available.",
        sourceSheet: holding.sourceSheets[0] ?? "unknown",
        canonicalId: holding.canonicalId,
      });
    }

    return issues;
  });
}
