import type { CanonicalHolding } from "@/types/holdings";
import { pmhubWorkbookContract } from "@/lib/pmhub-workbook-contract";
import type { MorningstarEnrichmentResult } from "@/types/morningstar";

function buildStubResult(
  holdings: CanonicalHolding[],
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
      benchmarkInvestmentId: pmhubWorkbookContract.benchmarkInvestmentId,
      directDataSetIdOrName: pmhubWorkbookContract.directDataSetIdOrName,
      requestedFieldGroups: [
        "benchmark weights",
        "price/fair value",
        "economic moat",
        "fair value uncertainty",
        "sector",
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
): Promise<MorningstarEnrichmentResult> {
  if (typeof window !== "undefined") {
    return buildStubResult(holdings, [
      "Client-side parsing uses stubbed enrichment. Run SDK-backed enrichment on the server or through the local Python bridge.",
    ]);
  }

  if (process.env.MORNINGSTAR_ENABLE_SDK !== "true") {
    return buildStubResult(holdings, [
      "Set MORNINGSTAR_ENABLE_SDK=true to enable the Python SDK bridge.",
    ]);
  }

  try {
    const { runMorningstarSdkEnrichment } = await import("./sdkBridge.server");
    return await runMorningstarSdkEnrichment(holdings);
  } catch (error) {
    return buildStubResult(holdings, [
      error instanceof Error
        ? `Morningstar SDK bridge failed: ${error.message}`
        : "Morningstar SDK bridge failed.",
    ]);
  }
}
