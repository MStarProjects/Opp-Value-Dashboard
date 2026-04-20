import {
  buildCountryExposure,
  buildMoatDistribution,
  buildPfvDistribution,
  buildSectorExposure,
} from "@/features/calculations/sectorAggregation";
import { summarizePortfolio } from "@/features/calculations/portfolioMetrics";
import { detectHoldingIssues } from "@/features/reconciliation/issueDetection";
import { formatDateToken, pickLatestWorkbooksByRole } from "@/lib/data-sources";
import type { DashboardState, SourceSnapshot } from "@/types/dashboard";
import type { CanonicalHolding } from "@/types/holdings";
import type { ParsedSheet, ParsedWorkbook, ParsedSheetRow } from "@/types/workbook";

function asString(value: string | number | null | undefined): string | undefined {
  if (value == null) {
    return undefined;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : undefined;
}

function asNumber(value: string | number | null | undefined): number | undefined {
  if (value == null || value === "") {
    return undefined;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  const normalized = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(normalized) ? normalized : undefined;
}

function normalizeIdentifier(value?: string): string | undefined {
  return value?.trim().toLowerCase();
}

function buildCanonicalId(row: ParsedSheetRow, fallback: string): string {
  const isin = asString(row.isin);
  const ticker = asString(row.ticker);
  const secid = asString(row.secid) ?? asString(row["secid "]);
  const name =
    asString(row["security name"]) ?? asString(row.stock) ?? asString(row.name);

  return [
    normalizeIdentifier(isin),
    normalizeIdentifier(ticker),
    normalizeIdentifier(secid),
    normalizeIdentifier(name),
    fallback,
  ]
    .filter(Boolean)
    .join("__");
}

function weightedAverageForSubset(
  holdings: CanonicalHolding[],
  metric: "priceToFairValue",
): number | undefined {
  let weightedSum = 0;
  let denominator = 0;

  for (const holding of holdings) {
    const metricValue = holding[metric];
    const weight = holding.targetWeight ?? holding.driftedWeight ?? 0;

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

function mapPmhubSheet(sheet: ParsedSheet): CanonicalHolding[] {
  return sheet.rows
    .filter((row) => {
      const securityName = asString(row["security name"]);
      const weight = asNumber(row.weight);
      return securityName && securityName.toLowerCase() !== "sleeve-intl eq-global xus opportunistic value" && weight != null;
    })
    .map((row, index) => ({
      canonicalId: buildCanonicalId(row, `pmhub-${index}`),
      securityName: asString(row["security name"]) ?? "Unknown Security",
      ticker: asString(row.ticker),
      isin: asString(row.isin),
      cusip: asString(row.cusip),
      sedol: asString(row.sedol),
      price: asNumber(row["last/price"]),
      targetWeight: asNumber(row.weight),
      forwardPE: asNumber(row["pe fy1"]),
      priceToBook: asNumber(row["price/bk"]),
      roe: asNumber(row.roe),
      oneMonthReturn: asNumber(row["%chg - 1 mo"]),
      ytdReturn: asNumber(row["%chg - ytd"]),
      sourceSheets: [sheet.name],
      matchMethod: "pmhub_base",
      matchConfidence: 1,
      reconciliationStatus: "matched",
      dataQualityFlags: [],
    }));
}

function mapPortfolioHoldingsSheet(sheet: ParsedSheet): CanonicalHolding[] {
  return sheet.rows
    .filter((row) => asString(row.stock))
    .map((row, index) => ({
      canonicalId: buildCanonicalId(row, `portfolio-${index}`),
      securityName: asString(row.stock) ?? "Unknown Security",
      ticker: asString(row.ticker),
      isin: asString(row.isin),
      secid: asString(row.secid),
      country: asString(row.country),
      sector: asString(row.sector),
      targetWeight: asNumber(row["opp value weight (tgt)"]),
      driftedWeight: asNumber(row["opp value weight (drifted)"]),
      benchmarkWeight: asNumber(row["weight in benchmark"]),
      priceToFairValue: asNumber(row["mer p/fair value"]),
      upsideToFairValue: asNumber(row["upside to mer value"]),
      forwardPE: asNumber(row["forward pe"]),
      sourceSheets: [sheet.name],
      matchMethod: "portfolio_base",
      matchConfidence: 0.98,
      reconciliationStatus: "matched",
      dataQualityFlags: [],
    }));
}

function buildBaseHoldings(workbooks: ParsedWorkbook[]): CanonicalHolding[] {
  const pmhubWorkbook = workbooks.find((workbook) => workbook.sourceRole === "pmhub_holdings");
  const portfolioWorkbook = workbooks.find(
    (workbook) => workbook.sourceRole === "portfolio_workbook",
  );

  const pmhubSheet = pmhubWorkbook?.sheets.find((sheet) =>
    sheet.normalizedHeaders.includes("security name"),
  );

  if (pmhubSheet) {
    return mapPmhubSheet(pmhubSheet);
  }

  const portfolioSheet = portfolioWorkbook?.sheets.find(
    (sheet) => sheet.name.toLowerCase() === "xus opp value",
  );

  if (portfolioSheet) {
    return mapPortfolioHoldingsSheet(portfolioSheet);
  }

  return [];
}

function indexHoldings(holdings: CanonicalHolding[]) {
  const map = new Map<string, CanonicalHolding>();

  for (const holding of holdings) {
    const keys = [
      normalizeIdentifier(holding.isin),
      normalizeIdentifier(holding.ticker),
      normalizeIdentifier(holding.secid),
      normalizeIdentifier(holding.cusip),
      normalizeIdentifier(holding.securityName),
    ].filter(Boolean) as string[];

    for (const key of keys) {
      if (!map.has(key)) {
        map.set(key, holding);
      }
    }
  }

  return map;
}

function findHolding(
  index: Map<string, CanonicalHolding>,
  row: ParsedSheetRow,
): CanonicalHolding | undefined {
  const candidates = [
    normalizeIdentifier(asString(row.isin)),
    normalizeIdentifier(asString(row.ticker)),
    normalizeIdentifier(asString(row.secid) ?? asString(row["secid "])),
    normalizeIdentifier(asString(row.cusip)),
    normalizeIdentifier(
      asString(row["security name"]) ?? asString(row.stock) ?? asString(row.name),
    ),
  ].filter(Boolean) as string[];

  return candidates.map((candidate) => index.get(candidate)).find(Boolean);
}

function enrichWithPortfolioWorkbook(
  holdings: CanonicalHolding[],
  workbooks: ParsedWorkbook[],
): void {
  const workbook = workbooks.find((item) => item.sourceRole === "portfolio_workbook");
  const holdingsSheet = workbook?.sheets.find(
    (sheet) => sheet.name.toLowerCase() === "xus opp value",
  );

  if (!holdingsSheet) {
    return;
  }

  const index = indexHoldings(holdings);

  for (const row of holdingsSheet.rows) {
    const holding = findHolding(index, row);
    if (!holding) {
      continue;
    }

    holding.secid ??= asString(row.secid);
    holding.country ??= asString(row.country);
    holding.sector ??= asString(row.sector);
    holding.targetWeight ??= asNumber(row["opp value weight (tgt)"]);
    holding.driftedWeight ??= asNumber(row["opp value weight (drifted)"]);
    holding.benchmarkWeight ??= asNumber(row["weight in benchmark"]);
    holding.priceToFairValue ??= asNumber(row["mer p/fair value"]);
    holding.upsideToFairValue ??= asNumber(row["upside to mer value"]);
    holding.forwardPE ??= asNumber(row["forward pe"]);
    if (!holding.sourceSheets.includes(holdingsSheet.name)) {
      holding.sourceSheets.push(holdingsSheet.name);
    }
  }
}

function enrichWithOverrideWorkbook(
  holdings: CanonicalHolding[],
  workbooks: ParsedWorkbook[],
): void {
  const workbook = workbooks.find((item) => item.sourceRole === "pfv_override");
  const sheet = workbook?.sheets[0];

  if (!sheet) {
    return;
  }

  const index = indexHoldings(holdings);

  for (const row of sheet.rows) {
    const holding = findHolding(index, row);
    if (!holding) {
      continue;
    }

    holding.priceToFairValue = asNumber(row["price to fair value"]) ?? holding.priceToFairValue;
    holding.uncertainty = asString(row["fair value uncertainty"]) ?? holding.uncertainty;
    holding.sector = asString(row["gics sector"]) ?? holding.sector;
    holding.moat = asString(row["economic moat"]) ?? holding.moat;

    if (!holding.sourceSheets.includes(sheet.name)) {
      holding.sourceSheets.push(sheet.name);
    }
  }
}

function enrichWithTmeWorkbook(
  holdings: CanonicalHolding[],
  workbooks: ParsedWorkbook[],
): void {
  const workbook = workbooks.find((item) => item.sourceRole === "tme_reference");
  const sheet = workbook?.sheets[0];

  if (!sheet) {
    return;
  }

  const index = indexHoldings(holdings);

  for (const row of sheet.rows) {
    const holding = findHolding(index, row);
    if (!holding) {
      continue;
    }

    holding.modelWeight = asNumber(row["portfolio weighting %"]);
    holding.priceToFairValue ??= asNumber(row["price to fair value"]);
    holding.uncertainty ??= asString(row["fair value uncertainty"]);
    holding.sector ??= asString(row["gics sector"]);
    holding.moat ??= asString(row["economic moat"]);

    if (!holding.sourceSheets.includes(sheet.name)) {
      holding.sourceSheets.push(sheet.name);
    }
  }
}

function enrichWithEmbeddedTmeSheet(
  holdings: CanonicalHolding[],
  workbooks: ParsedWorkbook[],
): void {
  const workbook = workbooks.find((item) => item.sourceRole === "portfolio_workbook");
  const tmeSheet = workbook?.sheets.find((sheet) => sheet.name.toLowerCase() === "xus tme");

  if (!tmeSheet) {
    return;
  }

  const index = indexHoldings(holdings);

  for (const row of tmeSheet.rows) {
    const holding = findHolding(index, row);
    if (!holding) {
      continue;
    }

    holding.country ??= asString(row["business country"]);
    holding.sector ??= asString(row["gics sector"]);
    holding.moat ??= asString(row["economic moat"]);
    holding.priceToFairValue ??= asNumber(row["price to fair value"]);
    holding.forwardPE ??= asNumber(row["forward price to earnings ratio"]);
    holding.roe ??= asNumber(row["return on equity-fy"]);
    holding.priceToBook ??= asNumber(row["price to book ratio"]);

    if (!holding.sourceSheets.includes(tmeSheet.name)) {
      holding.sourceSheets.push(tmeSheet.name);
    }
  }
}

function finalizeHoldings(holdings: CanonicalHolding[]): CanonicalHolding[] {
  return holdings
    .map((holding) => ({
      ...holding,
      activeWeightVsBenchmark:
        (holding.targetWeight ?? holding.driftedWeight ?? 0) -
        (holding.benchmarkWeight ?? 0),
      activeWeightVsModel:
        (holding.targetWeight ?? holding.driftedWeight ?? 0) - (holding.modelWeight ?? 0),
      dataQualityFlags: [
        ...(holding.priceToFairValue == null ? ["Missing PFV"] : []),
        ...(holding.forwardPE == null ? ["Missing Forward PE"] : []),
        ...(holding.benchmarkWeight == null ? ["Missing benchmark weight"] : []),
        ...(holding.country == null ? ["Missing country"] : []),
        ...(holding.moat == null ? ["Missing moat"] : []),
      ],
    }))
    .sort(
      (left, right) =>
        (right.targetWeight ?? right.driftedWeight ?? 0) -
        (left.targetWeight ?? left.driftedWeight ?? 0),
    );
}

function buildValuationBySector(holdings: CanonicalHolding[]) {
  const sectors = buildSectorExposure(holdings).slice(0, 8);

  return sectors.map((sectorRow) => {
    const sectorHoldings = holdings.filter((holding) => holding.sector === sectorRow.label);

    return {
      sector: sectorRow.label,
      portfolioPfv: weightedAverageForSubset(sectorHoldings, "priceToFairValue"),
      benchmarkWeight: sectorRow.benchmarkWeight,
      modelPfv: weightedAverageForSubset(
        sectorHoldings.filter((holding) => holding.modelWeight != null),
        "priceToFairValue",
      ),
    };
  });
}

export function buildDashboardState(rawWorkbooks: ParsedWorkbook[]): DashboardState {
  const workbooks = pickLatestWorkbooksByRole(rawWorkbooks);
  const baseHoldings = buildBaseHoldings(workbooks);
  enrichWithPortfolioWorkbook(baseHoldings, workbooks);
  enrichWithOverrideWorkbook(baseHoldings, workbooks);
  enrichWithTmeWorkbook(baseHoldings, workbooks);
  enrichWithEmbeddedTmeSheet(baseHoldings, workbooks);

  const holdings = finalizeHoldings(baseHoldings);
  const summary = summarizePortfolio(holdings);
  const sectorExposure = buildSectorExposure(holdings);
  const countryExposure = buildCountryExposure(holdings);
  const moatDistribution = buildMoatDistribution(holdings);
  const pfvDistribution = buildPfvDistribution(holdings);
  const valuationBySector = buildValuationBySector(holdings);
  const issues = detectHoldingIssues(holdings);

  const sources: SourceSnapshot[] = workbooks.map((workbook) => ({
    fileName: workbook.fileName,
    role: workbook.sourceRole,
    dateToken: workbook.dateToken,
    dateLabel: formatDateToken(workbook.dateToken),
    sheetCount: workbook.sheets.length,
  }));

  const topActivePositions = [...holdings]
    .sort(
      (left, right) =>
        Math.abs(right.activeWeightVsBenchmark ?? 0) -
        Math.abs(left.activeWeightVsBenchmark ?? 0),
    )
    .slice(0, 8);

  const topUnderweights = [...holdings]
    .filter((holding) => (holding.activeWeightVsBenchmark ?? 0) < 0)
    .sort(
      (left, right) =>
        (left.activeWeightVsBenchmark ?? 0) - (right.activeWeightVsBenchmark ?? 0),
    )
    .slice(0, 8);

  const topBenchmarkGaps = [...holdings]
    .filter((holding) => holding.benchmarkWeight != null)
    .sort(
      (left, right) =>
        (right.benchmarkWeight ?? 0) - (left.benchmarkWeight ?? 0),
    )
    .slice(0, 8);

  const topUpsidePositions = [...holdings]
    .filter((holding) => holding.upsideToFairValue != null)
    .sort(
      (left, right) =>
        (right.upsideToFairValue ?? 0) - (left.upsideToFairValue ?? 0),
    )
    .slice(0, 8);

  const asOfLabel = sources
    .map((source) => source.dateLabel)
    .find(Boolean);

  return {
    asOfLabel,
    sources,
    holdings,
    summary,
    sectorExposure,
    countryExposure,
    moatDistribution,
    pfvDistribution,
    valuationBySector,
    topActivePositions,
    topUnderweights,
    topBenchmarkGaps,
    topUpsidePositions,
    stockDetail: holdings[0],
    issues,
  };
}
