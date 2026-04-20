import type { SourceRole } from "@/lib/data-sources";

export type SheetRole =
  | "holdings"
  | "metrics"
  | "benchmark"
  | "sector_summary"
  | "model"
  | "time_series"
  | "unknown";

export interface ParsedWorkbook {
  fileName: string;
  sourceRole: SourceRole;
  dateToken?: string;
  sheets: ParsedSheet[];
}

export interface ParsedSheet {
  name: string;
  headers: string[];
  normalizedHeaders: string[];
  rows: ParsedSheetRow[];
}

export type ParsedSheetRow = Record<string, string | number | null>;

export interface WorkbookSheetProfile {
  sheetName: string;
  rowCount: number;
  headerCount: number;
  dateLikeHeaderCount: number;
  identifierHeaderCount: number;
  numericHeaderCount: number;
}

export interface DetectedSheetRole {
  role: SheetRole;
  confidence: number;
  reasons: string[];
}
