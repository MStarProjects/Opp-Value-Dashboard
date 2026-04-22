import * as XLSX from "xlsx";

import { detectSourceRole, extractDateToken } from "@/lib/data-sources";
import { pmhubWorkbookContract } from "@/lib/pmhub-workbook-contract";
import { normalizeHeader } from "@/features/workbook/normalizeHeaders";
import type { ParsedSheet, ParsedWorkbook, ParsedSheetRow } from "@/types/workbook";

const knownHeaderTerms = new Set([
  "stock",
  "security",
  "security name",
  "name",
  "ticker",
  "symbol",
  "isin",
  "secid",
  "cusip",
  "sedol",
  "country",
  "country code",
  "last/price",
  "sector",
  "weight",
  "price/bk",
  "pe fy1",
  "currency contrib",
  "contribution to return - mtd",
  "contribution to return - ytd",
  "contribution to return - 1 mo",
  "economic moat",
  "fair value uncertainty",
  "roe",
]);

function normalizeCellValue(value: unknown): string | number | null {
  if (value == null || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value).trim();
}

function scoreHeaderRow(row: unknown[]): number {
  const normalizedCells = row
    .map((cell) => normalizeHeader(String(cell ?? "")))
    .filter(Boolean);

  const knownHits = normalizedCells.filter((cell) => knownHeaderTerms.has(cell)).length;
  return knownHits * 10 + normalizedCells.length;
}

function detectHeaderRowIndex(matrix: unknown[][]): number {
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestIndex = 0;

  for (let index = 0; index < Math.min(matrix.length, 10); index += 1) {
    const row = matrix[index];
    const score = scoreHeaderRow(row);

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function parseSheet(
  workbook: XLSX.WorkBook,
  sheetName: string,
  options?: {
    headerRowIndex?: number;
    dataStartRowIndex?: number;
  },
): ParsedSheet {
  const worksheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | Date)[]>(worksheet, {
    header: 1,
    defval: "",
    raw: false,
  });

  const headerRowIndex = options?.headerRowIndex ?? detectHeaderRowIndex(matrix);
  const headerRow = headerRowIndex >= 0 ? matrix[headerRowIndex] : [];
  const dataStartRowIndex = options?.dataStartRowIndex ?? headerRowIndex + 1;
  const headers = headerRow.map((cell) => String(cell ?? "").trim());
  const normalizedHeaders = headers.map(normalizeHeader);

  const rows: ParsedSheetRow[] = [];

  for (const rawRow of matrix.slice(dataStartRowIndex)) {
    const row: ParsedSheetRow = {};

    normalizedHeaders.forEach((header, index) => {
      if (!header) {
        return;
      }

      row[header] = normalizeCellValue(rawRow[index]);
    });

    const hasValue = Object.values(row).some((value) => value !== null);
    if (hasValue) {
      rows.push(row);
    }
  }

  return {
    name: sheetName,
    headers,
    normalizedHeaders,
    rows,
    headerRowIndex,
    dataStartRowIndex,
  };
}

export function parseWorkbookData(
  fileName: string,
  data: ArrayBuffer | Uint8Array,
): ParsedWorkbook {
  const workbook =
    data instanceof Uint8Array
      ? XLSX.read(data, { type: "buffer" })
      : XLSX.read(data, { type: "array" });
  const sourceRole = detectSourceRole(fileName);
  const looksLikePmhubWorkbook =
    workbook.SheetNames.length === 1 &&
    workbook.SheetNames[0].toLowerCase() === pmhubWorkbookContract.sheetName.toLowerCase();

  return {
    fileName,
    sourceRole,
    dateToken: extractDateToken(fileName),
    sheets: workbook.SheetNames.map((sheetName) =>
      parseSheet(
        workbook,
        sheetName,
        (sourceRole === "pmhub_portfolio" || looksLikePmhubWorkbook) &&
          sheetName.toLowerCase() === pmhubWorkbookContract.sheetName.toLowerCase()
          ? {
              headerRowIndex: pmhubWorkbookContract.headerRowIndex,
              dataStartRowIndex: pmhubWorkbookContract.dataStartRowIndex,
            }
          : undefined,
      ),
    ),
  };
}

export async function parseWorkbook(file: File): Promise<ParsedWorkbook> {
  const buffer = await file.arrayBuffer();
  return parseWorkbookData(file.name, buffer);
}
