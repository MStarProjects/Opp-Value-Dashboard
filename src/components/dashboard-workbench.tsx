"use client";

import { useMemo, useState, useTransition } from "react";

import { buildDashboardState } from "@/features/dashboard/buildDashboardState";
import { parseWorkbook } from "@/features/workbook/parseWorkbook";
import type { DashboardState } from "@/types/dashboard";
import type { CanonicalHolding } from "@/types/holdings";
import type { ExposureRow, DistributionRow } from "@/types/metrics";
import type { ParsedWorkbook } from "@/types/workbook";

export function DashboardWorkbench({
  initialWorkbooks = [],
}: Readonly<{
  initialWorkbooks?: ParsedWorkbook[];
}>) {
  const [workbooks, setWorkbooks] = useState<ParsedWorkbook[]>(initialWorkbooks);
  const [selectedHoldingId, setSelectedHoldingId] = useState<string>();
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  const dashboardState = useMemo<DashboardState | undefined>(() => {
    if (workbooks.length === 0) {
      return undefined;
    }

    const state = buildDashboardState(workbooks);
    if (!selectedHoldingId) {
      return state;
    }

    const stockDetail =
      state.holdings.find((holding) => holding.canonicalId === selectedHoldingId) ??
      state.stockDetail;

    return {
      ...state,
      stockDetail,
    };
  }, [selectedHoldingId, workbooks]);

  const selectedHolding = dashboardState?.stockDetail;

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) {
      return;
    }

    setError(undefined);

    startTransition(async () => {
      try {
        const parsed = await Promise.all([...fileList].map((file) => parseWorkbook(file)));
        setWorkbooks(parsed);
        setSelectedHoldingId(undefined);
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to parse the selected workbook files.",
        );
      }
    });
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(182,215,168,0.22),_transparent_32%),linear-gradient(180deg,_#f7f7f2_0%,_#eef3ea_100%)] px-6 py-10 text-slate-900 md:px-10 lg:px-14">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <section className="overflow-hidden rounded-[2rem] border border-white/70 bg-white/85 p-8 shadow-[0_24px_80px_rgba(54,74,65,0.12)] backdrop-blur md:p-10">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-5">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-800">
                Opp Value Dashboard
              </p>
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 md:text-6xl">
                Summary dashboard, comparison views, attribution slices, and deeper stock detail.
              </h1>
              <p className="max-w-2xl text-base leading-8 text-slate-700 md:text-lg">
                The dashboard now starts from the workbook files already checked
                into `data/raw`. Upload is still available when you want to
                replace that default batch with newer dated files.
              </p>
            </div>

            <label className="flex cursor-pointer flex-col gap-3 rounded-[1.5rem] border border-dashed border-emerald-700/35 bg-slate-950 p-6 text-slate-50 shadow-[0_18px_40px_rgba(15,23,42,0.22)] lg:w-[26rem]">
              <span className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-200">
                Replace Source Files
              </span>
              <span className="text-sm leading-7 text-slate-300">
                Upload a newer batch any time. The dashboard will use the latest valid file for each source role.
              </span>
              <input
                className="hidden"
                type="file"
                accept=".xlsx,.xls"
                multiple
                onChange={(event) => void handleFiles(event.target.files)}
              />
              <span className="inline-flex w-fit rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950">
                {isPending ? "Parsing workbooks..." : "Choose Excel files"}
              </span>
            </label>
          </div>

          {error ? (
            <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </p>
          ) : null}
        </section>

        {!dashboardState ? (
          <section className="rounded-[1.75rem] border border-white/70 bg-white/75 p-8 shadow-[0_18px_50px_rgba(54,74,65,0.08)] backdrop-blur">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
              No Default Data Loaded
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-700">
              The app should preload the checked-in files from `data/raw`. If
              you still see this state, there was a server-side load issue and
              I need to fix that path next.
            </p>
          </section>
        ) : (
          <>
            <section className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
              <Panel
                title="Refresh Summary"
                description="The active dashboard uses the latest file per role from the default batch or from whatever you most recently uploaded."
              >
                <div className="grid gap-4 md:grid-cols-2">
                  {dashboardState.sources.map((source) => (
                    <article
                      key={`${source.role}-${source.fileName}`}
                      className="rounded-[1.1rem] border border-slate-200 bg-slate-50/80 p-4"
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800">
                        {source.role}
                      </p>
                      <p className="mt-2 text-base font-semibold text-slate-950">
                        {source.fileName}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-700">
                        Active date: {source.dateLabel ?? source.dateToken ?? "not detected"}
                      </p>
                      <p className="text-sm leading-6 text-slate-700">
                        Sheets: {source.sheetCount}
                      </p>
                    </article>
                  ))}
                </div>
              </Panel>

              <Panel
                title="Summary Metrics"
                description="Core portfolio summary aligned with the current workbook, plus valuation and data-completeness checks."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <MetricCard label="As Of" value={dashboardState.asOfLabel ?? "Current batch"} />
                  <MetricCard label="Holdings" value={String(dashboardState.summary.holdingCount)} />
                  <MetricCard
                    label="Total Weight"
                    value={formatPercent(dashboardState.summary.totalWeight)}
                  />
                  <MetricCard
                    label="Weighted Forward PE"
                    value={formatNumber(dashboardState.summary.weightedForwardPE)}
                  />
                  <MetricCard
                    label="Weighted P/B"
                    value={formatNumber(dashboardState.summary.weightedPriceToBook)}
                  />
                  <MetricCard
                    label="Weighted ROE"
                    value={formatPercent(dashboardState.summary.weightedRoe, 1)}
                  />
                  <MetricCard
                    label="Weighted PFV"
                    value={formatNumber(dashboardState.summary.weightedPriceToFairValue)}
                  />
                  <MetricCard
                    label="Missing Metrics"
                    value={String(dashboardState.summary.missingMetricCount)}
                  />
                </div>
              </Panel>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <Panel
                title="Sector Comparison"
                description="Portfolio, benchmark, and TME sector exposure in one place."
              >
                <ExposureList rows={dashboardState.sectorExposure.slice(0, 10)} />
              </Panel>

              <Panel
                title="Country Comparison"
                description="Country-level active weights to complement the sector view."
              >
                <ExposureList rows={dashboardState.countryExposure.slice(0, 10)} />
              </Panel>
            </section>

            <section className="grid gap-6 lg:grid-cols-3">
              <Panel
                title="Attribution Leaders"
                description="Largest active positions versus benchmark."
              >
                <RankedList
                  title="Top Overweights"
                  holdings={dashboardState.topActivePositions}
                  metric={(holding) => formatPercent(holding.activeWeightVsBenchmark)}
                />
              </Panel>

              <Panel
                title="Attribution Drag"
                description="Largest underweights versus benchmark."
              >
                <RankedList
                  title="Top Underweights"
                  holdings={dashboardState.topUnderweights}
                  metric={(holding) => formatPercent(holding.activeWeightVsBenchmark)}
                />
              </Panel>

              <Panel
                title="Valuation Upside"
                description="Names with the highest upside-to-fair-value signal from the integrated dataset."
              >
                <RankedList
                  title="Top Upside"
                  holdings={dashboardState.topUpsidePositions}
                  metric={(holding) => formatPercent(holding.upsideToFairValue)}
                />
              </Panel>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <Panel
                title="PFV Distribution"
                description="How portfolio weight is distributed across valuation buckets relative to the TME comparison layer."
              >
                <DistributionList rows={dashboardState.pfvDistribution} />
              </Panel>

              <Panel
                title="Moat Distribution"
                description="Portfolio moat mix compared with the uploaded TME reference weights."
              >
                <DistributionList rows={dashboardState.moatDistribution} />
              </Panel>
            </section>

            <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
              <Panel
                title="Sector Valuation Spread"
                description="Weighted PFV by sector, useful for seeing where the portfolio is cheap or expensive versus its current structure."
              >
                <div className="grid gap-3">
                  {dashboardState.valuationBySector.map((row) => (
                    <div
                      key={row.sector}
                      className="grid gap-2 rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-950">
                          {row.sector}
                        </span>
                        <span className="text-xs text-slate-500">
                          BM {formatPercent(row.benchmarkWeight)}
                        </span>
                      </div>
                      <div className="grid gap-1 text-sm text-slate-700 sm:grid-cols-2">
                        <span>Portfolio PFV: {formatNumber(row.portfolioPfv)}</span>
                        <span>TME PFV: {formatNumber(row.modelPfv)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel
                title="Benchmark Concentration"
                description="Largest benchmark names in the merged dataset, useful for spotting where active gaps come from."
              >
                <RankedList
                  title="Largest Benchmark Weights"
                  holdings={dashboardState.topBenchmarkGaps}
                  metric={(holding) => formatPercent(holding.benchmarkWeight)}
                />
              </Panel>
            </section>

            <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <Panel
                title="Stock-Level View"
                description="A deeper inspection panel for one holding at a time."
              >
                <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
                  <div className="max-h-[40rem] overflow-y-auto rounded-[1.25rem] border border-slate-200 bg-slate-50/75 p-3">
                    <div className="grid gap-2">
                      {dashboardState.holdings.slice(0, 60).map((holding) => (
                        <button
                          key={holding.canonicalId}
                          type="button"
                          onClick={() => setSelectedHoldingId(holding.canonicalId)}
                          className={`rounded-[0.9rem] px-4 py-3 text-left transition ${
                            selectedHolding?.canonicalId === holding.canonicalId
                              ? "bg-slate-950 text-white"
                              : "bg-white text-slate-900 hover:bg-emerald-50"
                          }`}
                        >
                          <p className="text-sm font-semibold">{holding.securityName}</p>
                          <p className="mt-1 text-xs opacity-80">
                            {holding.ticker ?? "No ticker"} |{" "}
                            {holding.country ?? "No country"} |{" "}
                            {formatPercent(holding.targetWeight ?? holding.driftedWeight)}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {selectedHolding ? (
                    <StockDetailCard holding={selectedHolding} />
                  ) : null}
                </div>
              </Panel>

              <Panel
                title="Data Quality"
                description="Issues stay visible so the dashboard does not hide missing or partial inputs."
              >
                <div className="grid gap-3">
                  {dashboardState.issues.length > 0 ? (
                    dashboardState.issues.map((issue, index) => (
                      <div
                        key={`${issue.code}-${index}`}
                        className="rounded-[1rem] border border-amber-200 bg-amber-50 px-4 py-3"
                      >
                        <p className="text-sm font-semibold text-amber-900">
                          {issue.message}
                        </p>
                        <p className="mt-1 text-xs uppercase tracking-[0.14em] text-amber-700">
                          {issue.code}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-[1rem] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                      No issues detected in the current batch.
                    </p>
                  )}
                </div>
              </Panel>
            </section>
          </>
        )}
      </div>
    </main>
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
    <section className="rounded-[1.75rem] border border-white/70 bg-white/75 p-6 shadow-[0_18px_50px_rgba(54,74,65,0.08)] backdrop-blur">
      <div className="mb-5">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
          {title}
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-700">
          {description}
        </p>
      </div>
      {children}
    </section>
  );
}

function MetricCard({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-[1.1rem] border border-slate-200 bg-slate-50/80 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function ExposureList({ rows }: Readonly<{ rows: ExposureRow[] }>) {
  return (
    <div className="grid gap-4">
      {rows.map((row) => (
        <div key={row.label} className="grid gap-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-slate-900">{row.label}</span>
            <span className="text-slate-600">
              {formatPercent(row.portfolioWeight)} portfolio
            </span>
          </div>
          <BarRow
            primary={row.portfolioWeight}
            secondary={row.benchmarkWeight ?? 0}
            tertiary={row.modelWeight ?? 0}
          />
          <div className="flex justify-between text-xs text-slate-500">
            <span>BM {formatPercent(row.benchmarkWeight)}</span>
            <span>TME {formatPercent(row.modelWeight)}</span>
            <span>Active {formatPercent(row.activeVsBenchmark)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function DistributionList({ rows }: Readonly<{ rows: DistributionRow[] }>) {
  const max = Math.max(
    ...rows.flatMap((row) => [row.portfolioWeight, row.comparisonWeight ?? 0]),
    0.01,
  );

  return (
    <div className="grid gap-3">
      {rows.map((row) => (
        <div
          key={row.label}
          className="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-950">{row.label}</span>
            <span className="text-xs text-slate-500">
              {formatPercent(row.portfolioWeight)} | TME {formatPercent(row.comparisonWeight)}
            </span>
          </div>
          <div className="mt-3 grid gap-2">
            <Bar color="bg-slate-950" value={row.portfolioWeight} max={max} />
            <Bar color="bg-emerald-600" value={row.comparisonWeight ?? 0} max={max} />
          </div>
        </div>
      ))}
    </div>
  );
}

function BarRow({
  primary,
  secondary,
  tertiary,
}: Readonly<{
  primary: number;
  secondary: number;
  tertiary: number;
}>) {
  const max = Math.max(primary, secondary, tertiary, 0.01);

  return (
    <div className="grid gap-2">
      <Bar color="bg-slate-950" value={primary} max={max} />
      <Bar color="bg-emerald-600" value={secondary} max={max} />
      <Bar color="bg-amber-500" value={tertiary} max={max} />
    </div>
  );
}

function Bar({
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
    <div className="h-2 rounded-full bg-slate-200">
      <div className={`h-2 rounded-full ${color}`} style={{ width }} />
    </div>
  );
}

function RankedList({
  title,
  holdings,
  metric,
}: Readonly<{
  title: string;
  holdings: CanonicalHolding[];
  metric: (holding: CanonicalHolding) => string;
}>) {
  return (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-emerald-800">
        {title}
      </h3>
      <div className="mt-3 grid gap-2">
        {holdings.map((holding) => (
          <div
            key={holding.canonicalId}
            className="flex items-center justify-between rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-3"
          >
            <div>
              <p className="text-sm font-semibold text-slate-950">
                {holding.securityName}
              </p>
              <p className="text-xs text-slate-500">
                {holding.ticker ?? "No ticker"} | {holding.sector ?? "No sector"}
              </p>
            </div>
            <p className="text-sm font-semibold text-slate-700">{metric(holding)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function StockDetailCard({ holding }: Readonly<{ holding: CanonicalHolding }>) {
  return (
    <div className="rounded-[1.25rem] border border-slate-200 bg-white/85 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800">
        Stock Detail
      </p>
      <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
        {holding.securityName}
      </h3>
      <p className="mt-2 text-sm text-slate-600">
        {holding.ticker ?? "No ticker"} | {holding.isin ?? "No ISIN"} |{" "}
        {holding.country ?? "No country"} | {holding.sector ?? "No sector"}
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Detail label="Target Weight" value={formatPercent(holding.targetWeight)} />
        <Detail label="Drifted Weight" value={formatPercent(holding.driftedWeight)} />
        <Detail label="Benchmark Weight" value={formatPercent(holding.benchmarkWeight)} />
        <Detail label="TME Weight" value={formatPercent(holding.modelWeight)} />
        <Detail label="Active vs BM" value={formatPercent(holding.activeWeightVsBenchmark)} />
        <Detail label="Active vs TME" value={formatPercent(holding.activeWeightVsModel)} />
        <Detail label="PFV" value={formatNumber(holding.priceToFairValue)} />
        <Detail label="Upside" value={formatPercent(holding.upsideToFairValue)} />
        <Detail label="Forward PE" value={formatNumber(holding.forwardPE)} />
        <Detail label="ROE" value={formatPercent(holding.roe, 1)} />
        <Detail label="P/B" value={formatNumber(holding.priceToBook)} />
        <Detail label="Moat" value={holding.moat ?? "n/a"} />
        <Detail label="Uncertainty" value={holding.uncertainty ?? "n/a"} />
        <Detail label="1M Return" value={formatPercent(holding.oneMonthReturn)} />
        <Detail label="YTD Return" value={formatPercent(holding.ytdReturn)} />
        <Detail label="Price" value={formatNumber(holding.price)} />
      </div>

      <div className="mt-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          Source Coverage
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {holding.sourceSheets.map((sheet) => (
            <span
              key={sheet}
              className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
            >
              {sheet}
            </span>
          ))}
        </div>
      </div>

      {holding.dataQualityFlags.length > 0 ? (
        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Data Flags
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {holding.dataQualityFlags.map((flag) => (
              <span
                key={flag}
                className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800"
              >
                {flag}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Detail({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-[0.95rem] border border-slate-200 bg-slate-50/70 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-base font-semibold text-slate-900">{value}</p>
    </div>
  );
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
