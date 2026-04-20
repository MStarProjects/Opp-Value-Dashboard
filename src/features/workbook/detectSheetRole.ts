import type { DetectedSheetRole, ParsedSheet, SheetRole } from "@/types/workbook";

const roleKeywords: Record<Exclude<SheetRole, "unknown">, string[]> = {
  holdings: ["holding", "portfolio", "opp value", "position"],
  metrics: ["metric", "valuation", "portfolio metrics"],
  benchmark: ["benchmark", "reference", "bm"],
  sector_summary: ["sector"],
  model: ["algo", "model"],
  time_series: ["history", "timeseries", "monthly", "quarterly"],
};

export function detectSheetRole(sheet: ParsedSheet): DetectedSheetRole {
  const reasons: string[] = [];
  const sheetName = sheet.name.toLowerCase();
  const headerSet = new Set(sheet.normalizedHeaders);

  let role: SheetRole = "unknown";
  let confidence = 0.2;

  for (const [candidateRole, keywords] of Object.entries(roleKeywords) as [
    SheetRole,
    string[],
  ][]) {
    if (keywords.some((keyword) => sheetName.includes(keyword))) {
      role = candidateRole;
      confidence += 0.35;
      reasons.push(`Sheet name matches ${candidateRole} keywords.`);
      break;
    }
  }

  if (headerSet.has("securityName") && headerSet.has("ticker")) {
    role = "holdings";
    confidence += 0.25;
    reasons.push("Contains security-level identifier headers.");
  }

  if (headerSet.has("benchmarkWeight")) {
    confidence += 0.1;
    reasons.push("Contains benchmark weight data.");
  }

  if (headerSet.has("sector") && !headerSet.has("securityName")) {
    role = "sector_summary";
    confidence += 0.2;
    reasons.push("Contains sector field without obvious security-level detail.");
  }

  return {
    role,
    confidence: Math.min(confidence, 0.95),
    reasons,
  };
}
