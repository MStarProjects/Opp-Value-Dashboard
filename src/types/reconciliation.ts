export type MatchMethod =
  | "isin_exact"
  | "ticker_exact"
  | "name_exact"
  | "name_fuzzy"
  | "unmatched";

export type ReconciliationStatus =
  | "matched"
  | "low_confidence"
  | "unresolved"
  | "conflict";

export interface ReconciliationIssue {
  code:
    | "unmatched_security"
    | "duplicate_match"
    | "low_confidence_match"
    | "missing_identifier"
    | "missing_weight"
    | "missing_metric"
    | "conflicting_values";
  severity: "info" | "warning" | "error";
  message: string;
  sourceSheet: string;
  rowIndex?: number;
  canonicalId?: string;
}

export interface MatchResult {
  method: MatchMethod;
  confidence: number;
  matchedCanonicalId?: string;
}
