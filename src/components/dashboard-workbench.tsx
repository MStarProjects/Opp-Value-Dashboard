"use client";

import { useState, useTransition } from "react";

import { buildDashboardState } from "@/features/dashboard/buildDashboardState";
import { parseWorkbook } from "@/features/workbook/parseWorkbook";
import type { DashboardState } from "@/types/dashboard";
import type { CanonicalHolding } from "@/types/holdings";
import type { ExposureRow, DistributionRow } from "@/types/metrics";

export function DashboardWorkbench({
  initialState,
}: Readonly<{
  initialState: DashboardState;
}>) {
  const [dashboardState, setDashboardState] = useState<DashboardState>(initialState);
  const [selectedHoldingId, setSelectedHoldingId] = useState<string>();
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  const selectedHolding =
    dashboardState.holdings.find((holding) => holding.canonicalId === selectedHoldingId) ??
    dashboardState.stockDetail;

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) {
      return;
    }

    setError(undefined);

    startTransition(async () => {
      try {
        const parsed = await Promise.all([...fileList].map((file) => parseWorkbook(file)));
        const nextState = await buildDashboardState(parsed);
        setDashboardState(nextState);
        setSelectedHoldingId(undefined);
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to parse the selected workbook file.",
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
                Monthly PMHub holdings plus Morningstar enrichment.
              </h1>
              <p className="max-w-2xl text-base leading-8 text-slate-700 md:text-lg">
                This version is data-first. It starts from the monthly PMHub
                holdings workbook, preserves workbook-owned fields, and makes
                the API match requirements explicit before we spend any more
                time on dashboard polish.
              </p>
            </div>

            <label className="flex cursor-pointer flex-col gap-3 rounded-[1.5rem] border border-dashed border-emerald-700/35 bg-slate-950 p-6 text-slate-50 shadow-[0_18px_40px_rgba(15,23,42,0.22)] lg:w-[26rem]">
              <span className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-200">
                Replace PMHub File
              </span>
              <span className="text-sm leading-7 text-slate-300">
                Upload the monthly PMHub workbook. Morningstar API enrichment is
                still stubbed, so the useful output right now is the audit.
              </span>
              <input
                className="hidden"
                type="file"
                accept=".xlsx,.xls"
                multiple={false}
                onChange={(event) => void handleFiles(event.target.files)}
              />
              <span className="inline-flex w-fit rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950">
                {isPending ? "Rebuilding audit..." : "Choose PMHub workbook"}
              </span>
            </label>
          </div>

          {error ? (
            <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </p>
          ) : null}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Panel
            title="Workbook Audit"
            description="This is the first thing we should trust: what the monthly PMHub workbook actually contains after parsing."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <MetricCard label="As Of" value={dashboardState.asOfLabel ?? "Not detected"} />
              <MetricCard label="Parsed Workbook Rows" value={String(dashboardState.audit.parsedWorkbookRows)} />
              <MetricCard label="Recognized Holdings" value={String(dashboardState.audit.parsedHoldingRows)} />
              <MetricCard label="Weighted Rows" value={String(dashboardState.audit.weightedHoldingRows)} />
              <MetricCard label="Duplicate ISINs" value={String(dashboardState.audit.duplicateIsinCount)} />
              <MetricCard label="Duplicate Tickers" value={String(dashboardState.audit.duplicateTickerCount)} />
              <MetricCard label="Missing ISIN" value={String(dashboardState.audit.rowsMissingIsin)} />
              <MetricCard label="Missing Ticker" value={String(dashboardState.audit.rowsMissingTicker)} />
              <MetricCard label="Currency Contrib Coverage" value={String(dashboardState.audit.currencyContributionCoverageCount)} />
              <MetricCard label="Workbook Fallback Rows" value={String(dashboardState.audit.workbookFallbackCoverageCount)} />
            </div>
          </Panel>

          <Panel
            title="Morningstar API Audit"
            description="The app is now structured around API enrichment, but the internal endpoint wiring is intentionally still a stub."
          >
            <div className="grid gap-3">
              <MetricCard label="Provider" value="Morningstar Internal API" />
              <MetricCard label="Status" value={dashboardState.enrichmentAudit.status} />
              <MetricCard label="API Matches" value={String(dashboardState.audit.apiMatchedCount)} />
              <MetricCard label="Ready By ISIN" value={String(dashboardState.audit.apiReadyByIsinCount)} />
              <MetricCard label="Ticker Fallback" value={String(dashboardState.audit.apiFallbackTickerCount)} />
              <MetricCard label="Matched By ISIN" value={String(dashboardState.enrichmentAudit.matchedByIsin)} />
              <MetricCard label="Matched By Ticker" value={String(dashboardState.enrichmentAudit.matchedByTicker)} />
              <MetricCard
                label="Unmatched Holdings"
                value={String(dashboardState.enrichmentAudit.unmatchedHoldings)}
              />
              <MetricCard
                label="Benchmark Constituents"
                value={String(dashboardState.enrichmentAudit.benchmarkConstituentCount)}
              />
              <MetricCard
                label="Benchmark Id"
                value={dashboardState.enrichmentAudit.benchmarkInvestmentId ?? "n/a"}
              />
              <MetricCard
                label="Direct Data Set"
                value={dashboardState.enrichmentAudit.directDataSetIdOrName ?? "n/a"}
              />
            </div>
            <div className="mt-5 grid gap-2">
              {dashboardState.enrichmentAudit.requestedFieldGroups.map((fieldGroup) => (
                <div
                  key={fieldGroup}
                  className="rounded-[0.9rem] border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-700"
                >
                  {fieldGroup}
                </div>
              ))}
            </div>
            <div className="mt-5 grid gap-2">
              {dashboardState.enrichmentAudit.notes.map((note) => (
                <div
                  key={note}
                  className="rounded-[0.9rem] border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
                >
                  {note}
                </div>
              ))}
            </div>
          </Panel>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
          <Panel
            title="Active Summary"
            description="These are current workbook-backed metrics for the weighted holdings set."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <MetricCard label="Holdings" value={String(dashboardState.summary.holdingCount)} />
              <MetricCard label="Total Weight" value={formatPercent(dashboardState.summary.totalWeight)} />
              <MetricCard label="Weighted Forward PE" value={formatNumber(dashboardState.summary.weightedForwardPE)} />
              <MetricCard label="Weighted P/B" value={formatNumber(dashboardState.summary.weightedPriceToBook)} />
              <MetricCard label="Weighted ROE" value={formatPercent(dashboardState.summary.weightedRoe, 1)} />
              <MetricCard label="Weighted PFV" value={formatNumber(dashboardState.summary.weightedPriceToFairValue)} />
            </div>
          </Panel>

          <Panel
            title="Source Snapshot"
            description="For now the active source set should just be the monthly PMHub workbook."
          >
            <div className="grid gap-4">
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
                    Date: {source.dateLabel ?? source.dateToken ?? "not detected"}
                  </p>
                  <p className="text-sm leading-6 text-slate-700">
                    Sheets: {source.sheetCount}
                  </p>
                </article>
              ))}
            </div>
          </Panel>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <Panel title="Sector Exposure" description="Workbook-backed sector exposure for weighted holdings.">
            <ExposureList rows={dashboardState.sectorExposure.slice(0, 10)} />
          </Panel>

          <Panel title="Country Exposure" description="Workbook-backed country exposure for weighted holdings.">
            <ExposureList rows={dashboardState.countryExposure.slice(0, 10)} />
          </Panel>
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <Panel title="Top Overweights" description="Current active weights versus benchmark. Benchmark values will come from API once wired.">
            <RankedList
              title="Largest Active vs Benchmark"
              holdings={dashboardState.topActivePositions}
              metric={(holding) => formatPercent(holding.activeWeightVsBenchmark)}
            />
          </Panel>

          <Panel title="Top Underweights" description="Current underweights versus benchmark when benchmark data is available.">
            <RankedList
              title="Largest Negative Active"
              holdings={dashboardState.topUnderweights}
              metric={(holding) => formatPercent(holding.activeWeightVsBenchmark)}
            />
          </Panel>

          <Panel title="PFV Upside" description="Current upside values from workbook fallback fields where available.">
            <RankedList
              title="Largest Upside"
              holdings={dashboardState.topUpsidePositions}
              metric={(holding) => formatPercent(holding.upsideToFairValue)}
            />
          </Panel>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <Panel title="PFV Distribution" description="Current PFV distribution from workbook fields until API enrichment is connected.">
            <DistributionList rows={dashboardState.pfvDistribution} />
          </Panel>

          <Panel title="Moat Distribution" description="Moat coverage will become meaningful once the Morningstar API is wired.">
            <DistributionList rows={dashboardState.moatDistribution} />
          </Panel>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Panel title="Stock Detail" description="Use this to inspect one weighted holding at a time while we audit the data model.">
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
                        {holding.ticker ?? "No ticker"} | {holding.country ?? "No country"} |{" "}
                        {formatPercent(holding.targetWeight ?? holding.driftedWeight)}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {selectedHolding ? <StockDetailCard holding={selectedHolding} /> : null}
            </div>
          </Panel>

          <Panel title="Issue Queue" description="Missing fields and identifier gaps that still need to be cleaned up.">
            <div className="grid gap-3">
              {dashboardState.issues.length > 0 ? (
                dashboardState.issues.map((issue, index) => (
                  <div
                    key={`${issue.code}-${index}`}
                    className="rounded-[1rem] border border-amber-200 bg-amber-50 px-4 py-3"
                  >
                    <p className="text-sm font-semibold text-amber-900">{issue.message}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.14em] text-amber-700">
                      {issue.code}
                    </p>
                  </div>
                ))
              ) : (
                <p className="rounded-[1rem] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  No issues detected in the current weighted holdings set.
                </p>
              )}
            </div>
          </Panel>
        </section>
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
        <h2 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-700">{description}</p>
      </div>
      {children}
    </section>
  );
}

function MetricCard({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-[1.1rem] border border-slate-200 bg-slate-50/80 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800">{label}</p>
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
            <span className="text-slate-600">{formatPercent(row.portfolioWeight)} portfolio</span>
          </div>
          <BarRow
            primary={row.portfolioWeight}
            secondary={row.benchmarkWeight ?? 0}
            tertiary={row.modelWeight ?? 0}
          />
          <div className="flex justify-between text-xs text-slate-500">
            <span>BM {formatPercent(row.benchmarkWeight)}</span>
            <span>API ref {formatPercent(row.modelWeight)}</span>
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
              {formatPercent(row.portfolioWeight)} | API {formatPercent(row.comparisonWeight)}
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
              <p className="text-sm font-semibold text-slate-950">{holding.securityName}</p>
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
        <Detail label="Currency Contrib" value={formatPercent(holding.currencyContribution)} />
        <Detail label="Benchmark Weight" value={formatPercent(holding.benchmarkWeight)} />
        <Detail label="PFV" value={formatNumber(holding.priceToFairValue)} />
        <Detail label="Upside" value={formatPercent(holding.upsideToFairValue)} />
        <Detail label="Forward PE" value={formatNumber(holding.forwardPE)} />
        <Detail label="ROE" value={formatPercent(holding.roe, 1)} />
        <Detail label="P/B" value={formatNumber(holding.priceToBook)} />
        <Detail label="Moat" value={holding.moat ?? "n/a"} />
        <Detail label="Uncertainty" value={holding.uncertainty ?? "n/a"} />
      </div>

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
    </div>
  );
}

function Detail({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-[0.95rem] border border-slate-200 bg-slate-50/70 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
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
