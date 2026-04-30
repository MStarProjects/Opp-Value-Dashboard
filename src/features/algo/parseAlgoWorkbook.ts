import * as XLSX from "xlsx";

import { getSleeveConfig, type SleeveId } from "@/lib/sleeves";
import type { AlgoDashboardData, AlgoSeriesRow, AlgoSignalSnapshot } from "@/types/algo";
import type { ParsedSheet, ParsedWorkbook } from "@/types/workbook";

const trailingMonths = 12;

const explicitCountryNames: Record<string, string> = {
  AT: "Austria",
  AU: "Australia",
  BE: "Belgium",
  BR: "Brazil",
  CA: "Canada",
  CH: "Switzerland",
  CN: "China",
  DE: "Germany",
  DK: "Denmark",
  ES: "Spain",
  FI: "Finland",
  FR: "France",
  HK: "Hong Kong",
  IE: "Ireland",
  IL: "Israel",
  IN: "India",
  IT: "Italy",
  JP: "Japan",
  KR: "South Korea",
  MX: "Mexico",
  NL: "Netherlands",
  NO: "Norway",
  NZ: "New Zealand",
  PT: "Portugal",
  SE: "Sweden",
  SG: "Singapore",
  TW: "Taiwan",
  UK: "United Kingdom",
  ZA: "South Africa",
};

const usSectorNames: Record<string, string> = {
  "US IT EQ": "Technology",
  "US FN EQ": "Financial Services",
  "US HC EQ": "Healthcare",
  "US CD EQ": "Consumer Cyclical",
  "US ID EQ": "Industrials",
  "US TL EQ": "Communication Services",
  "US CS EQ": "Consumer Defensive",
  "US EN EQ": "Energy",
  "US MT EQ": "Basic Materials",
  "US REIT": "Real Estate",
  "US UT EQ": "Utilities",
};

interface ParsedDateColumn {
  key: string;
  dateKey: string;
  dateLabel: string;
}

function asString(value: string | number | null | undefined) {
  if (value == null) {
    return undefined;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : undefined;
}

function asNumber(value: string | number | null | undefined) {
  if (value == null || value === "") {
    return undefined;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function asPercentWeight(value: string | number | null | undefined) {
  const numericValue = asNumber(value);
  if (numericValue == null) {
    return undefined;
  }

  return numericValue * 100;
}

function buildEmptyAlgoDashboardData(
  mode: AlgoDashboardData["mode"],
  note: string,
): AlgoDashboardData {
  return {
    available: false,
    mode,
    trailingDateLabels: [],
    rows: [],
    latestSignals: [],
    notes: [note],
  };
}

function selectAlgoWorkbook(workbooks: ParsedWorkbook[]) {
  return (
    workbooks.find((workbook) => workbook.sourceRole === "algo_signal") ??
    workbooks.find((workbook) =>
      workbook.sheets.some((sheet) =>
        ["international_opp_value", "us_opp_value"].includes(sheet.name.toLowerCase()),
      ),
    )
  );
}

function selectAlgoSheet(workbook: ParsedWorkbook | undefined, sleeveId: SleeveId) {
  if (!workbook) {
    return undefined;
  }

  const { algoContract } = getSleeveConfig(sleeveId);
  return workbook.sheets.find(
    (sheet) => sheet.name.toLowerCase() === algoContract.sheetName.toLowerCase(),
  );
}

function parseHeaderDate(rawHeader: string): ParsedDateColumn | undefined {
  const normalizedHeader = rawHeader.trim();
  if (!normalizedHeader) {
    return undefined;
  }

  const serial = Number(normalizedHeader);
  if (Number.isFinite(serial)) {
    const parsed = XLSX.SSF.parse_date_code(serial);
    if (parsed) {
      const date = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
      return {
        key: normalizedHeader,
        dateKey: date.toISOString(),
        dateLabel: date.toLocaleDateString("en-US", {
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        }),
      };
    }
  }

  const parsedStringDate = new Date(normalizedHeader);
  if (Number.isNaN(parsedStringDate.getTime())) {
    return undefined;
  }

  const date = new Date(
    Date.UTC(
      parsedStringDate.getFullYear(),
      parsedStringDate.getMonth(),
      parsedStringDate.getDate(),
    ),
  );
  return {
    key: normalizedHeader,
    dateKey: date.toISOString(),
    dateLabel: date.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }),
  };
}

function resolveCountry(identifier: string) {
  const countryCode = identifier.split(/\s+/)[0]?.toUpperCase();
  if (!countryCode || !/^[A-Z]{2}$/.test(countryCode)) {
    return undefined;
  }

  const explicit = explicitCountryNames[countryCode];
  if (explicit) {
    return {
      labelKey: countryCode,
      label: explicit,
    };
  }

  try {
    const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
    return {
      labelKey: countryCode,
      label: displayNames.of(countryCode) ?? identifier,
    };
  } catch {
    return {
      labelKey: countryCode,
      label: identifier,
    };
  }
}

function resolveUsSector(identifier: string) {
  const normalized = identifier.trim().toUpperCase();
  const label = usSectorNames[normalized];
  if (!label) {
    return undefined;
  }

  return {
    labelKey: normalized,
    label,
  };
}

function shouldStopAtRowBoundary(
  identifier: string | undefined,
  resolvedLabel: { labelKey: string; label: string } | undefined,
  parsedRowCount: number,
) {
  if (parsedRowCount === 0) {
    return false;
  }

  if (!identifier) {
    return true;
  }

  if (!resolvedLabel) {
    return true;
  }

  return false;
}

function buildDateColumns(sheet: ParsedSheet) {
  return sheet.headers
    .slice(1)
    .map((header, index) => {
      const parsed = parseHeaderDate(header);
      if (!parsed) {
        return undefined;
      }

      return {
        ...parsed,
        key: sheet.normalizedHeaders[index + 1] ?? header,
      };
    })
    .filter((column): column is ParsedDateColumn => Boolean(column));
}

function buildLatestSignals(rows: AlgoSeriesRow[]): AlgoSignalSnapshot[] {
  return rows
    .map<AlgoSignalSnapshot>((row) => ({
      identifier: row.identifier,
      labelKey: row.labelKey,
      label: row.label,
      value: row.latestValue,
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function resolveAlgoLabel(
  sleeveId: SleeveId,
  identifier: string,
): { labelKey: string; label: string } | undefined {
  if (getSleeveConfig(sleeveId).algoContract.mode === "country") {
    return resolveCountry(identifier);
  }

  return resolveUsSector(identifier);
}

export function parseAlgoWorkbook(
  workbooks: ParsedWorkbook[],
  sleeveId: SleeveId,
): AlgoDashboardData {
  const { algoContract } = getSleeveConfig(sleeveId);
  const workbook = selectAlgoWorkbook(workbooks);
  if (!workbook) {
    return buildEmptyAlgoDashboardData(algoContract.mode, "No algo workbook is loaded yet.");
  }

  const sheet = selectAlgoSheet(workbook, sleeveId);
  if (!sheet) {
    return buildEmptyAlgoDashboardData(
      algoContract.mode,
      `The algo workbook did not include the ${algoContract.sheetName} tab.`,
    );
  }

  const identifierKey = sheet.normalizedHeaders[0];
  const dateColumns = buildDateColumns(sheet);
  const latestDateColumn = dateColumns[0];
  const latestTwelveColumns = dateColumns.slice(0, trailingMonths).reverse();

  if (!identifierKey || !latestDateColumn || latestTwelveColumns.length === 0) {
    return buildEmptyAlgoDashboardData(
      algoContract.mode,
      `The ${algoContract.sheetName} tab did not contain the expected date columns.`,
    );
  }

  const seriesRows: AlgoSeriesRow[] = [];
  const seenLabelKeys = new Set<string>();
  const candidateRows = sheet.rows.slice(
    algoContract.rowStartIndex,
    algoContract.rowEndIndex + 1,
  );

  for (const row of candidateRows) {
    const identifier = asString(row[identifierKey]);
    const resolvedLabel = identifier ? resolveAlgoLabel(sleeveId, identifier) : undefined;
    if (shouldStopAtRowBoundary(identifier, resolvedLabel, seriesRows.length)) {
      break;
    }

    if (!identifier || !resolvedLabel) {
      continue;
    }

    if (seenLabelKeys.has(resolvedLabel.labelKey)) {
      continue;
    }

    seenLabelKeys.add(resolvedLabel.labelKey);

    seriesRows.push({
      identifier,
      labelKey: resolvedLabel.labelKey,
      label: resolvedLabel.label,
      latestValue: asPercentWeight(row[latestDateColumn.key]),
      points: latestTwelveColumns.map((column) => ({
        dateKey: column.dateKey,
        dateLabel: column.dateLabel,
        value: asPercentWeight(row[column.key]),
      })),
    });
  }

  if (seriesRows.length === 0) {
    return buildEmptyAlgoDashboardData(
      algoContract.mode,
      `The ${algoContract.sheetName} tab did not contain parsable ${algoContract.mode} rows.`,
    );
  }

  return {
    available: true,
    mode: algoContract.mode,
    sourceFileName: workbook.fileName,
    latestDateKey: latestDateColumn?.dateKey,
    latestDateLabel: latestDateColumn?.dateLabel,
    trailingDateLabels: latestTwelveColumns.map((column) => column.dateLabel),
    rows: seriesRows,
    latestSignals: buildLatestSignals(seriesRows),
    notes: [
      `Algo rows are sourced from ${algoContract.sheetName} rows ${algoContract.rowStartIndex + 1} through ${algoContract.rowEndIndex + 1} only.`,
      "Algo values are normalized to percentage weights.",
    ],
  };
}
