import * as XLSX from "xlsx";

import { detectSourceRole, extractDateToken } from "@/lib/data-sources";
import { normalizeHeader } from "@/features/workbook/normalizeHeaders";
import type { ParsedSheet, ParsedWorkbook, ParsedSheetRow } from "@/types/workbook";

function isMeaningfulValue(value: unknown): value is string | number | boolean | Date {
  return value !== null && value !== undefined && value !== "";
}

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

function parseSheet(workbook: XLSX.WorkBook, sheetName: string): ParsedSheet {
  const worksheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | Date)[]>(worksheet, {
    header: 1,
    defval: "",
    raw: false,
  });

  const headerRowIndex = matrix.findIndex((row) => row.some(isMeaningfulValue));
  const headerRow = headerRowIndex >= 0 ? matrix[headerRowIndex] : [];
  const headers = headerRow.map((cell) => String(cell ?? "").trim());
  const normalizedHeaders = headers.map(normalizeHeader);

  const rows: ParsedSheetRow[] = [];

  for (const rawRow of matrix.slice(headerRowIndex + 1)) {
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
  };
}

export async function parseWorkbook(file: File): Promise<ParsedWorkbook> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  return {
    fileName: file.name,
    sourceRole: detectSourceRole(file.name),
    dateToken: extractDateToken(file.name),
    sheets: workbook.SheetNames.map((sheetName) => parseSheet(workbook, sheetName)),
  };
}
