"use client";

import { useDeferredValue, useEffect, useState } from "react";

import type { DashboardState, EnrichmentAudit } from "@/types/dashboard";
import type { CanonicalHolding } from "@/types/holdings";
import type { DistributionRow, ExposureRow } from "@/types/metrics";

type DashboardTab = "summary" | "details";
type LookthroughFilter = "all" | "off_benchmark" | "equivalent" | "cash_like";

const metricLabels = [
  "priceToFairValue",
  "forwardPE",
  "priceToBook",
  "roe",
] as const;

export function DashboardWorkbench({
  initialState,
}: Readonly<{
  initialState: DashboardState;
}>) {
  const [dashboardState, setDashboardState] = useState<DashboardState>(initialState);
  const [activeTab, setActiveTab] = useState<DashboardTab>("summary");
  const [selectedHoldingId, setSelectedHoldingId] = useState<string>();
  const [searchValue, setSearchValue] = useState("");
  const [lookthroughFilter, setLookthroughFilter] = useState<LookthroughFilter>("all");
  const [tokenValue, setTokenValue] = useState("");
  const [tokenConfigured, setTokenConfigured] = useState(
    initialState.enrichmentAudit.status === "configured",
  );
  const [tokenStatus, setTokenStatus] = useState<string>();
  const [tokenStatusTone, setTokenStatusTone] = useState<"neutral" | "success" | "error">(
    "neutral",
  );
  const [error, setError] = useState<string>();
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [isSavingToken, setIsSavingToken] = useState(false);
  const deferredSearch = useDeferredValue(searchValue);

  const selectedHolding =
    dashboardState.holdings.find((holding) => holding.canonicalId === selectedHoldingId) ??
    dashboardState.stockDetail;

  const filteredHoldings = dashboardState.holdings.filter((holding) => {
    const matchesSearch =
      deferredSearch.trim().length === 0 ||
      [holding.securityName, holding.ticker, holding.isin, holding.country, holding.sector]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(deferredSearch.trim().toLowerCase()));

    const matchesFilter =
      lookthroughFilter === "all" ||
      (lookthroughFilter === "off_benchmark" && holding.matchMethod === "off_benchmark") ||
      (lookthroughFilter === "equivalent" &&
        holding.matchMethod === "benchmark_equivalent_name") ||
      (lookthroughFilter === "cash_like" && holding.matchMethod === "cash_like");

    return matchesSearch && matchesFilter;
  });

  const topExactMatches = dashboardState.enrichmentAudit.benchmarkMatchedExactly ?? 0;
  const topEquivalentMatches = dashboardState.enrichmentAudit.benchmarkMatchedByEquivalent ?? 0;
  const topOffBenchmark = dashboardState.enrichmentAudit.offBenchmarkRows ?? 0;
  const topCashLike = dashboardState.enrichmentAudit.cashLikeRows ?? 0;
  const topAdrOverrides = dashboardState.enrichmentAudit.adrOverrideRows ?? 0;

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/morningstar/session");
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { configured?: boolean };
        setTokenConfigured(Boolean(payload.configured));
      } catch {
        // Ignore session status fetch failures and fall back to initial server state.
      }
    })();
  }, []);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) {
      return;
    }

    setError(undefined);
    setIsUploadingFile(true);

    try {
      const file = fileList[0];
      const formData = new FormData();
      formData.set("file", file);

      const uploadResponse = await fetch("/api/dashboard-state?reason=manual_upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadResponse.ok) {
        const payload = (await uploadResponse.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Unable to rebuild dashboard state.");
      }

      const nextState = (await uploadResponse.json()) as DashboardState;
      setDashboardState(nextState);
      setSelectedHoldingId(undefined);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to parse the selected workbook file.",
      );
    } finally {
      setIsUploadingFile(false);
    }
  }

  async function handleTokenSave() {
    if (!tokenValue.trim()) {
      setTokenStatus("Paste the current Morningstar token first.");
      setTokenStatusTone("error");
      return;
    }

    setTokenStatus("Saving token...");
    setTokenStatusTone("neutral");
    setError(undefined);
    setIsSavingToken(true);

    try {
      const sessionResponse = await fetch("/api/morningstar/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token: tokenValue.trim() }),
      });

      if (!sessionResponse.ok) {
        const payload = (await sessionResponse.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload.error ?? "Unable to save Morningstar token.");
      }

      setTokenConfigured(true);
      setTokenStatus("Token saved. Refreshing live data...");
      setTokenStatusTone("neutral");

      const refreshResponse = await fetch("/api/dashboard-state?reason=token_refresh", {
        method: "POST",
      });

      if (!refreshResponse.ok) {
        const payload = (await refreshResponse.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload.error ?? "Unable to refresh dashboard state.");
      }

      const nextState = (await refreshResponse.json()) as DashboardState;
      setDashboardState(nextState);
      setTokenValue("");

      if (nextState.enrichmentAudit.status === "configured") {
        setTokenStatus("Live Morningstar data loaded.");
        setTokenStatusTone("success");
      } else {
        const failureNote =
          nextState.enrichmentAudit.notes[
            nextState.enrichmentAudit.notes.length - 1
          ] ?? "Morningstar refresh stayed in stub mode.";
        setTokenStatus(`Token saved, but live refresh failed: ${failureNote}`);
        setTokenStatusTone("error");
      }
    } catch (caughtError) {
      setTokenStatus(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to save Morningstar token.",
      );
      setTokenStatusTone("error");
    } finally {
      setIsSavingToken(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(240,187,89,0.18),_transparent_28%),radial-gradient(circle_at_left,_rgba(29,78,216,0.12),_transparent_30%),linear-gradient(180deg,_#f4f1e8_0%,_#ede8db_100%)] px-4 py-6 text-stone-900 md:px-8 md:py-8">
      <div className="mx-auto flex w-full max-w-[1700px] flex-col gap-6">
        <section className="overflow-hidden rounded-[2rem] border border-white/70 bg-[linear-gradient(135deg,_rgba(17,24,39,0.98)_0%,_rgba(23,37,84,0.94)_48%,_rgba(120,53,15,0.82)_100%)] p-6 text-white shadow-[0_30px_80px_rgba(34,27,18,0.22)] md:p-8">
          <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-4xl space-y-5">
              <p className="text-xs font-semibold uppercase tracking-[0.36em] text-amber-200/90">
                xUS Opp Value
              </p>
              <div className="grid gap-4 md:grid-cols-[1.15fr_0.85fr] md:items-end">
                <div className="space-y-4">
                  <h1 className="font-serif text-4xl leading-none tracking-[-0.04em] md:text-6xl">
                    Summary dashboard and portfolio lookthrough, built around the PMHub file.
                  </h1>
                  <p className="max-w-3xl text-sm leading-7 text-slate-200 md:text-base">
                    The summary tab is tuned for comparison and attribution thinking. The
                    details tab is table-first and intentionally closer to the workbook you
                    already use, with benchmark, valuation, and quality context sitting on the
                    same row.
                  </p>
                </div>

                <div className="grid gap-3 rounded-[1.5rem] border border-white/12 bg-white/7 p-4 backdrop-blur">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <HeroMetric label="As Of" value={dashboardState.asOfLabel ?? "Live batch"} />
                    <HeroMetric
                      label="Active Holdings"
                      value={String(dashboardState.summary.holdingCount)}
                    />
                    <HeroMetric
                      label="Exact Benchmark Matches"
                      value={String(topExactMatches)}
                    />
                    <HeroMetric label="ADR / Local Pairs" value={String(topEquivalentMatches)} />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex w-full max-w-[25rem] flex-col gap-4 rounded-[1.5rem] border border-white/12 bg-white/8 p-5 backdrop-blur">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200/90">
                  Refresh Inputs
                </p>
                <p className="mt-2 text-sm leading-7 text-slate-200">
                  Drop in the latest PMHub workbook. The dashboard will rebuild the
                  comparison state around the new monthly holdings set.
                </p>
              </div>

              <label className="cursor-pointer rounded-full bg-amber-300 px-5 py-3 text-center text-sm font-semibold text-slate-950 transition hover:bg-amber-200">
                {isUploadingFile ? "Rebuilding dashboard..." : "Upload PMHub workbook"}
                <input
                  className="hidden"
                  type="file"
                  accept=".xlsx,.xls"
                  multiple={false}
                  onChange={(event) => void handleFiles(event.target.files)}
                />
              </label>

              <div className="rounded-[1.2rem] border border-white/12 bg-black/12 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200/90">
                  Morningstar Token
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-200">
                  Paste the daily token once here. The app will store it locally and use
                  it for live Morningstar pulls until it expires. Each successful refresh is
                  also archived locally with the PMHub workbook values for retention.
                </p>
                <div className="mt-3 grid gap-3">
                  <input
                    type="password"
                    value={tokenValue}
                    onChange={(event) => setTokenValue(event.target.value)}
                    placeholder={tokenConfigured ? "Saved locally - replace when it expires" : "Paste current token"}
                    className="rounded-2xl border border-white/12 bg-white/92 px-4 py-3 text-sm text-slate-950 outline-none placeholder:text-slate-500"
                  />
                  <button
                    type="button"
                    onClick={() => void handleTokenSave()}
                    className="rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
                  >
                    {isSavingToken ? "Saving token..." : tokenConfigured ? "Update token" : "Save token"}
                  </button>
                  <div className="flex items-center gap-2 text-xs">
                    <StatusChip
                      label={tokenConfigured ? "Token saved" : "No saved token"}
                      tone={tokenConfigured ? "blue" : "neutral"}
                    />
                  </div>
                  {tokenStatus ? (
                    <p
                      className={`text-xs leading-6 ${
                        tokenStatusTone === "success"
                          ? "text-emerald-100"
                          : tokenStatusTone === "error"
                            ? "text-rose-100"
                            : "text-amber-100"
                      }`}
                    >
                      {tokenStatus}
                    </p>
                  ) : null}
                </div>
              </div>

              {error ? (
                <p className="rounded-2xl border border-rose-300/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                  {error}
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-stone-200/80 bg-white/82 p-3 shadow-[0_20px_60px_rgba(53,42,27,0.08)] backdrop-blur">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2">
              <TabButton
                label="Summary"
                isActive={activeTab === "summary"}
                onClick={() => setActiveTab("summary")}
              />
              <TabButton
                label="Details / Portfolio Lookthrough"
                isActive={activeTab === "details"}
                onClick={() => setActiveTab("details")}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-stone-600">
              <StatusChip label={dashboardState.enrichmentAudit.status} tone="neutral" />
              <StatusChip
                label={`${topOffBenchmark} off benchmark`}
                tone={topOffBenchmark > 0 ? "amber" : "neutral"}
              />
              <StatusChip
                label={`${topAdrOverrides} ADR overrides`}
                tone={topAdrOverrides > 0 ? "blue" : "neutral"}
              />
              <StatusChip label={`${topCashLike} cash rows`} tone="neutral" />
            </div>
          </div>
        </section>

        {activeTab === "summary" ? (
          <SummaryTab
            dashboardState={dashboardState}
            selectedHolding={selectedHolding}
            onSelectHolding={setSelectedHoldingId}
          />
        ) : (
          <LookthroughTab
            dashboardState={dashboardState}
            filteredHoldings={filteredHoldings}
            lookthroughFilter={lookthroughFilter}
            searchValue={searchValue}
            selectedHolding={selectedHolding}
            onFilterChange={setLookthroughFilter}
            onSearchChange={setSearchValue}
            onSelectHolding={setSelectedHoldingId}
          />
        )}
      </div>
    </main>
  );
}

function SummaryTab({
  dashboardState,
  selectedHolding,
  onSelectHolding,
}: Readonly<{
  dashboardState: DashboardState;
  selectedHolding?: CanonicalHolding;
  onSelectHolding: (canonicalId: string) => void;
}>) {
  const summaryCards = [
    {
      label: "Total Weight",
      value: formatPercent(dashboardState.summary.totalWeight),
      accent: "text-slate-950",
      note: "Current PMHub weighted book",
    },
    {
      label: "Weighted P/FV",
      value: formatNumber(dashboardState.summary.weightedPriceToFairValue),
      accent: "text-emerald-800",
      note: "Cheaper than 1.00 means discount to fair value",
    },
    {
      label: "Weighted Forward P/E",
      value: formatNumber(dashboardState.summary.weightedForwardPE),
      accent: "text-sky-800",
      note: "Portfolio valuation posture",
    },
    {
      label: "Weighted P/B",
      value: formatNumber(dashboardState.summary.weightedPriceToBook),
      accent: "text-amber-700",
      note: "Balance sheet valuation lens",
    },
    {
      label: "Weighted ROE",
      value: formatPercent(dashboardState.summary.weightedRoe, 1),
      accent: "text-fuchsia-800",
      note: "Quality / profitability snapshot",
    },
    {
      label: "Missing Metrics",
      value: String(dashboardState.summary.missingMetricCount),
      accent: "text-rose-700",
      note: "Rows still missing core fields",
    },
  ];

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Panel
          title="Summary Snapshot"
          description="A higher-signal front page for portfolio shape, benchmark connectivity, and valuation posture."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {summaryCards.map((card) => (
              <div
                key={card.label}
                className="rounded-[1.25rem] border border-stone-200 bg-[linear-gradient(180deg,_rgba(255,255,255,0.92),_rgba(247,243,236,0.92))] p-4"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                  {card.label}
                </p>
                <p className={`mt-3 text-3xl font-semibold tracking-tight ${card.accent}`}>
                  {card.value}
                </p>
                <p className="mt-2 text-sm leading-6 text-stone-600">{card.note}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          title="Benchmark Connection"
          description="This is the operational audit view inside the dashboard: what matched exactly, what was bridged by local-share logic, and what remains purposefully off benchmark."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <AuditMetric
              label="Exact Matches"
              value={String(dashboardState.enrichmentAudit.benchmarkMatchedExactly ?? 0)}
            />
            <AuditMetric
              label="Equivalent Matches"
              value={String(dashboardState.enrichmentAudit.benchmarkMatchedByEquivalent ?? 0)}
            />
            <AuditMetric
              label="Off-Benchmark Names"
              value={String(dashboardState.enrichmentAudit.offBenchmarkRows ?? 0)}
            />
            <AuditMetric
              label="Benchmark Fallback Metrics"
              value={String(dashboardState.enrichmentAudit.benchmarkFallbackMetricRows ?? 0)}
            />
            <AuditMetric
              label="ADR Overrides"
              value={String(dashboardState.enrichmentAudit.adrOverrideRows ?? 0)}
            />
            <AuditMetric
              label="Benchmark Constituents"
              value={String(dashboardState.enrichmentAudit.benchmarkConstituentCount)}
            />
          </div>
          <div className="mt-4 grid gap-2">
            {dashboardState.enrichmentAudit.notes.slice(-3).map((note) => (
              <div
                key={note}
                className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700"
              >
                {note}
              </div>
            ))}
          </div>
        </Panel>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel
          title="Comparison Lenses"
          description="These blocks are meant to feel like the workbook summary logic, but easier to scan: country and sector relative positioning, not just raw holdings."
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <ComparisonBlock
              title="Sector Positioning"
              rows={dashboardState.sectorExposure.slice(0, 10)}
            />
            <ComparisonBlock
              title="Country Positioning"
              rows={dashboardState.countryExposure.slice(0, 10)}
            />
          </div>
        </Panel>

        <Panel
          title="Valuation + Quality Mix"
          description="Quick distribution reads for how much of the book sits in discount buckets and moat buckets."
        >
          <div className="grid gap-6 md:grid-cols-2">
            <DistributionBlock
              title="P/FV Buckets"
              rows={dashboardState.pfvDistribution}
              barColor="bg-emerald-700"
            />
            <DistributionBlock
              title="Moat Buckets"
              rows={dashboardState.moatDistribution}
              barColor="bg-sky-700"
            />
          </div>
        </Panel>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <Panel
          title="Advanced Tracking"
          description="A purpose-built summary board for the questions you actually ask while reviewing the book: where are we most different, where do valuation spreads sit, and which rows need attention."
        >
          <div className="grid gap-5">
            <RankedBoard
              title="Top Overweights vs Benchmark"
              subtitle="Largest positive active weights"
              holdings={dashboardState.topActivePositions.slice(0, 7)}
              metricLabel="Active"
              metric={(holding) => formatPercent(holding.activeWeightVsBenchmark)}
              onSelectHolding={onSelectHolding}
            />
            <RankedBoard
              title="Top Underweights"
              subtitle="Largest negative active weights"
              holdings={dashboardState.topUnderweights.slice(0, 7)}
              metricLabel="Active"
              metric={(holding) => formatPercent(holding.activeWeightVsBenchmark)}
              onSelectHolding={onSelectHolding}
            />
            <RankedBoard
              title="Largest Benchmark Weights"
              subtitle="Names where the benchmark footprint is largest"
              holdings={dashboardState.topBenchmarkGaps.slice(0, 7)}
              metricLabel="BM"
              metric={(holding) => formatPercent(holding.benchmarkWeight)}
              onSelectHolding={onSelectHolding}
            />
          </div>
        </Panel>

        <Panel
          title="Focused Stock Board"
          description="A closer, workbook-style read on one selected line item, plus the most important issue queue items."
        >
          <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            {selectedHolding ? <SelectedHoldingBoard holding={selectedHolding} /> : null}

            <div className="grid gap-4">
              <IssueSummary audit={dashboardState.enrichmentAudit} />
              <div className="rounded-[1.3rem] border border-stone-200 bg-stone-50/90 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                  Issue Queue
                </p>
                <div className="mt-3 grid gap-2">
                  {dashboardState.issues.length > 0 ? (
                    dashboardState.issues.slice(0, 8).map((issue, index) => (
                      <div
                        key={`${issue.code}-${index}`}
                        className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
                      >
                        {issue.message}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                      No structural issues are currently flagged in the weighted holdings set.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Panel>
      </section>
    </div>
  );
}

function LookthroughTab({
  dashboardState,
  filteredHoldings,
  lookthroughFilter,
  searchValue,
  selectedHolding,
  onFilterChange,
  onSearchChange,
  onSelectHolding,
}: Readonly<{
  dashboardState: DashboardState;
  filteredHoldings: CanonicalHolding[];
  lookthroughFilter: LookthroughFilter;
  searchValue: string;
  selectedHolding?: CanonicalHolding;
  onFilterChange: (filter: LookthroughFilter) => void;
  onSearchChange: (value: string) => void;
  onSelectHolding: (canonicalId: string) => void;
}>) {
  return (
    <div className="grid gap-6">
      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Panel
          title="Portfolio Lookthrough"
          description="This tab is intentionally denser and more spreadsheet-like. It keeps portfolio, benchmark, and valuation fields in the same horizontal view so you can scan rows the way you already do in Excel."
        >
          <div className="grid gap-4">
            <div className="flex flex-col gap-3 rounded-[1.25rem] border border-stone-200 bg-stone-50/85 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-1 items-center gap-3 rounded-full border border-stone-200 bg-white px-4 py-3">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                  Search
                </span>
                <input
                  value={searchValue}
                  onChange={(event) => onSearchChange(event.target.value)}
                  placeholder="Name, ticker, ISIN, country, sector"
                  className="w-full bg-transparent text-sm text-stone-900 outline-none placeholder:text-stone-400"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <FilterChip
                  label="All"
                  isActive={lookthroughFilter === "all"}
                  onClick={() => onFilterChange("all")}
                />
                <FilterChip
                  label="Off Benchmark"
                  isActive={lookthroughFilter === "off_benchmark"}
                  onClick={() => onFilterChange("off_benchmark")}
                />
                <FilterChip
                  label="ADR / Local"
                  isActive={lookthroughFilter === "equivalent"}
                  onClick={() => onFilterChange("equivalent")}
                />
                <FilterChip
                  label="Cash"
                  isActive={lookthroughFilter === "cash_like"}
                  onClick={() => onFilterChange("cash_like")}
                />
              </div>
            </div>

            <LookthroughTotals holdings={filteredHoldings} />

            <div className="overflow-hidden rounded-[1.35rem] border border-stone-200 bg-white">
              <div className="max-h-[42rem] overflow-auto">
                <table className="min-w-full border-separate border-spacing-0 text-sm">
                  <thead className="sticky top-0 z-10 bg-stone-950 text-left text-[11px] uppercase tracking-[0.16em] text-stone-300">
                    <tr>
                      {[
                        "Stock",
                        "Ticker",
                        "Country",
                        "Sector",
                        "Port Wgt",
                        "BM Wgt",
                        "Active",
                        "P/FV",
                        "Upside",
                        "Fwd P/E",
                        "P/B",
                        "ROE",
                        "Moat",
                        "Uncertainty",
                        "Match",
                      ].map((label) => (
                        <th key={label} className="border-b border-white/8 px-4 py-3 font-semibold">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHoldings.map((holding) => (
                      <tr
                        key={holding.canonicalId}
                        className={`cursor-pointer transition odd:bg-white even:bg-stone-50/60 hover:bg-amber-50 ${
                          selectedHolding?.canonicalId === holding.canonicalId
                            ? "bg-sky-50"
                            : ""
                        }`}
                        onClick={() => onSelectHolding(holding.canonicalId)}
                      >
                        <td className="border-b border-stone-200 px-4 py-3">
                          <div className="min-w-[18rem]">
                            <p className="font-semibold text-stone-950">{holding.securityName}</p>
                            <p className="mt-1 text-xs text-stone-500">
                              {holding.isin ?? "No ISIN"}
                            </p>
                          </div>
                        </td>
                        <td className="border-b border-stone-200 px-4 py-3 text-stone-700">
                          {holding.ticker ?? "n/a"}
                        </td>
                        <td className="border-b border-stone-200 px-4 py-3 text-stone-700">
                          {holding.country ?? "n/a"}
                        </td>
                        <td className="border-b border-stone-200 px-4 py-3 text-stone-700">
                          {holding.sector ?? "n/a"}
                        </td>
                        <td className="border-b border-stone-200 px-4 py-3 font-medium text-stone-900">
                          {formatPercent(holding.targetWeight)}
                        </td>
                        <td className="border-b border-stone-200 px-4 py-3 text-stone-700">
                          {formatPercent(holding.benchmarkWeight)}
                        </td>
                        <td className="border-b border-stone-200 px-4 py-3 font-medium text-stone-900">
                          {formatPercent(holding.activeWeightVsBenchmark)}
                        </td>
                        <td className="border-b border-stone-200 px-4 py-3 text-stone-700">
                          {formatNumber(holding.priceToFairValue)}
                        </td>
                        <td className="border-b border-stone-200 px-4 py-3 text-stone-700">
                          {formatPercent(holding.upsideToFairValue)}
                        </td>
                        <td className="border-b border-stone-200 px-4 py-3 text-stone-700">
                          {formatNumber(holding.forwardPE)}
                        </td>
                        <td className="border-b border-stone-200 px-4 py-3 text-stone-700">
                          {formatNumber(holding.priceToBook)}
                        </td>
                        <td className="border-b border-stone-200 px-4 py-3 text-stone-700">
                          {formatPercent(holding.roe, 1)}
                        </td>
                        <td className="border-b border-stone-200 px-4 py-3 text-stone-700">
                          {holding.moat ?? "n/a"}
                        </td>
                        <td className="border-b border-stone-200 px-4 py-3 text-stone-700">
                          {holding.uncertainty ?? "n/a"}
                        </td>
                        <td className="border-b border-stone-200 px-4 py-3">
                          <MatchBadge matchMethod={holding.matchMethod} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </Panel>

        <Panel
          title="Selected Row"
          description="The right-hand panel keeps the deeper stock view visible while you scan the table, similar to checking notes and formulas off to the side in the workbook."
        >
          {selectedHolding ? <SelectedHoldingBoard holding={selectedHolding} /> : null}
        </Panel>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <Panel
          title="Lookthrough Flags"
          description="Quick row-quality tracking for the currently visible subset."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <AuditMetric label="Visible Rows" value={String(filteredHoldings.length)} />
            <AuditMetric
              label="Missing P/FV"
              value={String(filteredHoldings.filter((holding) => holding.priceToFairValue == null).length)}
            />
            <AuditMetric
              label="Off Benchmark"
              value={String(
                filteredHoldings.filter((holding) => holding.matchMethod === "off_benchmark")
                  .length,
              )}
            />
            <AuditMetric
              label="Equivalent Match"
              value={String(
                filteredHoldings.filter(
                  (holding) => holding.matchMethod === "benchmark_equivalent_name",
                ).length,
              )}
            />
          </div>
        </Panel>

        <Panel
          title="Reference Notes"
          description="This panel keeps the app honest about how it should behave versus the workbook."
        >
          <div className="grid gap-2">
            <ReferenceNote text="Portfolio rows should remain on one line even when benchmark matching uses a local share or ADR sibling." />
            <ReferenceNote text="Off-benchmark holdings keep benchmark weight at zero and still pull Direct metrics." />
            <ReferenceNote text="Brazil and Mexico ADR overrides are only used for P/FV, Moat, and Forward P/E after direct and benchmark-local checks." />
          </div>
        </Panel>

        <Panel
          title="Active Source"
          description="Current workbook batch feeding the lookthrough tab."
        >
          <div className="grid gap-3">
            {dashboardState.sources.map((source) => (
              <div
                key={`${source.role}-${source.fileName}`}
                className="rounded-[1.2rem] border border-stone-200 bg-stone-50 px-4 py-4"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                  {source.role}
                </p>
                <p className="mt-2 text-base font-semibold text-stone-950">{source.fileName}</p>
                <p className="mt-2 text-sm text-stone-600">
                  {source.dateLabel ?? source.dateToken ?? "Date not detected"} · {source.sheetCount}{" "}
                  sheet(s)
                </p>
              </div>
            ))}
          </div>
        </Panel>
      </section>
    </div>
  );
}

function Panel({
  title,
  description,
  children,
}: Readonly<{
  title: string;
  description: string;
  children: React.ReactNode;
}>) {
  return (
    <section className="rounded-[1.8rem] border border-stone-200/80 bg-white/84 p-5 shadow-[0_24px_60px_rgba(59,47,33,0.08)] backdrop-blur md:p-6">
      <div className="mb-5">
        <h2 className="font-serif text-2xl tracking-tight text-stone-950 md:text-3xl">{title}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-stone-600">{description}</p>
      </div>
      {children}
    </section>
  );
}

function HeroMetric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-[1.1rem] border border-white/10 bg-black/12 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-white">{value}</p>
    </div>
  );
}

function TabButton({
  label,
  isActive,
  onClick,
}: Readonly<{
  label: string;
  isActive: boolean;
  onClick: () => void;
}>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-5 py-3 text-sm font-semibold transition ${
        isActive
          ? "bg-stone-950 text-white shadow-[0_10px_25px_rgba(28,25,23,0.2)]"
          : "bg-stone-100 text-stone-700 hover:bg-stone-200"
      }`}
    >
      {label}
    </button>
  );
}

function StatusChip({
  label,
  tone,
}: Readonly<{
  label: string;
  tone: "neutral" | "amber" | "blue";
}>) {
  const toneClasses =
    tone === "amber"
      ? "bg-amber-100 text-amber-900"
      : tone === "blue"
        ? "bg-sky-100 text-sky-900"
        : "bg-stone-100 text-stone-700";

  return <span className={`rounded-full px-3 py-1.5 font-medium ${toneClasses}`}>{label}</span>;
}

function AuditMetric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-[1.1rem] border border-stone-200 bg-stone-50/85 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-stone-950">{value}</p>
    </div>
  );
}

function ComparisonBlock({
  title,
  rows,
}: Readonly<{
  title: string;
  rows: ExposureRow[];
}>) {
  const max = Math.max(
    ...rows.flatMap((row) => [row.portfolioWeight, row.benchmarkWeight ?? 0]),
    0.01,
  );

  return (
    <div className="rounded-[1.25rem] border border-stone-200 bg-stone-50/70 p-4">
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-stone-500">{title}</p>
      <div className="mt-4 grid gap-4">
        {rows.map((row) => (
          <div key={row.label} className="grid gap-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-stone-900">{row.label}</span>
              <span className="text-stone-600">
                {formatPercent(row.activeVsBenchmark)} active
              </span>
            </div>
            <DualBar
              primary={row.portfolioWeight}
              secondary={row.benchmarkWeight ?? 0}
              max={max}
            />
            <div className="flex justify-between text-xs text-stone-500">
              <span>Portfolio {formatPercent(row.portfolioWeight)}</span>
              <span>Benchmark {formatPercent(row.benchmarkWeight)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DistributionBlock({
  title,
  rows,
  barColor,
}: Readonly<{
  title: string;
  rows: DistributionRow[];
  barColor: string;
}>) {
  const max = Math.max(...rows.map((row) => row.portfolioWeight), 0.01);

  return (
    <div className="rounded-[1.25rem] border border-stone-200 bg-stone-50/70 p-4">
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-stone-500">{title}</p>
      <div className="mt-4 grid gap-3">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium text-stone-900">{row.label}</span>
              <span className="text-stone-500">{formatPercent(row.portfolioWeight)}</span>
            </div>
            <SingleBar color={barColor} value={row.portfolioWeight} max={max} />
          </div>
        ))}
      </div>
    </div>
  );
}

function DualBar({
  primary,
  secondary,
  max,
}: Readonly<{
  primary: number;
  secondary: number;
  max: number;
}>) {
  return (
    <div className="grid gap-2">
      <SingleBar color="bg-stone-950" value={primary} max={max} />
      <SingleBar color="bg-amber-500" value={secondary} max={max} />
    </div>
  );
}

function SingleBar({
  color,
  value,
  max,
}: Readonly<{
  color: string;
  value: number;
  max: number;
}>) {
  const width = `${Math.max((value / max) * 100, value > 0 ? 3 : 0)}%`;

  return (
    <div className="h-2.5 rounded-full bg-stone-200">
      <div className={`h-2.5 rounded-full ${color}`} style={{ width }} />
    </div>
  );
}

function RankedBoard({
  title,
  subtitle,
  holdings,
  metric,
  metricLabel,
  onSelectHolding,
}: Readonly<{
  title: string;
  subtitle: string;
  holdings: CanonicalHolding[];
  metricLabel: string;
  metric: (holding: CanonicalHolding) => string;
  onSelectHolding: (canonicalId: string) => void;
}>) {
  return (
    <div className="rounded-[1.25rem] border border-stone-200 bg-stone-50/75 p-4">
      <p className="text-sm font-semibold text-stone-950">{title}</p>
      <p className="mt-1 text-sm text-stone-600">{subtitle}</p>
      <div className="mt-4 grid gap-2">
        {holdings.map((holding) => (
          <button
            key={holding.canonicalId}
            type="button"
            onClick={() => onSelectHolding(holding.canonicalId)}
            className="flex items-center justify-between rounded-2xl border border-stone-200 bg-white px-4 py-3 text-left transition hover:bg-amber-50"
          >
            <div>
              <p className="text-sm font-semibold text-stone-950">{holding.securityName}</p>
              <p className="text-xs text-stone-500">
                {holding.ticker ?? "No ticker"} · {holding.country ?? "No country"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">
                {metricLabel}
              </p>
              <p className="mt-1 text-sm font-semibold text-stone-950">{metric(holding)}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function SelectedHoldingBoard({ holding }: Readonly<{ holding: CanonicalHolding }>) {
  return (
    <div className="grid gap-4 rounded-[1.35rem] border border-stone-200 bg-[linear-gradient(180deg,_rgba(255,255,255,0.96),_rgba(247,243,236,0.96))] p-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <MatchBadge matchMethod={holding.matchMethod} />
          {holding.dataQualityFlags.slice(0, 2).map((flag) => (
            <span
              key={flag}
              className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900"
            >
              {flag}
            </span>
          ))}
        </div>
        <h3 className="mt-3 font-serif text-3xl tracking-tight text-stone-950">
          {holding.securityName}
        </h3>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          {holding.ticker ?? "No ticker"} · {holding.isin ?? "No ISIN"} ·{" "}
          {holding.country ?? "No country"} · {holding.sector ?? "No sector"}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <DetailCard label="Portfolio Weight" value={formatPercent(holding.targetWeight)} />
        <DetailCard label="Benchmark Weight" value={formatPercent(holding.benchmarkWeight)} />
        <DetailCard label="Active Weight" value={formatPercent(holding.activeWeightVsBenchmark)} />
        <DetailCard label="Currency Contrib" value={formatPercent(holding.currencyContribution)} />
        <DetailCard label="P/FV" value={formatNumber(holding.priceToFairValue)} />
        <DetailCard label="Upside" value={formatPercent(holding.upsideToFairValue)} />
        <DetailCard label="Forward P/E" value={formatNumber(holding.forwardPE)} />
        <DetailCard label="P/B" value={formatNumber(holding.priceToBook)} />
        <DetailCard label="ROE" value={formatPercent(holding.roe, 1)} />
        <DetailCard label="Moat" value={holding.moat ?? "n/a"} />
        <DetailCard label="Uncertainty" value={holding.uncertainty ?? "n/a"} />
        <DetailCard label="Base Match" value={humanizeMatchMethod(holding.matchMethod)} />
      </div>
    </div>
  );
}

function IssueSummary({ audit }: Readonly<{ audit: EnrichmentAudit }>) {
  const summaryItems = [
    `${audit.offBenchmarkRows ?? 0} off-benchmark names`,
    `${audit.cashLikeRows ?? 0} cash rows`,
    `${audit.benchmarkFallbackMetricRows ?? 0} benchmark-local fallback rows`,
    `${audit.adrOverrideRows ?? 0} ADR override rows`,
  ];

  return (
    <div className="rounded-[1.3rem] border border-stone-200 bg-stone-50/90 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
        Tracking Rules
      </p>
      <div className="mt-3 grid gap-2">
        {summaryItems.map((item) => (
          <div
            key={item}
            className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700"
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function LookthroughTotals({ holdings }: Readonly<{ holdings: CanonicalHolding[] }>) {
  const totalPortfolioWeight = holdings.reduce((sum, holding) => sum + (holding.targetWeight ?? 0), 0);
  const totalBenchmarkWeight = holdings.reduce(
    (sum, holding) => sum + (holding.benchmarkWeight ?? 0),
    0,
  );
  const missingMetrics = holdings.filter((holding) =>
    metricLabels.some((key) => holding[key] == null),
  ).length;

  const cards = [
    ["Visible Portfolio Weight", formatPercent(totalPortfolioWeight)],
    ["Visible Benchmark Weight", formatPercent(totalBenchmarkWeight)],
    ["Visible Rows", String(holdings.length)],
    ["Rows Missing a Core Metric", String(missingMetrics)],
  ] as const;

  return (
    <div className="grid gap-3 md:grid-cols-4">
      {cards.map(([label, value]) => (
        <div
          key={label}
          className="rounded-[1.15rem] border border-stone-200 bg-stone-50/80 px-4 py-4"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-stone-950">{value}</p>
        </div>
      ))}
    </div>
  );
}

function MatchBadge({ matchMethod }: Readonly<{ matchMethod: string }>) {
  const label = humanizeMatchMethod(matchMethod);
  const className =
    matchMethod === "off_benchmark"
      ? "bg-amber-100 text-amber-900"
      : matchMethod === "benchmark_equivalent_name"
        ? "bg-sky-100 text-sky-900"
        : matchMethod === "cash_like"
          ? "bg-stone-200 text-stone-700"
          : "bg-emerald-100 text-emerald-900";

  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${className}`}>{label}</span>;
}

function FilterChip({
  label,
  isActive,
  onClick,
}: Readonly<{
  label: string;
  isActive: boolean;
  onClick: () => void;
}>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
        isActive ? "bg-stone-950 text-white" : "bg-white text-stone-600 hover:bg-stone-100"
      }`}
    >
      {label}
    </button>
  );
}

function ReferenceNote({ text }: Readonly<{ text: string }>) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm leading-7 text-stone-700">
      {text}
    </div>
  );
}

function DetailCard({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-[1rem] border border-stone-200 bg-white px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">
        {label}
      </p>
      <p className="mt-2 text-base font-semibold text-stone-950">{value}</p>
    </div>
  );
}

function humanizeMatchMethod(matchMethod: string) {
  if (matchMethod === "benchmark_equivalent_name") {
    return "ADR / local equivalent";
  }
  if (matchMethod === "off_benchmark") {
    return "Off benchmark";
  }
  if (matchMethod === "cash_like") {
    return "Cash / currency";
  }
  if (matchMethod === "benchmark_exact_isin") {
    return "Exact ISIN match";
  }
  if (matchMethod === "benchmark_exact_cusip") {
    return "Exact CUSIP match";
  }
  if (matchMethod === "workbook_base") {
    return "Workbook base";
  }
  return matchMethod.replaceAll("_", " ");
}

function formatNumber(value?: number, digits = 2): string {
  if (value == null || Number.isNaN(value)) {
    return "n/a";
  }

  return value.toFixed(digits);
}

function formatPercent(value?: number, digits = 2): string {
  if (value == null || Number.isNaN(value)) {
    return "n/a";
  }

  return `${value.toFixed(digits)}%`;
}
