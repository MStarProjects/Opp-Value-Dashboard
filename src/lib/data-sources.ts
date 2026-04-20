export type SourceRole =
  | "portfolio_workbook"
  | "pmhub_holdings"
  | "pfv_override"
  | "tme_reference"
  | "unknown";

export interface SourceDescriptor {
  role: SourceRole;
  label: string;
  filenamePatterns: RegExp[];
  requiredHeaders?: string[];
  description: string;
}

export const sourceDescriptors: SourceDescriptor[] = [
  {
    role: "portfolio_workbook",
    label: "Portfolio Workbook",
    filenamePatterns: [/portfolio sheet/i],
    description:
      "Main integrated workbook used today for portfolio metrics, holdings, CRIMs, overrides, and algo views.",
  },
  {
    role: "pmhub_holdings",
    label: "PMHub Holdings",
    filenamePatterns: [/^pmhub-report_/i],
    requiredHeaders: [
      "ticker",
      "security name",
      "isin",
      "weight",
      "roe",
      "pe fy1",
      "price/bk",
    ],
    description:
      "Dated PMHub holdings and financial metric snapshot used as the current holdings backbone.",
  },
  {
    role: "pfv_override",
    label: "PFV Override",
    filenamePatterns: [/pfv/i, /override/i],
    requiredHeaders: [
      "name",
      "ticker",
      "price to fair value",
      "fair value uncertainty",
    ],
    description:
      "Dated override file used to enrich or replace valuation-related stock fields.",
  },
  {
    role: "tme_reference",
    label: "TME Reference",
    filenamePatterns: [/tme/i],
    requiredHeaders: [
      "name",
      "ticker",
      "portfolio weighting %",
      "economic moat",
      "price to fair value",
    ],
    description:
      "Dated reference universe used for comparisons and attribution framing.",
  },
];

export function detectSourceRole(filename: string): SourceRole {
  const lowerName = filename.toLowerCase();

  const matched = sourceDescriptors.find((descriptor) =>
    descriptor.filenamePatterns.every((pattern) => pattern.test(lowerName)),
  );

  return matched?.role ?? "unknown";
}

export function extractDateToken(filename: string): string | undefined {
  const match = filename.match(/(\d{5,8})/);
  return match?.[1];
}
