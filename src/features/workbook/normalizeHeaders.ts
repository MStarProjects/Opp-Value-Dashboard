const aliasMap: Record<string, string> = {
  stock: "securityName",
  security: "securityName",
  name: "securityName",
  company: "securityName",
  ticker: "ticker",
  symbol: "ticker",
  isin: "isin",
  secid: "secid",
  sector: "sector",
  industry: "industry",
  "target weight": "targetWeight",
  weight: "targetWeight",
  "drifted weight": "driftedWeight",
  "current weight": "driftedWeight",
  "benchmark weight": "benchmarkWeight",
  "bm weight": "benchmarkWeight",
  "forward pe": "forwardPE",
  "fwd pe": "forwardPE",
  "price to book": "priceToBook",
  "p/b": "priceToBook",
  roe: "roe",
};

export function normalizeHeader(header: string): string {
  return header
    .trim()
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function canonicalizeHeader(header: string): string {
  const normalized = normalizeHeader(header);

  return aliasMap[normalized] ?? normalized;
}

export function normalizeHeaders(headers: string[]): string[] {
  return headers.map(canonicalizeHeader);
}
