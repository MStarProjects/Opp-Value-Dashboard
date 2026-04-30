import type { CanonicalHolding } from "@/types/holdings";
import type { SleeveConfig } from "@/lib/sleeves";
import type { MorningstarEnrichmentResult } from "@/types/morningstar";

function buildStubResult(
  holdings: CanonicalHolding[],
  sleeveConfig: SleeveConfig,
  additionalNotes: string[] = [],
): MorningstarEnrichmentResult {
  const workbookFallbackRows = holdings.filter(
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

  return {
    records: [],
    audit: {
      provider: "morningstar-internal-api",
      status: "stubbed",
      benchmarkInvestmentId: sleeveConfig.pmhubContract.benchmarkInvestmentId,
      directDataSetIdOrName: sleeveConfig.pmhubContract.directDataSetIdOrName,
      requestedFieldGroups: [
        "benchmark weights",
        "price/fair value",
        "economic moat",
        "fair value uncertainty",
        "sector",
        "gics industry",
        "business country",
        "forward PE",
        "ROE",
        "price/book",
      ],
      matchedByIsin: 0,
      matchedByTicker: 0,
      unmatchedHoldings: holdings.length,
      workbookFallbackRows,
      benchmarkConstituentCount: 0,
      benchmarkMatchedExactly: 0,
      benchmarkMatchedByEquivalent: 0,
      offBenchmarkRows: 0,
      cashLikeRows: 0,
      benchmarkFallbackMetricRows: 0,
      adrOverrideRows: 0,
      notes: [
        "PMHub monthly holdings workbook is now the base input.",
        "Morningstar Data SDK is the recommended integration path.",
        "Benchmark holdings should be pulled for MGXTMENU using the latest available holdings date.",
        "The saved Direct data set is Global xUS Opp Value.",
        ...additionalNotes,
      ],
    },
  };
}

export async function enrichPortfolioHoldings(
  holdings: CanonicalHolding[],
  options?: {
    preferStub?: boolean;
    sleeveConfig: SleeveConfig;
  },
): Promise<MorningstarEnrichmentResult> {
  const sleeveConfig = options?.sleeveConfig;
  if (!sleeveConfig) {
    throw new Error("A sleeve config is required for Morningstar enrichment.");
  }

  if (options?.preferStub) {
    return buildStubResult(holdings, sleeveConfig, [
      "Initial page render is using workbook-first mode so the dashboard opens immediately.",
    ]);
  }

  if (typeof window !== "undefined") {
    return buildStubResult(holdings, sleeveConfig, [
      "Client-side parsing uses stubbed enrichment. Run SDK-backed enrichment on the server or through the local Python bridge.",
    ]);
  }

  const { readMorningstarSessionToken } = await import("@/lib/morningstar-session");
  const hasSavedToken = Boolean(await readMorningstarSessionToken());

  if (process.env.MORNINGSTAR_ENABLE_SDK !== "true" && !hasSavedToken) {
    return buildStubResult(holdings, sleeveConfig, [
      "Save a Morningstar token in the app or set MORNINGSTAR_ENABLE_SDK=true to enable the Python SDK bridge.",
    ]);
  }

  try {
    const { runMorningstarSdkEnrichment } = await import("./sdkBridge.server");
    return await runMorningstarSdkEnrichment(holdings, sleeveConfig);
  } catch (error) {
    return buildStubResult(holdings, sleeveConfig, [
      error instanceof Error
        ? `Morningstar SDK bridge failed: ${error.message}`
        : "Morningstar SDK bridge failed.",
    ]);
  }
}
