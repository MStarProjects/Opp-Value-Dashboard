import type { ParsedWorkbook } from "@/types/workbook";

export type SourceRole =
  | "pmhub_global_xus"
  | "pmhub_us_opp"
  | "pmhub_consumer"
  | "pmhub_dividend"
  | "algo_signal"
  | "presentation_example"
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
    role: "pmhub_global_xus",
    label: "PMHub Portfolio - Global xUS",
    filenamePatterns: [/^pmhub-report_/i],
    description:
      "Owned monthly PMHub holdings workbook used as the Global xUS portfolio input.",
  },
  {
    role: "pmhub_us_opp",
    label: "PMHub Portfolio - US Opp Value",
    filenamePatterns: [/^usopp_/i],
    description:
      "Owned monthly PMHub holdings workbook used as the US Opp Value portfolio input.",
  },
  {
    role: "algo_signal",
    label: "Equity Algo",
    filenamePatterns: [/equity algo/i],
    description:
      "Monthly country-level algo workbook used for country signal overlays and time-series review.",
  },
  {
    role: "presentation_example",
    label: "Presentation Example",
    filenamePatterns: [/portfolio sheet/i],
    description:
      "Legacy Excel workbook used as a layout reference for the eventual product output.",
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

function parseDateToken(token?: string): Date | undefined {
  if (!token) {
    return undefined;
  }

  const digits = token.replace(/\D/g, "");
  let month = "";
  let day = "";
  let year = "";

  if (digits.length === 5) {
    month = digits.slice(0, 1);
    day = digits.slice(1, 3);
    year = digits.slice(3, 5);
  } else if (digits.length === 6) {
    month = digits.slice(0, 2);
    day = digits.slice(2, 4);
    year = digits.slice(4, 6);
  } else if (digits.length === 7) {
    month = digits.slice(0, 1);
    day = digits.slice(1, 3);
    year = digits.slice(3, 7);
  } else if (digits.length === 8) {
    month = digits.slice(0, 2);
    day = digits.slice(2, 4);
    year = digits.slice(4, 8);
  } else {
    return undefined;
  }

  const parsedYear = year.length === 2 ? 2000 + Number(year) : Number(year);
  const parsedMonth = Number(month);
  const parsedDay = Number(day);

  if (
    !Number.isFinite(parsedYear) ||
    !Number.isFinite(parsedMonth) ||
    !Number.isFinite(parsedDay)
  ) {
    return undefined;
  }

  return new Date(parsedYear, parsedMonth - 1, parsedDay);
}

export function formatDateToken(token?: string): string | undefined {
  const parsed = parseDateToken(token);
  if (!parsed) {
    return token;
  }

  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function pickLatestWorkbooksByRole(workbooks: ParsedWorkbook[]): ParsedWorkbook[] {
  const selected = new Map<SourceRole, ParsedWorkbook>();
  const unknowns: ParsedWorkbook[] = [];

  for (const workbook of workbooks) {
    if (workbook.sourceRole === "unknown") {
      unknowns.push(workbook);
      continue;
    }

    const current = selected.get(workbook.sourceRole);
    if (!current) {
      selected.set(workbook.sourceRole, workbook);
      continue;
    }

    const currentDate = parseDateToken(current.dateToken)?.getTime() ?? Number.NEGATIVE_INFINITY;
    const candidateDate =
      parseDateToken(workbook.dateToken)?.getTime() ?? Number.NEGATIVE_INFINITY;

    if (candidateDate >= currentDate) {
      selected.set(workbook.sourceRole, workbook);
    }
  }

  return [...selected.values(), ...unknowns];
}
