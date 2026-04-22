import {
  buildCountryExposure,
  buildMoatDistribution,
  buildPfvDistribution,
  buildSectorExposure,
} from "@/features/calculations/sectorAggregation";
import { summarizePortfolio } from "@/features/calculations/portfolioMetrics";
import { enrichPortfolioHoldings } from "@/features/morningstar/enrichPortfolioHoldings";
import { detectHoldingIssues } from "@/features/reconciliation/issueDetection";
import {
  pmhubFieldAliases,
  pmhubWorkbookContract,
  type PmhubFieldKey,
} from "@/lib/pmhub-workbook-contract";
import { formatDateToken, pickLatestWorkbooksByRole } from "@/lib/data-sources";
import type { DashboardState, SourceSnapshot } from "@/types/dashboard";
import type { CanonicalHolding } from "@/types/holdings";
import type { MorningstarEnrichmentRecord } from "@/types/morningstar";
import type { ParsedSheet, ParsedSheetRow, ParsedWorkbook } from "@/types/workbook";

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

  const normalized = Number(String(value).replace(/,/g, "").replace("%", ""));
  return Number.isFinite(normalized) ? normalized : undefined;
}

function normalizeIdentifier(value?: string): string | undefined {
  return value?.trim().toLowerCase();
}

function getFieldValue(row: ParsedSheetRow, key: PmhubFieldKey) {
  for (const alias of pmhubFieldAliases[key]) {
    if (alias in row && row[alias] != null && row[alias] !== "") {
      return row[alias];
    }
  }

  return undefined;
}

function getFieldString(row: ParsedSheetRow, key: PmhubFieldKey) {
  return asString(getFieldValue(row, key));
}

function getFieldNumber(row: ParsedSheetRow, key: PmhubFieldKey) {
  return asNumber(getFieldValue(row, key));
}

function getWeight(row: ParsedSheetRow, sheet: ParsedSheet): number | undefined {
  const directWeight = getFieldNumber(row, "weight");
  if (directWeight != null) {
    return directWeight;
  }

  const fallbackHeader = sheet.normalizedHeaders[pmhubWorkbookContract.weightColumnIndex];
  return fallbackHeader ? asNumber(row[fallbackHeader]) : undefined;
}

function buildCanonicalId(row: ParsedSheetRow, fallback: string): string {
  return [
    normalizeIdentifier(getFieldString(row, "isin")),
    normalizeIdentifier(getFieldString(row, "ticker")),
    normalizeIdentifier(getFieldString(row, "securityName")),
    fallback,
  ]
    .filter(Boolean)
    .join("__");
}

function looksLikeHolding(row: ParsedSheetRow, sheet: ParsedSheet) {
  return Boolean(
    getFieldString(row, "securityName") ||
      getFieldString(row, "isin") ||
      getFieldString(row, "ticker") ||
      getWeight(row, sheet) != null,
  );
}

function mapWorkbookRows(sheet: ParsedSheet): CanonicalHolding[] {
  return sheet.rows
    .filter((row) => looksLikeHolding(row, sheet))
    .map((row, index) => ({
      canonicalId: buildCanonicalId(row, `pmhub-${index}`),
      securityName: getFieldString(row, "securityName") ?? "Unknown Security",
      ticker: getFieldString(row, "ticker"),
      isin: getFieldString(row, "isin"),
      cusip: getFieldString(row, "cusip"),
      sedol: getFieldString(row, "sedol"),
      country: getFieldString(row, "country"),
      currencyContribution: getFieldNumber(row, "currencyContribution"),
      targetWeight: getWeight(row, sheet),
      price: getFieldNumber(row, "price"),
      oneMonthReturn: getFieldNumber(row, "oneMonthReturn"),
      ytdReturn: getFieldNumber(row, "ytdReturn"),
      priceToFairValue: getFieldNumber(row, "priceToFairValue"),
      moat: getFieldString(row, "moat"),
      uncertainty: getFieldString(row, "uncertainty"),
      forwardPE: getFieldNumber(row, "forwardPE"),
      priceToBook: getFieldNumber(row, "priceToBook"),
      roe: getFieldNumber(row, "roe"),
      sourceSheets: [sheet.name],
      matchMethod: "workbook_base",
      matchConfidence: 1,
      reconciliationStatus: "matched",
      dataQualityFlags: [],
    }));
}

function indexHoldings(holdings: CanonicalHolding[]) {
  const index = new Map<string, CanonicalHolding>();

  for (const holding of holdings) {
    const keys = [
      normalizeIdentifier(holding.isin),
      normalizeIdentifier(holding.ticker),
      normalizeIdentifier(holding.securityName),
    ].filter(Boolean) as string[];

    for (const key of keys) {
      if (!index.has(key)) {
        index.set(key, holding);
      }
    }
  }

  return index;
}

function findHolding(
  index: Map<string, CanonicalHolding>,
  record: MorningstarEnrichmentRecord,
): CanonicalHolding | undefined {
  const keys = [
    normalizeIdentifier(record.identifier.canonicalId),
    normalizeIdentifier(record.identifier.isin),
    normalizeIdentifier(record.identifier.ticker),
    normalizeIdentifier(record.identifier.securityName),
  ].filter(Boolean) as string[];

  return keys.map((key) => index.get(key)).find(Boolean);
}

function applyMorningstarEnrichment(
  holdings: CanonicalHolding[],
  records: MorningstarEnrichmentRecord[],
) {
  const index = indexHoldings(holdings);

  for (const record of records) {
    const holding = findHolding(index, record);
    if (!holding) {
      continue;
    }

    holding.benchmarkWeight = record.benchmarkWeight ?? holding.benchmarkWeight;
    holding.priceToFairValue = record.priceToFairValue ?? holding.priceToFairValue;
    holding.moat = record.moat ?? holding.moat;
    holding.uncertainty = record.uncertainty ?? holding.uncertainty;
    holding.forwardPE = record.forwardPE ?? holding.forwardPE;
    holding.roe = record.roe ?? holding.roe;
    holding.priceToBook = record.priceToBook ?? holding.priceToBook;
    holding.sector = record.sector ?? holding.sector;
    holding.country = record.country ?? holding.country;
    if (record.benchmarkMatchMethod) {
      holding.matchMethod = record.benchmarkMatchMethod;
    }
  }
}

function finalizeHoldings(holdings: CanonicalHolding[]): CanonicalHolding[] {
  return holdings
    .map((holding) => ({
      ...holding,
      activeWeightVsBenchmark:
        (holding.targetWeight ?? holding.driftedWeight ?? 0) - (holding.benchmarkWeight ?? 0),
      dataQualityFlags: [
        ...(holding.isin == null ? ["Missing ISIN"] : []),
        ...(holding.ticker == null ? ["Missing ticker"] : []),
        ...(holding.priceToFairValue == null ? ["Missing PFV"] : []),
        ...(holding.benchmarkWeight == null ? ["Missing benchmark weight"] : []),
      ],
    }))
    .sort((left, right) => (right.targetWeight ?? 0) - (left.targetWeight ?? 0));
}

function countDuplicates(values: Array<string | undefined>) {
  const counts = new Map<string, number>();

  for (const value of values) {
    if (!value) {
      continue;
    }

    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.values()].filter((count) => count > 1).length;
}

function countWorkbookFallbackRows(holdings: CanonicalHolding[]) {
  return holdings.filter(
    (holding) =>
      holding.priceToFairValue != null ||
      holding.moat != null ||
      holding.uncertainty != null ||
      holding.forwardPE != null ||
      holding.roe != null ||
      holding.priceToBook != null ||
      holding.country != null ||
      holding.sector != null,
  ).length;
}

function selectPortfolioWorkbook(workbooks: ParsedWorkbook[]) {
  return workbooks.find((workbook) => workbook.sourceRole === "pmhub_portfolio") ?? workbooks[0];
}

function selectPortfolioSheet(workbook?: ParsedWorkbook) {
  if (!workbook) {
    return undefined;
  }

  return (
    workbook.sheets.find(
      (sheet) => sheet.name.toLowerCase() === pmhubWorkbookContract.sheetName.toLowerCase(),
    ) ?? workbook.sheets[0]
  );
}

export async function buildDashboardState(
  rawWorkbooks: ParsedWorkbook[],
  options?: {
    preferStubEnrichment?: boolean;
  },
): Promise<DashboardState> {
  const workbooks = pickLatestWorkbooksByRole(rawWorkbooks);
  const portfolioWorkbook = selectPortfolioWorkbook(workbooks);
  const portfolioSheet = selectPortfolioSheet(portfolioWorkbook);

  if (!portfolioSheet || !portfolioWorkbook) {
    return {
      asOfLabel: undefined,
      sources: [],
      holdings: [],
      summary: summarizePortfolio([]),
      sectorExposure: [],
      countryExposure: [],
      moatDistribution: [],
      pfvDistribution: [],
      valuationBySector: [],
      topActivePositions: [],
      topUnderweights: [],
      topBenchmarkGaps: [],
      topUpsidePositions: [],
      stockDetail: undefined,
      issues: [],
      audit: {
        parsedWorkbookRows: 0,
        parsedHoldingRows: 0,
        weightedHoldingRows: 0,
        duplicateIsinCount: 0,
        duplicateTickerCount: 0,
        rowsMissingIsin: 0,
        rowsMissingTicker: 0,
        currencyContributionCoverageCount: 0,
        workbookFallbackCoverageCount: 0,
        apiReadyByIsinCount: 0,
        apiFallbackTickerCount: 0,
        apiMatchedCount: 0,
      },
      enrichmentAudit: {
        provider: "morningstar-internal-api",
        status: "stubbed",
        benchmarkInvestmentId: pmhubWorkbookContract.benchmarkInvestmentId,
        directDataSetIdOrName: pmhubWorkbookContract.directDataSetIdOrName,
        requestedFieldGroups: [],
        matchedByIsin: 0,
        matchedByTicker: 0,
        unmatchedHoldings: 0,
        workbookFallbackRows: 0,
        benchmarkConstituentCount: 0,
        notes: ["No PMHub workbook could be parsed."],
      },
    };
  }

  const workbookRows = mapWorkbookRows(portfolioSheet);
  const weightedHoldings = workbookRows.filter((holding) => (holding.targetWeight ?? 0) > 0);
  const enrichment = await enrichPortfolioHoldings(weightedHoldings, {
    preferStub: options?.preferStubEnrichment,
  });
  applyMorningstarEnrichment(weightedHoldings, enrichment.records);
  const finalizedHoldings = finalizeHoldings(weightedHoldings);
  const issues = detectHoldingIssues(finalizedHoldings);

  const sources: SourceSnapshot[] = [
    {
      fileName: portfolioWorkbook.fileName,
      role: portfolioWorkbook.sourceRole,
      dateToken: portfolioWorkbook.dateToken,
      dateLabel: formatDateToken(portfolioWorkbook.dateToken),
      sheetCount: portfolioWorkbook.sheets.length,
    },
  ];

  return {
    asOfLabel: sources[0]?.dateLabel,
    sources,
    holdings: finalizedHoldings,
    summary: summarizePortfolio(finalizedHoldings),
    sectorExposure: buildSectorExposure(finalizedHoldings),
    countryExposure: buildCountryExposure(finalizedHoldings),
    moatDistribution: buildMoatDistribution(finalizedHoldings),
    pfvDistribution: buildPfvDistribution(finalizedHoldings),
    valuationBySector: buildSectorExposure(finalizedHoldings)
      .slice(0, 8)
      .map((row) => ({
        sector: row.label,
        portfolioPfv: undefined,
        benchmarkWeight: row.benchmarkWeight,
        apiPfv: undefined,
      })),
    topActivePositions: [...finalizedHoldings].slice(0, 8),
    topUnderweights: [...finalizedHoldings]
      .filter((holding) => (holding.activeWeightVsBenchmark ?? 0) < 0)
      .sort(
        (left, right) =>
          (left.activeWeightVsBenchmark ?? 0) - (right.activeWeightVsBenchmark ?? 0),
      )
      .slice(0, 8),
    topBenchmarkGaps: [...finalizedHoldings]
      .filter((holding) => holding.benchmarkWeight != null)
      .sort((left, right) => (right.benchmarkWeight ?? 0) - (left.benchmarkWeight ?? 0))
      .slice(0, 8),
    topUpsidePositions: [...finalizedHoldings]
      .filter((holding) => holding.upsideToFairValue != null)
      .sort((left, right) => (right.upsideToFairValue ?? 0) - (left.upsideToFairValue ?? 0))
      .slice(0, 8),
    stockDetail: finalizedHoldings[0],
    issues,
    audit: {
      parsedWorkbookRows: portfolioSheet.rows.length,
      parsedHoldingRows: workbookRows.length,
      weightedHoldingRows: weightedHoldings.length,
      duplicateIsinCount: countDuplicates(finalizedHoldings.map((holding) => holding.isin)),
      duplicateTickerCount: countDuplicates(finalizedHoldings.map((holding) => holding.ticker)),
      rowsMissingIsin: finalizedHoldings.filter((holding) => !holding.isin).length,
      rowsMissingTicker: finalizedHoldings.filter((holding) => !holding.ticker).length,
      currencyContributionCoverageCount: finalizedHoldings.filter(
        (holding) => holding.currencyContribution != null,
      ).length,
      workbookFallbackCoverageCount: countWorkbookFallbackRows(finalizedHoldings),
      apiReadyByIsinCount: finalizedHoldings.filter((holding) => holding.isin).length,
      apiFallbackTickerCount: finalizedHoldings.filter(
        (holding) => !holding.isin && Boolean(holding.ticker),
      ).length,
      apiMatchedCount: enrichment.records.length,
    },
    enrichmentAudit: enrichment.audit,
  };
}
