import * as XLSX from "xlsx";

import type { AlgoCountrySeries, AlgoDashboardData, AlgoCountrySnapshot } from "@/types/algo";
import type { ParsedSheet, ParsedWorkbook } from "@/types/workbook";

const targetSheetName = "international_opp_value";
const trailingMonths = 12;
const absoluteValueRowCount = 29;

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

function buildEmptyAlgoDashboardData(note: string): AlgoDashboardData {
  return {
    available: false,
    trailingDateLabels: [],
    rows: [],
    latestCountrySignals: [],
    notes: [note],
  };
}

function selectAlgoWorkbook(workbooks: ParsedWorkbook[]) {
  return (
    workbooks.find((workbook) => workbook.sourceRole === "algo_signal") ??
    workbooks.find((workbook) =>
      workbook.sheets.some((sheet) => sheet.name.toLowerCase() === targetSheetName),
    )
  );
}

function selectAlgoSheet(workbook?: ParsedWorkbook) {
  if (!workbook) {
    return undefined;
  }

  return workbook.sheets.find((sheet) => sheet.name.toLowerCase() === targetSheetName);
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
      countryCode,
      country: explicit,
    };
  }

  try {
    const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
    return {
      countryCode,
      country: displayNames.of(countryCode) ?? identifier,
    };
  } catch {
    return {
      countryCode,
      country: identifier,
    };
  }
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

function buildLatestCountrySignals(rows: AlgoCountrySeries[]): AlgoCountrySnapshot[] {
  return rows
    .map<AlgoCountrySnapshot>((row) => ({
      identifier: row.identifier,
      countryCode: row.countryCode,
      country: row.country,
      value: row.latestValue,
    }))
    .sort((left, right) => left.country.localeCompare(right.country));
}

export function parseAlgoWorkbook(workbooks: ParsedWorkbook[]): AlgoDashboardData {
  const workbook = selectAlgoWorkbook(workbooks);
  if (!workbook) {
    return buildEmptyAlgoDashboardData("No algo workbook is loaded yet.");
  }

  const sheet = selectAlgoSheet(workbook);
  if (!sheet) {
    return buildEmptyAlgoDashboardData(
      "The algo workbook did not include the International_Opp_Value tab.",
    );
  }

  const identifierKey = sheet.normalizedHeaders[0];
  const dateColumns = buildDateColumns(sheet);
  const latestDateColumn = dateColumns[0];
  const latestTwelveColumns = dateColumns.slice(0, trailingMonths).reverse();

  if (!identifierKey || latestTwelveColumns.length === 0) {
    return buildEmptyAlgoDashboardData(
      "The International_Opp_Value tab did not contain the expected date columns.",
    );
  }

  const seriesRows: AlgoCountrySeries[] = [];
  const seenCountryCodes = new Set<string>();

  for (const row of sheet.rows.slice(0, absoluteValueRowCount)) {
    const identifier = asString(row[identifierKey]);
    if (!identifier) {
      continue;
    }

    const resolvedCountry = resolveCountry(identifier);
    if (!resolvedCountry) {
      continue;
    }

    if (seenCountryCodes.has(resolvedCountry.countryCode)) {
      continue;
    }

    seenCountryCodes.add(resolvedCountry.countryCode);

    seriesRows.push({
      identifier,
      countryCode: resolvedCountry.countryCode,
      country: resolvedCountry.country,
      latestValue: latestDateColumn
        ? asPercentWeight(row[latestDateColumn.key])
        : undefined,
      points: latestTwelveColumns.map((column) => ({
        dateKey: column.dateKey,
        dateLabel: column.dateLabel,
        value: asPercentWeight(row[column.key]),
      })),
    });
  }

  if (seriesRows.length === 0) {
    return buildEmptyAlgoDashboardData(
      "The International_Opp_Value tab did not contain parsable country rows.",
    );
  }

  return {
    available: true,
    sourceFileName: workbook.fileName,
    latestDateKey: latestDateColumn?.dateKey,
    latestDateLabel: latestDateColumn?.dateLabel,
    trailingDateLabels: latestTwelveColumns.map((column) => column.dateLabel),
    rows: seriesRows,
    latestCountrySignals: buildLatestCountrySignals(seriesRows),
    notes: [
      "Algo rows are sourced from sheet rows 2 through 30 only.",
      "Algo values are normalized to percentage weights.",
    ],
  };
}
