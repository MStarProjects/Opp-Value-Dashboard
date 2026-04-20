export const matchingPriority = [
  "ISIN exact match",
  "Ticker exact match",
  "Normalized security name exact match",
  "Fuzzy name match with confidence score",
] as const;

export const dashboardViews = [
  {
    name: "Overview",
    description:
      "KPI cards, weighted valuation metrics, holdings count, weight totals, and data quality warnings.",
  },
  {
    name: "Holdings",
    description:
      "Searchable, sortable holdings table with weights, valuation metrics, and reconciliation status.",
  },
  {
    name: "Sector View",
    description:
      "Portfolio sector exposures with benchmark and optional model comparisons.",
  },
  {
    name: "Reconciliation",
    description:
      "Low-confidence matches, unresolved rows, conflicting identifiers, and missing data alerts.",
  },
] as const;

export const implementationPhases = [
  {
    kicker: "Phase 1",
    title: "Parsing",
    description:
      "Read workbook sheets client-side, normalize headers, and profile the structure of each sheet.",
  },
  {
    kicker: "Phase 2",
    title: "Roles",
    description:
      "Classify sheets as holdings, metrics, benchmark, sector, model, time series, or unknown with confidence.",
  },
  {
    kicker: "Phase 3",
    title: "Reconcile",
    description:
      "Build the canonical holdings dataset and capture unresolved or conflicting mappings explicitly.",
  },
  {
    kicker: "Phase 4",
    title: "Calculate",
    description:
      "Compute weighted portfolio metrics, sector exposures, and active weight comparisons with pure functions.",
  },
  {
    kicker: "Phase 5",
    title: "Present",
    description:
      "Render the dashboard views, exports, and quality indicators against canonical state.",
  },
] as const;
