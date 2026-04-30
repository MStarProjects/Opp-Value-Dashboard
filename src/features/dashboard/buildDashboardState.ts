import {
  buildCountryExposure,
  buildIndustryExposure,
  buildMoatDistribution,
  buildPfvDistribution,
  buildSectorExposure,
} from "@/features/calculations/sectorAggregation";
import { parseAlgoWorkbook } from "@/features/algo/parseAlgoWorkbook";
import { summarizePortfolio } from "@/features/calculations/portfolioMetrics";
import { enrichPortfolioHoldings } from "@/features/morningstar/enrichPortfolioHoldings";
import { detectHoldingIssues } from "@/features/reconciliation/issueDetection";
import {
  appendRetentionNote,
  computeWorkbookHash,
  describeRetainedSnapshot,
  loadLatestConfiguredSnapshot,
  persistRetentionSnapshot,
} from "@/lib/data-retention";
import {
  pmhubFieldAliases,
  type PmhubFieldKey,
} from "@/lib/pmhub-workbook-contract";
import { formatDateToken, pickLatestWorkbooksByRole } from "@/lib/data-sources";
import { getSleeveConfig, type SleeveId } from "@/lib/sleeves";
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

function resolveCountryName(value?: string) {
  const normalized = asString(value);
  if (!normalized) {
    return undefined;
  }

  const explicitNames: Record<string, string> = {
    GB: "United Kingdom",
    UK: "United Kingdom",
    US: "United States",
    UAE: "United Arab Emirates",
    AUS: "Australia",
    BRA: "Brazil",
    CAN: "Canada",
    CHE: "Switzerland",
    CHN: "China",
    DEU: "Germany",
    DNK: "Denmark",
    ESP: "Spain",
    FIN: "Finland",
    FRA: "France",
    GBR: "United Kingdom",
    HKG: "Hong Kong",
    IDN: "Indonesia",
    IND: "India",
    IRL: "Ireland",
    ITA: "Italy",
    JPN: "Japan",
    KOR: "South Korea",
    MEX: "Mexico",
    NLD: "Netherlands",
    SGP: "Singapore",
    SWE: "Sweden",
    TWN: "Taiwan",
    USA: "United States",
    "--": "Cash / Currency",
  };

  const upper = normalized.toUpperCase();
  if (explicitNames[upper]) {
    return explicitNames[upper];
  }

  if (/^[A-Z]{2}$/.test(upper)) {
    try {
      const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
      return displayNames.of(upper) ?? normalized;
    } catch {
      return normalized;
    }
  }

  return normalized;
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

function getWeight(
  row: ParsedSheetRow,
  sheet: ParsedSheet,
  weightColumnIndex: number,
): number | undefined {
  const directWeight = getFieldNumber(row, "weight");
  if (directWeight != null) {
    return directWeight;
  }

  const fallbackHeader = sheet.normalizedHeaders[weightColumnIndex];
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

function looksLikeHolding(row: ParsedSheetRow, sheet: ParsedSheet, weightColumnIndex: number) {
  return Boolean(
    getFieldString(row, "securityName") ||
      getFieldString(row, "isin") ||
      getFieldString(row, "ticker") ||
      getWeight(row, sheet, weightColumnIndex) != null,
  );
}

function mapWorkbookRows(
  sheet: ParsedSheet,
  weightColumnIndex: number,
): CanonicalHolding[] {
  return sheet.rows
    .filter((row) => looksLikeHolding(row, sheet, weightColumnIndex))
    .map((row, index) => ({
      canonicalId: buildCanonicalId(row, `pmhub-${index}`),
      securityName: getFieldString(row, "securityName") ?? "Unknown Security",
      ticker: getFieldString(row, "ticker"),
      isin: getFieldString(row, "isin"),
      cusip: getFieldString(row, "cusip"),
      sedol: getFieldString(row, "sedol"),
      country:
        getFieldString(row, "businessCountry") ??
        resolveCountryName(getFieldString(row, "country")),
      currency: getFieldString(row, "currency"),
      sector: getFieldString(row, "sector"),
      industry: getFieldString(row, "industry"),
      currencyContribution: getFieldNumber(row, "currencyContribution"),
      targetWeight: getWeight(row, sheet, weightColumnIndex),
      price: getFieldNumber(row, "price"),
      mtdReturn: getFieldNumber(row, "mtdReturn"),
      oneMonthReturn: getFieldNumber(row, "oneMonthReturn"),
      ytdReturn: getFieldNumber(row, "ytdReturn"),
      oneYearReturn: getFieldNumber(row, "oneYearReturn"),
      contributionToReturnMtd: getFieldNumber(row, "contributionToReturnMtd"),
      contributionToReturnYtd: getFieldNumber(row, "contributionToReturnYtd"),
      contributionToReturnOneMonth: getFieldNumber(
        row,
        "contributionToReturnOneMonth",
      ),
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

function indexHoldingsForDetailRows(holdings: CanonicalHolding[]) {
  const index = new Map<string, CanonicalHolding>();

  for (const holding of holdings) {
    const keys = [
      normalizeIdentifier(holding.secid),
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

function mapBenchmarkRecordToHolding(
  record: Record<string, string | number | boolean | null>,
): CanonicalHolding | undefined {
  const securityName = asString(
    (record.name as string | number | null | undefined) ??
      (record.Name as string | number | null | undefined),
  );
  const benchmarkWeight = asNumber(
    (record.weight as string | number | null | undefined) ??
      (record.Weight as string | number | null | undefined),
  );

  if (!securityName || benchmarkWeight == null) {
    return undefined;
  }

  const secid = asString(
    (record.secId as string | number | null | undefined) ??
      (record.SecId as string | number | null | undefined),
  );
  const isin = asString(
    (record.isin as string | number | null | undefined) ??
      (record.ISIN as string | number | null | undefined),
  );
  const ticker = asString(
    (record.ticker as string | number | null | undefined) ??
      (record.Ticker as string | number | null | undefined),
  );
  const country = resolveCountryName(
    asString(
      (record.country as string | number | null | undefined) ??
        (record.Country as string | number | null | undefined) ??
        (record.businessCountry as string | number | null | undefined) ??
        (record["Business Country"] as string | number | null | undefined),
    ),
  );
  const sector = asString(
    (record.sector as string | number | null | undefined) ??
      (record.Sector as string | number | null | undefined) ??
      (record.gicsSector as string | number | null | undefined) ??
      (record["GICS Sector"] as string | number | null | undefined),
  );
  const industry = asString(
    (record.industry as string | number | null | undefined) ??
      (record.Industry as string | number | null | undefined) ??
      (record.gicsIndustry as string | number | null | undefined) ??
      (record["GICS Industry"] as string | number | null | undefined),
  );

  return {
    canonicalId: `benchmark::${normalizeIdentifier(secid) ?? normalizeIdentifier(isin) ?? normalizeIdentifier(ticker) ?? normalizeIdentifier(securityName) ?? securityName}`,
    securityName,
    isin,
    ticker,
    secid,
    cusip: asString(
      (record.cusip as string | number | null | undefined) ??
        (record.CUSIP as string | number | null | undefined),
    ),
    country,
    sector,
    industry,
    targetWeight: 0,
    benchmarkWeight,
    priceToFairValue: asNumber(
      (record.priceToFairValue as string | number | null | undefined) ??
        (record["Price To Fair Value"] as string | number | null | undefined),
    ),
    upsideToFairValue: undefined,
    forwardPE: asNumber(
      (record.forwardPE as string | number | null | undefined) ??
        (record["Forward P/E"] as string | number | null | undefined) ??
        (record["Forward PE"] as string | number | null | undefined),
    ),
    priceToBook: asNumber(
      (record.priceToBook as string | number | null | undefined) ??
        (record["Price To Book"] as string | number | null | undefined) ??
        (record["P/B"] as string | number | null | undefined),
    ),
    roe: asNumber(
      (record.roe as string | number | null | undefined) ??
        (record.ROE as string | number | null | undefined),
    ),
    moat: asString(
      (record.moat as string | number | null | undefined) ??
        (record.Moat as string | number | null | undefined),
    ),
    uncertainty: asString(
      (record.uncertainty as string | number | null | undefined) ??
        (record["Fair Value Uncertainty"] as string | number | null | undefined),
    ),
    apiReturn1M: asNumber(
      record.apiReturn1M as string | number | null | undefined,
    ),
    apiReturnMtd: asNumber(
      record.apiReturnMtd as string | number | null | undefined,
    ),
    apiReturnYtd: asNumber(
      record.apiReturnYtd as string | number | null | undefined,
    ),
    apiReturn1Y: asNumber(
      record.apiReturn1Y as string | number | null | undefined,
    ),
    sourceSheets: ["Benchmark"],
    matchMethod: "benchmark_only",
    matchConfidence: 1,
    reconciliationStatus: "matched",
    dataQualityFlags: [],
  };
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
    holding.industry = record.industry ?? holding.industry;
    holding.country = resolveCountryName(record.country) ?? holding.country;
    holding.secid =
      record.identifier.secid ?? record.matchedBenchmark?.secId ?? holding.secid;
    holding.apiReturn1M = record.apiReturn1M ?? holding.apiReturn1M;
    holding.apiReturnMtd = record.apiReturnMtd ?? holding.apiReturnMtd;
    holding.apiReturnYtd = record.apiReturnYtd ?? holding.apiReturnYtd;
    holding.apiReturn1Y = record.apiReturn1Y ?? holding.apiReturn1Y;
    holding.hasApiPriceToFairValue =
      record.priceToFairValue != null ? true : holding.hasApiPriceToFairValue;
    holding.hasApiMoat = record.moat != null ? true : holding.hasApiMoat;
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
      upsideToFairValue:
        holding.priceToFairValue != null && holding.priceToFairValue !== 0
          ? 1 / holding.priceToFairValue - 1
          : undefined,
      dataQualityFlags: [
        ...(holding.isin == null ? ["Missing ISIN"] : []),
        ...(holding.ticker == null ? ["Missing ticker"] : []),
        ...(holding.priceToFairValue == null ? ["Missing PFV"] : []),
        ...(holding.benchmarkWeight == null ? ["Missing benchmark weight"] : []),
      ],
    }))
    .sort((left, right) => (right.targetWeight ?? 0) - (left.targetWeight ?? 0));
}

function buildDetailRows(
  portfolioHoldings: CanonicalHolding[],
  benchmarkRecords?: Array<Record<string, string | number | boolean | null>>,
) {
  const detailRows = portfolioHoldings.map((holding) => ({ ...holding }));
  const detailIndex = indexHoldingsForDetailRows(detailRows);

  for (const record of benchmarkRecords ?? []) {
    const benchmarkHolding = mapBenchmarkRecordToHolding(record);
    if (!benchmarkHolding) {
      continue;
    }

    const keys = [
      normalizeIdentifier(benchmarkHolding.secid),
      normalizeIdentifier(benchmarkHolding.isin),
      normalizeIdentifier(benchmarkHolding.ticker),
      normalizeIdentifier(benchmarkHolding.securityName),
    ].filter(Boolean) as string[];

    const existing = keys.map((key) => detailIndex.get(key)).find(Boolean);
    if (existing) {
      existing.benchmarkWeight = benchmarkHolding.benchmarkWeight ?? existing.benchmarkWeight;
      existing.secid = existing.secid ?? benchmarkHolding.secid;
      existing.country = existing.country ?? benchmarkHolding.country;
      existing.sector = existing.sector ?? benchmarkHolding.sector;
      existing.industry = existing.industry ?? benchmarkHolding.industry;
      existing.priceToFairValue =
        existing.priceToFairValue ?? benchmarkHolding.priceToFairValue;
      existing.forwardPE = existing.forwardPE ?? benchmarkHolding.forwardPE;
      existing.priceToBook = existing.priceToBook ?? benchmarkHolding.priceToBook;
      existing.roe = existing.roe ?? benchmarkHolding.roe;
      existing.moat = existing.moat ?? benchmarkHolding.moat;
      existing.uncertainty = existing.uncertainty ?? benchmarkHolding.uncertainty;
      existing.apiReturn1M = existing.apiReturn1M ?? benchmarkHolding.apiReturn1M;
      existing.apiReturnMtd = existing.apiReturnMtd ?? benchmarkHolding.apiReturnMtd;
      existing.apiReturnYtd = existing.apiReturnYtd ?? benchmarkHolding.apiReturnYtd;
      existing.apiReturn1Y = existing.apiReturn1Y ?? benchmarkHolding.apiReturn1Y;
      continue;
    }

    const finalizedBenchmarkHolding = finalizeHoldings([benchmarkHolding])[0];
    detailRows.push(finalizedBenchmarkHolding);

    for (const key of keys) {
      if (!detailIndex.has(key)) {
        detailIndex.set(key, finalizedBenchmarkHolding);
      }
    }
  }

  return detailRows.sort((left, right) => {
    const leftOwned = (left.targetWeight ?? 0) > 0 ? 1 : 0;
    const rightOwned = (right.targetWeight ?? 0) > 0 ? 1 : 0;

    if (leftOwned !== rightOwned) {
      return rightOwned - leftOwned;
    }

    if ((right.targetWeight ?? 0) !== (left.targetWeight ?? 0)) {
      return (right.targetWeight ?? 0) - (left.targetWeight ?? 0);
    }

    return (right.benchmarkWeight ?? 0) - (left.benchmarkWeight ?? 0);
  });
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

function selectPortfolioWorkbook(workbooks: ParsedWorkbook[], sleeveId: SleeveId) {
  const sleeveConfig = getSleeveConfig(sleeveId);
  return workbooks.find(
    (workbook) => workbook.sourceRole === sleeveConfig.portfolioSourceRole,
  );
}

function selectPortfolioSheet(workbook: ParsedWorkbook | undefined, sleeveId: SleeveId) {
  if (!workbook) {
    return undefined;
  }

  const { pmhubContract } = getSleeveConfig(sleeveId);

  return (
    workbook.sheets.find(
      (sheet) => sheet.name.toLowerCase() === pmhubContract.sheetName.toLowerCase(),
    ) ?? workbook.sheets[0]
  );
}

function selectAlgoWorkbook(workbooks: ParsedWorkbook[]) {
  return (
    workbooks.find((workbook) => workbook.sourceRole === "algo_signal") ??
    workbooks.find((workbook) =>
      workbook.sheets.some((sheet) => sheet.name.toLowerCase() === "international_opp_value"),
    )
  );
}

function formatMorningstarAsOfLabel(dateValue?: string) {
  if (!dateValue) {
    return undefined;
  }

  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) {
    return dateValue;
  }

  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function withAlgoDashboardState(
  dashboardState: DashboardState,
  fallbackAlgo: DashboardState["algo"],
  sleeveId: SleeveId,
): DashboardState {
  return {
    ...dashboardState,
    sleeveId,
    algo: fallbackAlgo.available ? fallbackAlgo : dashboardState.algo,
    industryExposure: dashboardState.industryExposure ?? [],
  };
}

interface DashboardRetentionOptions {
  workbookBuffer?: Uint8Array;
  allowRetentionFallback?: boolean;
  persistSnapshots?: boolean;
  snapshotReason?: string;
}

export async function buildDashboardState(
  rawWorkbooks: ParsedWorkbook[],
  options?: {
    preferStubEnrichment?: boolean;
    sleeveId?: SleeveId;
    retention?: DashboardRetentionOptions;
  },
): Promise<DashboardState> {
  const sleeveId = options?.sleeveId ?? "global_xus";
  const sleeveConfig = getSleeveConfig(sleeveId);
  const workbooks = pickLatestWorkbooksByRole(rawWorkbooks);
  const portfolioWorkbook = selectPortfolioWorkbook(workbooks, sleeveId);
  const portfolioSheet = selectPortfolioSheet(portfolioWorkbook, sleeveId);
  const algoWorkbook = selectAlgoWorkbook(workbooks);
  const algo = parseAlgoWorkbook(workbooks, sleeveId);
  const retentionOptions = options?.retention;
  const workbookHash = retentionOptions?.workbookBuffer
    ? computeWorkbookHash(retentionOptions.workbookBuffer)
    : undefined;
  const retainedSnapshot =
    retentionOptions?.allowRetentionFallback && workbookHash
      ? await loadLatestConfiguredSnapshot(workbookHash)
      : undefined;
  const normalizedRetainedDashboardState = retainedSnapshot
    ? withAlgoDashboardState(retainedSnapshot.dashboardState, algo, sleeveId)
    : undefined;

  if (!portfolioSheet || !portfolioWorkbook) {
    return {
      sleeveId,
      asOfLabel: undefined,
      morningstarAsOfLabel: undefined,
      sources: [],
      algo,
      holdings: [],
      detailRows: [],
      summary: summarizePortfolio([]),
      sectorExposure: [],
      countryExposure: [],
      industryExposure: [],
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
        benchmarkInvestmentId: sleeveConfig.pmhubContract.benchmarkInvestmentId,
        directDataSetIdOrName: sleeveConfig.pmhubContract.directDataSetIdOrName,
        requestedFieldGroups: [],
        matchedByIsin: 0,
        matchedByTicker: 0,
        unmatchedHoldings: 0,
        workbookFallbackRows: 0,
        benchmarkConstituentCount: 0,
        notes: [
          `No PMHub workbook is loaded yet for ${sleeveConfig.tabLabel}. Upload one to unlock this sleeve.`,
        ],
      },
    };
  }

  if (options?.preferStubEnrichment && retainedSnapshot) {
    const retainedDashboardState = normalizedRetainedDashboardState!;
    return describeRetainedSnapshot(
      {
        ...retainedDashboardState,
        morningstarAsOfLabel:
          retainedDashboardState.morningstarAsOfLabel ??
          formatMorningstarAsOfLabel(retainedSnapshot.entry.createdAt),
      },
      retainedSnapshot.entry,
      "Loaded the latest retained live snapshot instead of a fresh Morningstar pull.",
    );
  }

  const workbookRows = mapWorkbookRows(
    portfolioSheet,
    sleeveConfig.pmhubContract.weightColumnIndex,
  );
  const weightedHoldings = workbookRows.filter((holding) => (holding.targetWeight ?? 0) > 0);
  const enrichment = await enrichPortfolioHoldings(weightedHoldings, {
    preferStub: options?.preferStubEnrichment,
    sleeveConfig,
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
    ...(algoWorkbook && algoWorkbook.fileName !== portfolioWorkbook.fileName
      ? [
          {
            fileName: algoWorkbook.fileName,
            role: algoWorkbook.sourceRole,
            dateToken: algoWorkbook.dateToken,
            dateLabel: formatDateToken(algoWorkbook.dateToken),
            sheetCount: algoWorkbook.sheets.length,
          } satisfies SourceSnapshot,
        ]
      : []),
  ];

  let dashboardState: DashboardState = {
    sleeveId,
    asOfLabel: sources[0]?.dateLabel,
    morningstarAsOfLabel:
      enrichment.audit.status === "configured"
        ? formatMorningstarAsOfLabel(new Date().toISOString())
        : undefined,
    sources,
    algo,
    holdings: finalizedHoldings,
    detailRows: buildDetailRows(finalizedHoldings, enrichment.benchmarkHoldings?.records),
    summary: summarizePortfolio(finalizedHoldings),
    sectorExposure: buildSectorExposure(finalizedHoldings),
    countryExposure: buildCountryExposure(finalizedHoldings),
    industryExposure: buildIndustryExposure(finalizedHoldings),
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

  if (retentionOptions?.persistSnapshots && retentionOptions.workbookBuffer) {
    try {
      const retentionEntry = await persistRetentionSnapshot({
        parsedWorkbook: portfolioWorkbook,
        workbookBuffer: retentionOptions.workbookBuffer,
        dashboardState,
        enrichment,
        snapshotReason: retentionOptions.snapshotReason ?? "dashboard_refresh",
      });

      dashboardState = appendRetentionNote(
        dashboardState,
        enrichment.audit.status === "configured"
          ? `Saved this PMHub workbook and Morningstar pull into the local retention store for ${retentionEntry.snapshotDate}.`
          : `Saved this PMHub workbook into the local retention store for ${retentionEntry.snapshotDate} without a live Morningstar pull.`,
      );
    } catch (error) {
      dashboardState = appendRetentionNote(
        dashboardState,
        error instanceof Error
          ? `Retention save failed: ${error.message}`
          : "Retention save failed.",
      );
    }
  }

  if (enrichment.audit.status !== "configured" && retainedSnapshot) {
    const retainedDashboardState = normalizedRetainedDashboardState!;
    return describeRetainedSnapshot(
      {
        ...retainedDashboardState,
        morningstarAsOfLabel:
          retainedDashboardState.morningstarAsOfLabel ??
          formatMorningstarAsOfLabel(retainedSnapshot.entry.createdAt),
      },
      retainedSnapshot.entry,
      "Live Morningstar refresh was unavailable, so the dashboard is using the latest retained live snapshot.",
    );
  }

  return dashboardState;
}
