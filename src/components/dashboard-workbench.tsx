"use client";

import { useEffect, useState, type ReactNode } from "react";
import * as XLSX from "xlsx";

import {
  buildCountryExposure,
  buildSectorExposure,
} from "@/features/calculations/sectorAggregation";
import type { AlgoCountrySeries } from "@/types/algo";
import type { DashboardState } from "@/types/dashboard";
import type { CanonicalHolding } from "@/types/holdings";
import type { ExposureRow } from "@/types/metrics";

type DashboardTab = "summary" | "algo" | "details";
type UploadTarget = "pmhub" | "algo";
type SortDirection = "asc" | "desc";
type TableZoom = 100 | 90 | 80 | 70;
type AttributionPeriod = "1M" | "MTD" | "YTD" | "1Y";

type LookthroughColumnKey =
  | "securityName"
  | "isin"
  | "country"
  | "sector"
  | "targetWeight"
  | "benchmarkWeight"
  | "priceToFairValue"
  | "upsideToFairValue"
  | "forwardPE"
  | "priceToBook"
  | "roe"
  | "moat"
  | "uncertainty";

interface LookthroughColumn {
  key: LookthroughColumnKey;
  label: string;
  align?: "left" | "right";
  minWidth?: string;
  getValue: (holding: CanonicalHolding) => string | number | undefined | null;
  render: (holding: CanonicalHolding) => ReactNode;
}

interface WeightedMetricsSnapshot {
  totalWeight: number;
  weightedPriceToFairValue?: number;
  weightedForwardPE?: number;
  weightedPriceToBook?: number;
  weightedRoe?: number;
  weightedUpsideToFairValue?: number;
}

interface AttributionRow {
  label: string;
  value: number;
  portfolioContribution: number;
  benchmarkContribution: number;
  apiReturn?: number;
}

interface ComparisonDistributionRow {
  label: string;
  portfolioWeight: number;
  benchmarkWeight: number;
}

type AlgoCountryDisplayRow = ExposureRow;

interface AlgoHoverPoint {
  country: string;
  dateLabel: string;
  value: number;
  color: string;
  x: number;
  y: number;
}

const lookthroughColumns: LookthroughColumn[] = [
  {
    key: "securityName",
    label: "Stock",
    minWidth: "min-w-[11rem]",
    getValue: (holding) => holding.securityName,
    render: (holding) => (
      <div
        className="w-[11rem] truncate font-semibold text-stone-950"
        title={holding.securityName}
      >
        {holding.securityName}
      </div>
    ),
  },
  {
    key: "isin",
    label: "ISIN",
    minWidth: "min-w-[7.5rem]",
    getValue: (holding) => holding.isin,
    render: (holding) => holding.isin ?? "n/a",
  },
  {
    key: "country",
    label: "Country",
    minWidth: "min-w-[6rem]",
    getValue: (holding) => holding.country,
    render: (holding) => (
      <div className="w-[6rem] truncate" title={holding.country ?? "Unknown"}>
        {holding.country ?? "Unknown"}
      </div>
    ),
  },
  {
    key: "sector",
    label: "Sector",
    minWidth: "min-w-[8rem]",
    getValue: (holding) => holding.sector,
    render: (holding) => (
      <div className="w-[8rem] truncate" title={holding.sector ?? "Unknown"}>
        {holding.sector ?? "Unknown"}
      </div>
    ),
  },
  {
    key: "targetWeight",
    label: "Opp Value Weight",
    align: "right",
    minWidth: "min-w-[5rem]",
    getValue: (holding) => holding.targetWeight,
    render: (holding) => renderWeightCell(holding.targetWeight),
  },
  {
    key: "benchmarkWeight",
    label: "Weight Benchmark",
    align: "right",
    minWidth: "min-w-[5rem]",
    getValue: (holding) => holding.benchmarkWeight,
    render: (holding) => renderWeightCell(holding.benchmarkWeight),
  },
  {
    key: "priceToFairValue",
    label: "MER P/Fair Value",
    align: "right",
    minWidth: "min-w-[5rem]",
    getValue: (holding) => holding.priceToFairValue,
    render: (holding) => formatNumber(holding.priceToFairValue),
  },
  {
    key: "upsideToFairValue",
    label: "Upside MER V",
    align: "right",
    minWidth: "min-w-[5.25rem]",
    getValue: (holding) => holding.upsideToFairValue,
    render: (holding) => renderUpsideCell(holding.upsideToFairValue),
  },
  {
    key: "forwardPE",
    label: "Forw PE",
    align: "right",
    minWidth: "min-w-[4rem]",
    getValue: (holding) => holding.forwardPE,
    render: (holding) => formatNumber(holding.forwardPE),
  },
  {
    key: "priceToBook",
    label: "P/B",
    align: "right",
    minWidth: "min-w-[3.75rem]",
    getValue: (holding) => holding.priceToBook,
    render: (holding) => formatNumber(holding.priceToBook),
  },
  {
    key: "roe",
    label: "RO",
    align: "right",
    minWidth: "min-w-[3.75rem]",
    getValue: (holding) => holding.roe,
    render: (holding) => formatRoeCell(holding.roe),
  },
  {
    key: "moat",
    label: "M* MD Rating",
    minWidth: "min-w-[5rem]",
    getValue: (holding) => holding.moat,
    render: (holding) => holding.moat ?? "Unknown",
  },
  {
    key: "uncertainty",
    label: "Fair Value Uncertainty",
    minWidth: "min-w-[6rem]",
    getValue: (holding) => holding.uncertainty,
    render: (holding) => holding.uncertainty ?? "Unknown",
  },
];

const defaultVisibleColumnKeys: LookthroughColumnKey[] = lookthroughColumns.map(
  (column) => column.key,
);
const tableZoomOptions: TableZoom[] = [100, 90, 80, 70];

export function DashboardWorkbench({
  initialState,
}: Readonly<{
  initialState: DashboardState;
}>) {
  const [dashboardState, setDashboardState] = useState<DashboardState>(initialState);
  const [activeTab, setActiveTab] = useState<DashboardTab>("summary");
  const [tokenValue, setTokenValue] = useState("");
  const [tokenStatus, setTokenStatus] = useState<string>();
  const [tokenStatusTone, setTokenStatusTone] = useState<
    "neutral" | "success" | "error"
  >("neutral");
  const [error, setError] = useState<string>();
  const [isUploadingPmhub, setIsUploadingPmhub] = useState(false);
  const [isUploadingAlgo, setIsUploadingAlgo] = useState(false);
  const [isSavingToken, setIsSavingToken] = useState(false);
  const [sortKey, setSortKey] = useState<LookthroughColumnKey>("targetWeight");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [columnFilters, setColumnFilters] = useState<
    Partial<Record<LookthroughColumnKey, string>>
  >({});
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<LookthroughColumnKey[]>(
    defaultVisibleColumnKeys,
  );
  const [tableZoom, setTableZoom] = useState<TableZoom>(90);
  const [isExportingLookthrough, setIsExportingLookthrough] = useState(false);

  useEffect(() => {
    if (!tokenStatus) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setTokenStatus(undefined), 4200);
    return () => window.clearTimeout(timeout);
  }, [tokenStatus]);

  useEffect(() => {
    if (!error) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setError(undefined), 4200);
    return () => window.clearTimeout(timeout);
  }, [error]);

  const visibleColumns = lookthroughColumns.filter((column) =>
    visibleColumnKeys.includes(column.key),
  );
  const filteredAndSortedDetailRows = [...dashboardState.detailRows]
    .filter((holding) =>
      visibleColumns.every((column) => {
        const filterValue = columnFilters[column.key]?.trim().toLowerCase();
        if (!filterValue) {
          return true;
        }

        const candidateValue = stringifyForFilter(column.getValue(holding));
        return candidateValue.includes(filterValue);
      }),
    )
    .sort((left, right) => {
      const leftValue = normalizeSortValue(
        visibleColumns.find((column) => column.key === sortKey)?.getValue(left),
      );
      const rightValue = normalizeSortValue(
        visibleColumns.find((column) => column.key === sortKey)?.getValue(right),
      );

      if (leftValue === rightValue) {
        return 0;
      }

      if (leftValue == null) {
        return 1;
      }

      if (rightValue == null) {
        return -1;
      }

      if (typeof leftValue === "number" && typeof rightValue === "number") {
        return sortDirection === "asc"
          ? leftValue - rightValue
          : rightValue - leftValue;
      }

      return sortDirection === "asc"
        ? String(leftValue).localeCompare(String(rightValue))
        : String(rightValue).localeCompare(String(leftValue));
    });

  async function handleExportLookthrough() {
    try {
      setIsExportingLookthrough(true);
      setError(undefined);

      const workbook = XLSX.utils.book_new();
      const headerRow = visibleColumns.map((column) => column.label);
      const bodyRows = filteredAndSortedDetailRows.map((holding) =>
        visibleColumns.map((column) => {
          const value = column.getValue(holding);
          return value == null ? "" : value;
        }),
      );

      const worksheet = XLSX.utils.aoa_to_sheet([headerRow, ...bodyRows]);
      worksheet["!autofilter"] = {
        ref: XLSX.utils.encode_range({
          s: { r: 0, c: 0 },
          e: {
            r: Math.max(bodyRows.length, 1),
            c: Math.max(headerRow.length - 1, 0),
          },
        }),
      };
      worksheet["!cols"] = visibleColumns.map((column) => ({
        wch: exportColumnWidth(column),
      }));

      XLSX.utils.book_append_sheet(workbook, worksheet, "Lookthrough");

      const labelToken = dashboardState.asOfLabel
        ? dashboardState.asOfLabel.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")
        : "latest";
      XLSX.writeFile(workbook, `opp-value-lookthrough-${labelToken}.xlsx`);

      setTokenStatus("Lookthrough exported to Excel.");
      setTokenStatusTone("success");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to export the lookthrough view.",
      );
    } finally {
      setIsExportingLookthrough(false);
    }
  }

  async function handleFiles(fileList: FileList | null, uploadTarget: UploadTarget) {
    if (!fileList || fileList.length === 0) {
      return;
    }

    setError(undefined);
    if (uploadTarget === "pmhub") {
      setIsUploadingPmhub(true);
    } else {
      setIsUploadingAlgo(true);
    }

    try {
      const file = fileList[0];
      const formData = new FormData();
      formData.set("file", file);

      const response = await fetch("/api/dashboard-state?reason=manual_upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload.error ?? "Unable to rebuild dashboard state.");
      }

      const nextState = (await response.json()) as DashboardState;
      setDashboardState(nextState);
      setTokenStatus(uploadTarget === "pmhub" ? "PMHub workbook loaded." : "Algo workbook loaded.");
      setTokenStatusTone("success");
      setActiveTab(uploadTarget === "pmhub" ? "details" : "algo");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to parse the selected workbook file.",
      );
    } finally {
      if (uploadTarget === "pmhub") {
        setIsUploadingPmhub(false);
      } else {
        setIsUploadingAlgo(false);
      }
    }
  }

  async function refreshLiveData() {
    const refreshResponse = await fetch("/api/dashboard-state?reason=token_refresh", {
      method: "POST",
    });

    if (!refreshResponse.ok) {
      const payload = (await refreshResponse.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(payload.error ?? "Unable to refresh dashboard state.");
    }

    return (await refreshResponse.json()) as DashboardState;
  }

  async function handleTokenSave() {
    setError(undefined);
    setIsSavingToken(true);

    try {
      if (tokenValue.trim()) {
        setTokenStatus("Token saved. Refreshing live data...");
        setTokenStatusTone("neutral");

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
      } else {
        setTokenStatus("Refreshing live data...");
        setTokenStatusTone("neutral");
      }

      const nextState = await refreshLiveData();
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
        setTokenStatus(`Live refresh failed: ${failureNote}`);
        setTokenStatusTone("error");
      }
    } catch (caughtError) {
      setTokenStatus(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to refresh Morningstar data.",
      );
      setTokenStatusTone("error");
    } finally {
      setIsSavingToken(false);
    }
  }

  function handleSort(nextKey: LookthroughColumnKey) {
    if (nextKey === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection("desc");
  }

  function handleFilterChange(columnKey: LookthroughColumnKey, value: string) {
    setColumnFilters((current) => ({
      ...current,
      [columnKey]: value,
    }));
  }

  function handleColumnVisibilityToggle(columnKey: LookthroughColumnKey) {
    setVisibleColumnKeys((current) => {
      if (current.includes(columnKey)) {
        if (current.length === 1) {
          return current;
        }

        const nextVisibleColumnKeys = current.filter((key) => key !== columnKey);
        if (sortKey === columnKey) {
          setSortKey(nextVisibleColumnKeys[0] ?? "securityName");
          setSortDirection("desc");
        }
        return nextVisibleColumnKeys;
      }

      return defaultVisibleColumnKeys.filter(
        (key) => current.includes(key) || key === columnKey,
      );
    });
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f6f2e7_0%,_#eee7d7_100%)] px-4 py-5 text-stone-900 md:px-6">
      <ToastBanner
        message={tokenStatus}
        tone={tokenStatusTone}
        className={error ? "top-4" : "top-4"}
      />
      <ToastBanner
        message={error}
        tone="error"
        className={tokenStatus ? "top-20" : "top-4"}
      />

      <div className="mx-auto flex w-full max-w-[1720px] flex-col gap-4">
        <section className="max-w-[980px] rounded-[1.1rem] border border-white/60 bg-[linear-gradient(135deg,_rgba(15,23,42,0.98)_0%,_rgba(30,41,59,0.96)_62%,_rgba(120,53,15,0.86)_100%)] px-5 py-4 text-white shadow-[0_14px_28px_rgba(32,26,19,0.12)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-200/90">
                Equity Sleeve Dashboard
              </p>
              <h1 className="font-serif text-[1.95rem] leading-none tracking-[-0.05em] md:text-[3.1rem]">
                Global xUS Opportunistic Value
              </h1>
            </div>

            <div className="flex flex-col gap-3 lg:items-end">
              <div className="flex flex-wrap gap-5 text-sm">
                <TopStat
                  label="Portfolio As Of"
                  value={dashboardState.asOfLabel ?? "Latest"}
                />
                <TopStat
                  label="Morningstar As Of"
                  value={dashboardState.morningstarAsOfLabel ?? "n/a"}
                />
                <TopStat
                  label="Total Holdings"
                  value={String(dashboardState.summary.holdingCount)}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <label className="cursor-pointer rounded-full bg-amber-300 px-3.5 py-2 text-xs font-semibold text-slate-950 transition hover:bg-amber-200">
                  {isUploadingPmhub ? "Loading PMHub..." : "Upload PMHub"}
                  <input
                    className="hidden"
                    type="file"
                    accept=".xlsx,.xls"
                    multiple={false}
                    onChange={(event) => void handleFiles(event.target.files, "pmhub")}
                  />
                </label>
                <label className="cursor-pointer rounded-full bg-white/90 px-3.5 py-2 text-xs font-semibold text-slate-950 transition hover:bg-white">
                  {isUploadingAlgo ? "Loading Algo..." : "Upload Algo"}
                  <input
                    className="hidden"
                    type="file"
                    accept=".xlsx,.xls"
                    multiple={false}
                    onChange={(event) => void handleFiles(event.target.files, "algo")}
                  />
                </label>
                <input
                  type="password"
                  value={tokenValue}
                  onChange={(event) => setTokenValue(event.target.value)}
                  placeholder="Morningstar token"
                  className="w-[15rem] rounded-full border border-white/15 bg-white/92 px-3.5 py-2 text-xs text-slate-950 outline-none placeholder:text-slate-500"
                />
                <button
                  type="button"
                  onClick={() => void handleTokenSave()}
                  className="rounded-full bg-white px-3.5 py-2 text-xs font-semibold text-slate-950 transition hover:bg-slate-100"
                >
                  {isSavingToken
                    ? "Refreshing..."
                    : tokenValue.trim()
                      ? "Save token"
                      : "Refresh live"}
                </button>
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-200">
                <span>
                  Live data:{" "}
                  <strong className="font-semibold text-white">
                    {dashboardState.enrichmentAudit.status}
                  </strong>
                </span>
                <span>
                  Exact matches:{" "}
                  <strong className="font-semibold text-white">
                    {dashboardState.enrichmentAudit.benchmarkMatchedExactly ?? 0}
                  </strong>
                </span>
                <span>
                  Equivalent matches:{" "}
                  <strong className="font-semibold text-white">
                    {dashboardState.enrichmentAudit.benchmarkMatchedByEquivalent ?? 0}
                  </strong>
                </span>
                <span>
                  Benchmark names:{" "}
                  <strong className="font-semibold text-white">
                    {dashboardState.enrichmentAudit.benchmarkConstituentCount}
                  </strong>
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[1rem] border border-stone-200/80 bg-white/92 p-2 shadow-[0_10px_20px_rgba(59,47,33,0.05)]">
          <div className="flex flex-wrap gap-2">
            <TabButton
              label="Summary"
              isActive={activeTab === "summary"}
              onClick={() => setActiveTab("summary")}
            />
            <TabButton
              label="Algo"
              isActive={activeTab === "algo"}
              onClick={() => setActiveTab("algo")}
            />
            <TabButton
              label="Details / Portfolio Lookthrough"
              isActive={activeTab === "details"}
              onClick={() => setActiveTab("details")}
            />
          </div>
        </section>

        {activeTab === "summary" ? (
          <SummaryTab dashboardState={dashboardState} />
        ) : activeTab === "algo" ? (
          <AlgoTab
            key={dashboardState.algo.sourceFileName ?? dashboardState.algo.latestDateKey ?? "algo"}
            dashboardState={dashboardState}
          />
        ) : (
          <LookthroughTab
            holdings={filteredAndSortedDetailRows}
            visibleColumns={visibleColumns}
            visibleColumnKeys={visibleColumnKeys}
            sortKey={sortKey}
            sortDirection={sortDirection}
            columnFilters={columnFilters}
            tableZoom={tableZoom}
            onSort={handleSort}
            onFilterChange={handleFilterChange}
            onToggleColumnVisibility={handleColumnVisibilityToggle}
            onTableZoomChange={setTableZoom}
            onExport={handleExportLookthrough}
            isExporting={isExportingLookthrough}
          />
        )}
      </div>
    </main>
  );
}

function SummaryTab({
  dashboardState,
}: Readonly<{
  dashboardState: DashboardState;
}>) {
  const [attributionPeriod, setAttributionPeriod] =
    useState<AttributionPeriod>("MTD");
  const portfolioHoldings = dashboardState.holdings;
  const joinedHoldings = buildSummaryUniverseRows(dashboardState.detailRows);
  const portfolioSnapshot = buildWeightedMetricsSnapshot(
    portfolioHoldings,
    (holding) => holding.targetWeight,
  );
  const benchmarkSnapshot = buildWeightedMetricsSnapshot(
    joinedHoldings,
    (holding) => holding.benchmarkWeight,
  );
  const summaryRows = [
    { label: "Total Weight", value: formatPercent(portfolioSnapshot.totalWeight) },
    {
      label: "Weighted P/FV",
      value: formatNumber(portfolioSnapshot.weightedPriceToFairValue),
    },
    {
      label: "Weighted Upside",
      value: formatUpside(portfolioSnapshot.weightedUpsideToFairValue),
    },
    {
      label: "Weighted PE",
      value: formatNumber(portfolioSnapshot.weightedForwardPE),
    },
    {
      label: "Weighted P/B",
      value: formatNumber(portfolioSnapshot.weightedPriceToBook),
    },
    {
      label: "Weighted ROE",
      value: formatPercent(portfolioSnapshot.weightedRoe, 1),
    },
  ];
  const benchmarkRows = [
    { label: "Total Weight", value: formatPercent(benchmarkSnapshot.totalWeight) },
    {
      label: "Weighted P/FV",
      value: formatNumber(benchmarkSnapshot.weightedPriceToFairValue),
    },
    {
      label: "Weighted Upside",
      value: formatUpside(benchmarkSnapshot.weightedUpsideToFairValue),
    },
    {
      label: "Weighted PE",
      value: formatNumber(benchmarkSnapshot.weightedForwardPE),
    },
    {
      label: "Weighted P/B",
      value: formatNumber(benchmarkSnapshot.weightedPriceToBook),
    },
    {
      label: "Weighted ROE",
      value: formatPercent(benchmarkSnapshot.weightedRoe, 1),
    },
  ];
  const sectorRows = buildSectorExposure(joinedHoldings);
  const countryRows = buildCountryRowsWithAlgo(
    buildCountryExposure(joinedHoldings),
    dashboardState.algo.rows,
  );
  const moatRows = buildCategoryComparisonRows(joinedHoldings, (holding) => holding.moat);
  const qualityRows = buildQualityDistributionRows(joinedHoldings);
  const attributionRows = buildAttributionRows(joinedHoldings, attributionPeriod);
  const positiveAttributionRows = attributionRows
    .filter((row) => row.value > 0)
    .slice(0, 8);
  const negativeAttributionRows = attributionRows
    .filter((row) => row.value < 0)
    .slice(0, 8);

  const benchmarkConnectionRows = [
    { label: "Status", value: dashboardState.enrichmentAudit.status },
    {
      label: "Benchmark Constituents",
      value: String(dashboardState.enrichmentAudit.benchmarkConstituentCount),
    },
    {
      label: "Exact Matches",
      value: String(dashboardState.enrichmentAudit.benchmarkMatchedExactly ?? 0),
    },
    {
      label: "Equivalent Matches",
      value: String(dashboardState.enrichmentAudit.benchmarkMatchedByEquivalent ?? 0),
    },
    {
      label: "Off Benchmark",
      value: String(dashboardState.enrichmentAudit.offBenchmarkRows ?? 0),
    },
    {
      label: "Cash Rows",
      value: String(dashboardState.enrichmentAudit.cashLikeRows ?? 0),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Section title="Summary Snapshot">
        <div className="grid gap-4 xl:grid-cols-2">
          <SnapshotCard title="Portfolio" rows={summaryRows} />
          <SnapshotCard title="Benchmark" rows={benchmarkRows} />
        </div>
      </Section>

      <Section title="Sector & Country">
        <div className="flex flex-col gap-4">
          <CompactExposureCard
            title="Sector Position"
            rows={sectorRows}
            columnCountClassName="md:grid-cols-2"
          />
          <CountryPositionCard
            title="Country Position"
            rows={countryRows}
            hasAlgo={dashboardState.algo.available}
          />
        </div>
      </Section>

      <Section title="Moat & Quality">
        <div className="grid gap-4 xl:grid-cols-2">
          <DistributionComparisonCard title="Moat" rows={moatRows} />
          <DistributionComparisonCard title="Quality" rows={qualityRows} />
        </div>
      </Section>

      <Section title="Attribution">
        <div className="flex flex-wrap gap-2">
          {(["1M", "MTD", "YTD", "1Y"] as AttributionPeriod[]).map((period) => (
            <button
              key={period}
              type="button"
              onClick={() => setAttributionPeriod(period)}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                attributionPeriod === period
                  ? "bg-stone-950 text-white"
                  : "border border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
              }`}
            >
              {period}
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <AttributionCard
            title={`${attributionPeriod} Contributors`}
            rows={positiveAttributionRows}
          />
          <AttributionCard
            title={`${attributionPeriod} Detractors`}
            rows={negativeAttributionRows}
          />
        </div>
      </Section>

      <Section title="Benchmark Connection">
        <KeyValueTable rows={benchmarkConnectionRows} />
      </Section>
    </div>
  );
}

function AlgoTab({
  dashboardState,
}: Readonly<{
  dashboardState: DashboardState;
}>) {
  const availableCountries = [
    ...new Set(dashboardState.algo.rows.map((row) => row.country)),
  ].sort((left, right) => left.localeCompare(right));
  const [selectedCountries, setSelectedCountries] =
    useState<string[]>(availableCountries);

  if (!dashboardState.algo.available) {
    return (
      <Section title="Algo">
        <div className="rounded-[0.95rem] border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-sm text-stone-600">
          {dashboardState.algo.notes[0] ?? "Upload the monthly Equity Algo workbook to unlock the algo tab."}
        </div>
      </Section>
    );
  }

  const filteredRows = dashboardState.algo.rows.filter((row) =>
    selectedCountries.includes(row.country),
  );

  return (
    <div className="flex flex-col gap-4">
      <Section title="Algo Controls">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedCountries(availableCountries)}
              className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-stone-700 transition hover:bg-stone-100"
            >
              Include all
            </button>
            <button
              type="button"
              onClick={() => setSelectedCountries([])}
              className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-stone-700 transition hover:bg-stone-100"
            >
              Clear all
            </button>
          </div>

          <div className="grid gap-1.5 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
            {availableCountries.map((country) => (
              <label
                key={country}
                className="flex items-center gap-2 rounded-[0.8rem] border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-[11px] text-stone-700"
              >
                <input
                  type="checkbox"
                  checked={selectedCountries.includes(country)}
                  onChange={() =>
                    setSelectedCountries((current) =>
                      current.includes(country)
                        ? current.filter((item) => item !== country)
                        : [...current, country].sort((left, right) =>
                            left.localeCompare(right),
                          ),
                    )
                  }
                  className="h-3 w-3 rounded border-stone-300 text-stone-900"
                />
                <span className="truncate">{country}</span>
              </label>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Algo Time Series">
        <AlgoLineChart rows={filteredRows} />
      </Section>

      <Section title="Algo Raw Data (Last 12 Months)">
        <AlgoRawDataTable
          dateLabels={dashboardState.algo.trailingDateLabels}
          rows={filteredRows}
        />
      </Section>
    </div>
  );
}

function CountryPositionCard({
  title,
  rows,
  hasAlgo,
}: Readonly<{
  title: string;
  rows: AlgoCountryDisplayRow[];
  hasAlgo: boolean;
}>) {
  const maxAlgoSignal = Math.max(
    0,
    ...rows.map((row) => Math.abs(row.modelWeight ?? 0)),
  );
  const [algoThreshold, setAlgoThreshold] = useState(0);
  const filteredRows = rows.filter((row) =>
    !hasAlgo || maxAlgoSignal <= 0
      ? true
      : Math.abs(row.modelWeight ?? 0) >= algoThreshold,
  );

  return (
    <div className="rounded-[0.95rem] border border-stone-200 bg-stone-50/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-stone-500">
          {title}
        </h3>
        {hasAlgo ? (
          <div className="flex min-w-[15rem] items-center gap-3">
            <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-500">
              Algo Filter
            </label>
            <input
              type="range"
              min={0}
              max={maxAlgoSignal > 0 ? maxAlgoSignal : 1}
              step={0.1}
              value={algoThreshold}
              onChange={(event) => setAlgoThreshold(Number(event.target.value))}
              className="w-full accent-stone-900"
            />
            <span className="w-14 text-right text-[11px] font-semibold text-stone-700">
              {formatPercent(algoThreshold)}
            </span>
          </div>
        ) : null}
      </div>
      <div className="mt-3 overflow-hidden rounded-[0.85rem] border border-stone-200 bg-white">
        <div className="grid grid-cols-[minmax(0,1.6fr)_repeat(5,minmax(0,0.78fr))] gap-2 border-b border-stone-200 bg-stone-100 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-stone-500">
          <span>Country</span>
          <span className="text-right">Port</span>
          <span className="text-right">Bmk</span>
          <span className="text-right">Act Bmk</span>
          <span className="text-right">Algo</span>
          <span className="text-right">Act Algo</span>
        </div>
        <div className="grid">
        {filteredRows.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-[minmax(0,1.6fr)_repeat(5,minmax(0,0.78fr))] items-center gap-2 border-b border-stone-200 px-3 py-2 text-[11px] last:border-b-0 odd:bg-white even:bg-stone-50"
          >
              <p className="truncate font-semibold text-stone-900" title={row.label}>
                {row.label}
              </p>
              <span className="text-right text-stone-600">{formatPercent(row.portfolioWeight)}</span>
              <span className="text-right text-stone-600">{formatPercent(row.benchmarkWeight)}</span>
              <span
                className={`text-right font-semibold ${
                  (row.activeVsBenchmark ?? 0) >= 0 ? "text-emerald-700" : "text-rose-700"
                }`}
              >
                {formatPercent(row.activeVsBenchmark)}
              </span>
              <span className="text-right text-stone-600">
                {formatPercent(row.modelWeight)}
              </span>
              <span
                className={`text-right font-semibold ${
                  (row.activeVsModel ?? 0) >= 0 ? "text-emerald-700" : "text-rose-700"
                }`}
              >
                {formatPercent(row.activeVsModel)}
              </span>
            </div>
        ))}
        </div>
      </div>
    </div>
  );
}

function LookthroughTab({
  holdings,
  visibleColumns,
  visibleColumnKeys,
  sortKey,
  sortDirection,
  columnFilters,
  tableZoom,
  onSort,
  onFilterChange,
  onToggleColumnVisibility,
  onTableZoomChange,
  onExport,
  isExporting,
}: Readonly<{
  holdings: CanonicalHolding[];
  visibleColumns: LookthroughColumn[];
  visibleColumnKeys: LookthroughColumnKey[];
  sortKey: LookthroughColumnKey;
  sortDirection: SortDirection;
  columnFilters: Partial<Record<LookthroughColumnKey, string>>;
  tableZoom: TableZoom;
  onSort: (key: LookthroughColumnKey) => void;
  onFilterChange: (columnKey: LookthroughColumnKey, value: string) => void;
  onToggleColumnVisibility: (columnKey: LookthroughColumnKey) => void;
  onTableZoomChange: (zoom: TableZoom) => void;
  onExport: () => void;
  isExporting: boolean;
}>) {
  return (
    <section className="overflow-hidden rounded-[1rem] border border-stone-200 bg-white shadow-[0_10px_20px_rgba(59,47,33,0.05)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 bg-stone-50 px-3 py-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold uppercase tracking-[0.14em] text-stone-500">
            Columns
          </span>
          <details className="relative">
            <summary className="cursor-pointer rounded-full border border-stone-300 bg-white px-3 py-1.5 font-semibold text-stone-700">
              Hide / show columns
            </summary>
            <div className="absolute left-0 z-20 mt-2 flex max-h-[18rem] w-[17rem] flex-col gap-2 overflow-auto rounded-[0.9rem] border border-stone-200 bg-white p-3 shadow-[0_12px_24px_rgba(28,25,23,0.12)]">
              {lookthroughColumns.map((column) => (
                <label
                  key={column.key}
                  className="flex items-center gap-2 text-xs text-stone-700"
                >
                  <input
                    type="checkbox"
                    checked={visibleColumnKeys.includes(column.key)}
                    onChange={() => onToggleColumnVisibility(column.key)}
                    disabled={
                      visibleColumnKeys.length === 1 &&
                      visibleColumnKeys.includes(column.key)
                    }
                    className="h-3.5 w-3.5 rounded border-stone-300 text-stone-900"
                  />
                  <span>{column.label}</span>
                </label>
              ))}
            </div>
          </details>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold uppercase tracking-[0.14em] text-stone-500">
            Zoom
          </span>
          {tableZoomOptions.map((zoomOption) => (
            <button
              key={zoomOption}
              type="button"
              onClick={() => onTableZoomChange(zoomOption)}
              className={`rounded-full px-3 py-1.5 font-semibold transition ${
                tableZoom === zoomOption
                  ? "bg-stone-950 text-white"
                  : "border border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
              }`}
            >
              {zoomOption}%
            </button>
          ))}
          <button
            type="button"
            onClick={onExport}
            disabled={isExporting}
            className="rounded-full border border-stone-300 bg-white px-3 py-1.5 font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isExporting ? "Exporting..." : "Export to Excel"}
          </button>
        </div>
      </div>
      <div className="overflow-auto">
        <div style={{ zoom: tableZoom / 100 }}>
          <table className="min-w-max border-collapse bg-white text-[10px] leading-tight">
            <thead className="sticky top-0 z-10 bg-stone-950 text-white">
            <tr>
              {visibleColumns.map((column) => (
                <th
                  key={column.key}
                  className={`border-b border-r border-stone-800 px-1.5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.06em] ${
                    column.align === "right" ? "text-right" : "text-left"
                  } ${column.minWidth ?? ""}`}
                >
                  <button
                    type="button"
                    onClick={() => onSort(column.key)}
                    className={`flex w-full items-center gap-2 ${
                      column.align === "right" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <span>{column.label}</span>
                    <span className="text-[9px] text-stone-300">
                      {sortKey === column.key
                        ? sortDirection === "asc"
                          ? "ASC"
                          : "DESC"
                        : "--"}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
            <tr className="bg-stone-900">
              {visibleColumns.map((column) => (
                <th
                  key={`${column.key}-filter`}
                  className={`border-b border-r border-stone-800 px-1 py-1 ${
                    column.align === "right" ? "text-right" : "text-left"
                  }`}
                >
                  <input
                    type="text"
                    value={columnFilters[column.key] ?? ""}
                    onChange={(event) =>
                      onFilterChange(column.key, event.target.value)
                    }
                    placeholder="Filter"
                    className="w-full rounded-sm border border-stone-700 bg-stone-800 px-1.5 py-1 text-[9px] font-normal text-white outline-none placeholder:text-stone-400"
                  />
                </th>
              ))}
            </tr>
            </thead>
            <tbody>
              {holdings.map((holding, rowIndex) => (
                <tr
                  key={holding.canonicalId}
                  className={rowIndex % 2 === 0 ? "bg-white" : "bg-stone-50"}
                >
                  {visibleColumns.map((column) => (
                    <td
                      key={`${holding.canonicalId}-${column.key}`}
                      className={`border-b border-r border-stone-200 px-1.5 py-1 align-top text-stone-700 ${
                        column.align === "right" ? "text-right" : "text-left"
                      } ${column.minWidth ?? ""}`}
                    >
                      {column.render(holding)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Section({
  title,
  children,
}: Readonly<{
  title: string;
  children: ReactNode;
}>) {
  return (
    <section className="rounded-[1rem] border border-stone-200/80 bg-white/92 p-5 shadow-[0_10px_20px_rgba(59,47,33,0.05)] md:p-6">
      <h2 className="mb-4 font-serif text-[1.35rem] tracking-[-0.03em] text-stone-950 md:text-[1.55rem]">
        {title}
      </h2>
      {children}
    </section>
  );
}

function ToastBanner({
  message,
  tone,
  className,
}: Readonly<{
  message?: string;
  tone: "neutral" | "success" | "error";
  className?: string;
}>) {
  if (!message) {
    return null;
  }

  const toneClasses =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-950"
      : tone === "error"
        ? "border-rose-200 bg-rose-50 text-rose-950"
        : "border-amber-200 bg-amber-50 text-amber-950";

  return (
    <div
      className={`fixed right-4 z-50 max-w-[32rem] rounded-[0.95rem] border px-4 py-3 text-sm font-medium shadow-[0_12px_28px_rgba(28,25,23,0.12)] ${toneClasses} ${className ?? ""}`}
    >
      {message}
    </div>
  );
}

function TopStat({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="min-w-[7rem]">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-200/80">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function KeyValueTable({
  rows,
}: Readonly<{
  rows: Array<{ label: string; value: string }>;
}>) {
  return (
    <div className="overflow-x-auto rounded-[0.9rem] border border-stone-200">
      <table className="min-w-full border-collapse bg-white text-sm">
        <thead className="bg-stone-100 text-stone-700">
          <tr>
            <th className="border-b border-stone-200 px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em]">
              Item
            </th>
            <th className="border-b border-stone-200 px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.14em]">
              Value
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr
              key={row.label}
              className={rowIndex % 2 === 0 ? "bg-white" : "bg-stone-50"}
            >
              <td className="border-b border-stone-200 px-4 py-3 font-medium text-stone-950">
                {row.label}
              </td>
              <td className="border-b border-stone-200 px-4 py-3 text-right text-stone-700">
                {row.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SnapshotCard({
  title,
  rows,
}: Readonly<{
  title: string;
  rows: Array<{ label: string; value: string }>;
}>) {
  return (
    <div className="rounded-[0.95rem] border border-stone-200 bg-stone-50/70 p-4">
      <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-stone-500">
        {title}
      </h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className="rounded-[0.85rem] bg-white px-3 py-2.5 shadow-sm">
            <p className="text-[11px] uppercase tracking-[0.1em] text-stone-500">
              {row.label}
            </p>
            <p className="mt-1 text-base font-semibold text-stone-950">{row.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function CompactExposureCard({
  title,
  rows,
  columnCountClassName,
}: Readonly<{
  title: string;
  rows: ExposureRow[];
  columnCountClassName?: string;
}>) {
  return (
    <div className="rounded-[0.95rem] border border-stone-200 bg-stone-50/70 p-4">
      <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-stone-500">
        {title}
      </h3>
      <div className={`mt-3 grid gap-2 ${columnCountClassName ?? "md:grid-cols-2 xl:grid-cols-3"}`}>
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,0.7fr))] items-center gap-2 rounded-[0.8rem] bg-white px-3 py-2 text-[11px] shadow-sm"
          >
            <p className="truncate font-semibold text-stone-900" title={row.label}>
              {row.label}
            </p>
            <span className="text-right text-stone-600">{formatPercent(row.portfolioWeight)}</span>
            <span className="text-right text-stone-600">{formatPercent(row.benchmarkWeight)}</span>
            <span
              className={`text-right font-semibold ${
                (row.activeVsBenchmark ?? 0) >= 0 ? "text-emerald-700" : "text-rose-700"
              }`}
            >
              {formatPercent(row.activeVsBenchmark)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ComparisonBar({
  label,
  value,
  maxValue,
  tone,
}: Readonly<{
  label: string;
  value: number;
  maxValue: number;
  tone: "amber" | "slate";
}>) {
  const width = maxValue > 0 ? (value / maxValue) * 100 : 0;
  const barTone = tone === "amber" ? "bg-amber-400" : "bg-slate-500";

  return (
    <div className="flex items-center gap-2">
      <span className="w-14 text-[10px] uppercase tracking-[0.08em] text-stone-500">
        {label}
      </span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-stone-200">
        <div
          className={`h-full rounded-full ${barTone}`}
          style={{ width: `${Math.max(0, Math.min(width, 100))}%` }}
        />
      </div>
    </div>
  );
}

function DistributionComparisonCard({
  title,
  rows,
}: Readonly<{
  title: string;
  rows: ComparisonDistributionRow[];
}>) {
  return (
    <div className="rounded-[0.95rem] border border-stone-200 bg-stone-50/70 p-4">
      <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-stone-500">
        {title}
      </h3>
      <div className="mt-3 flex flex-col gap-2">
        {rows.map((row) => (
          <div key={row.label} className="rounded-[0.85rem] bg-white px-3 py-2.5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-stone-900">{row.label}</p>
              <div className="text-right text-[11px] text-stone-500">
                <div>P {formatPercent(row.portfolioWeight)}</div>
                <div>B {formatPercent(row.benchmarkWeight)}</div>
              </div>
            </div>
            <div className="mt-2 space-y-1.5">
              <ComparisonBar
                label="Portfolio"
                value={row.portfolioWeight}
                maxValue={100}
                tone="amber"
              />
              <ComparisonBar
                label="Benchmark"
                value={row.benchmarkWeight}
                maxValue={100}
                tone="slate"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const algoChartPalette = [
  "#2563eb",
  "#dc2626",
  "#0f766e",
  "#7c3aed",
  "#d97706",
  "#059669",
  "#be123c",
  "#1d4ed8",
  "#7c2d12",
  "#4338ca",
];

function AlgoLineChart({
  rows,
}: Readonly<{
  rows: AlgoCountrySeries[];
}>) {
  const [hoveredPoint, setHoveredPoint] = useState<AlgoHoverPoint>();

  if (rows.length === 0) {
    return (
      <div className="rounded-[0.95rem] border border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-sm text-stone-600">
        Select at least one country to see the algo time series.
      </div>
    );
  }

  const width = 860;
  const height = 280;
  const padding = { top: 18, right: 12, bottom: 34, left: 46 };
  const values = rows.flatMap((row) =>
    row.points.map((point) => point.value).filter((value): value is number => value != null),
  );
  const minValue = values.length > 0 ? Math.min(0, ...values) : -1;
  const maxValue = values.length > 0 ? Math.max(0, ...values) : 1;
  const yRange = maxValue - minValue || 1;
  const pointCount = rows[0]?.points.length ?? 0;
  const xSpan = width - padding.left - padding.right;
  const ySpan = height - padding.top - padding.bottom;
  const zeroY = padding.top + ((maxValue - 0) / yRange) * ySpan;

  const xForIndex = (index: number) =>
    padding.left + (pointCount <= 1 ? 0 : (index / (pointCount - 1)) * xSpan);
  const yForValue = (value: number) => padding.top + ((maxValue - value) / yRange) * ySpan;

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-[0.95rem] border border-stone-200 bg-white p-3">
        <div className="relative w-full" onMouseLeave={() => setHoveredPoint(undefined)}>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="block h-auto w-full max-w-full"
            role="img"
            aria-label="Algo time series chart"
          >
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={zeroY}
              y2={zeroY}
              stroke="#d6d3d1"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
            {rows[0]?.points.map((point, index) => (
              <g key={point.dateKey}>
                <line
                  x1={xForIndex(index)}
                  x2={xForIndex(index)}
                  y1={padding.top}
                  y2={height - padding.bottom}
                  stroke="#f1f5f9"
                  strokeWidth="1"
                />
                <text
                  x={xForIndex(index)}
                  y={height - 18}
                  textAnchor="middle"
                  fontSize="9"
                  fill="#57534e"
                >
                  {point.dateLabel}
                </text>
              </g>
            ))}

            {rows.map((row, rowIndex) => {
              const color = algoChartPalette[rowIndex % algoChartPalette.length];
              const isHoveredCountry = hoveredPoint?.country === row.country;
              const segments = row.points
                .map((point, pointIndex) =>
                  point.value == null
                    ? undefined
                    : `${pointIndex === 0 ? "M" : "L"} ${xForIndex(pointIndex)} ${yForValue(point.value)}`,
                )
                .filter(Boolean)
                .join(" ");

              return (
                <g key={`${row.identifier}-${row.countryCode}-${rowIndex}`}>
                  <path
                    d={segments}
                    fill="none"
                    stroke={color}
                    strokeWidth={isHoveredCountry ? "3" : "2.1"}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    strokeOpacity={hoveredPoint && !isHoveredCountry ? 0.35 : 1}
                  />
                  {row.points.map((point, pointIndex) => {
                    if (point.value == null) {
                      return null;
                    }

                    const pointX = xForIndex(pointIndex);
                    const pointY = yForValue(point.value);
                    const isHovered =
                      hoveredPoint?.country === row.country &&
                      hoveredPoint?.dateLabel === point.dateLabel;

                    return (
                      <g key={`${row.identifier}-${row.countryCode}-${point.dateKey}-${pointIndex}`}>
                        <circle
                          cx={pointX}
                          cy={pointY}
                          r={isHovered ? "5" : "3.8"}
                          fill={color}
                          stroke="#ffffff"
                          strokeWidth="1"
                          opacity={hoveredPoint && !isHoveredCountry ? 0.45 : 1}
                        />
                        <circle
                          cx={pointX}
                          cy={pointY}
                          r="10"
                          fill="transparent"
                          onMouseEnter={() =>
                            setHoveredPoint({
                              country: row.country,
                              dateLabel: point.dateLabel,
                              value: point.value ?? 0,
                              color,
                              x: pointX,
                              y: pointY,
                            })
                          }
                          onMouseMove={() =>
                            setHoveredPoint({
                              country: row.country,
                              dateLabel: point.dateLabel,
                              value: point.value ?? 0,
                              color,
                              x: pointX,
                              y: pointY,
                            })
                          }
                        >
                          <title>{`${row.country} | ${point.dateLabel} | ${formatAlgoNumber(point.value)}`}</title>
                        </circle>
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </svg>

          {hoveredPoint ? (
            <div
              className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-[120%] rounded-[0.8rem] border border-stone-200 bg-white/95 px-3 py-2 text-xs shadow-[0_12px_24px_rgba(28,25,23,0.18)]"
              style={{
                left: `${hoveredPoint.x}px`,
                top: `${hoveredPoint.y}px`,
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: hoveredPoint.color }}
                />
                <span className="font-semibold text-stone-900">{hoveredPoint.country}</span>
              </div>
              <div className="mt-1 text-stone-500">{hoveredPoint.dateLabel}</div>
              <div className="mt-0.5 font-semibold text-stone-900">
                {formatAlgoNumber(hoveredPoint.value)}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        {rows.map((row, rowIndex) => (
          <div
            key={`${row.identifier}-${row.countryCode}-${rowIndex}-legend`}
            className="flex items-center justify-between rounded-[0.8rem] border border-stone-200 bg-white px-2.5 py-1.5 text-[11px] text-stone-700"
          >
            <div className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: algoChartPalette[rowIndex % algoChartPalette.length] }}
              />
              <span className="truncate font-semibold">{row.country}</span>
            </div>
            <span className="text-stone-500">{formatAlgoNumber(row.latestValue)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AlgoRawDataTable({
  dateLabels,
  rows,
}: Readonly<{
  dateLabels: string[];
  rows: AlgoCountrySeries[];
}>) {
  if (rows.length === 0) {
    return (
      <div className="rounded-[0.95rem] border border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-sm text-stone-600">
        Select at least one country to see the raw algo data.
      </div>
    );
  }

  return (
    <div className="overflow-auto rounded-[0.95rem] border border-stone-200 bg-white">
      <table className="min-w-full border-collapse text-[10px] leading-tight">
        <thead className="sticky top-0 z-10 bg-stone-950 text-white">
          <tr>
            <th className="border-b border-r border-stone-800 px-2 py-1.5 text-left font-semibold uppercase tracking-[0.06em]">
              Country
            </th>
            <th className="border-b border-r border-stone-800 px-2 py-1.5 text-left font-semibold uppercase tracking-[0.06em]">
              Identifier
            </th>
            {dateLabels.map((label) => (
              <th
                key={label}
                className="border-b border-r border-stone-800 px-2 py-1.5 text-right font-semibold uppercase tracking-[0.06em]"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr
              key={`${row.identifier}-${row.countryCode}-${rowIndex}`}
              className={rowIndex % 2 === 0 ? "bg-white" : "bg-stone-50"}
            >
              <td className="border-b border-r border-stone-200 px-2 py-1.5 font-semibold text-stone-900">
                {row.country}
              </td>
              <td className="border-b border-r border-stone-200 px-2 py-1.5 text-stone-600">
                {row.identifier}
              </td>
              {row.points.map((point) => (
                <td
                  key={`${row.identifier}-${point.dateKey}`}
                  className={`border-b border-r border-stone-200 px-2 py-1.5 text-right ${
                    (point.value ?? 0) >= 0 ? "text-sky-800" : "text-rose-800"
                  }`}
                >
                  {formatAlgoNumber(point.value)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AttributionCard({
  title,
  rows,
}: Readonly<{
  title: string;
  rows: AttributionRow[];
}>) {
  const maxAbsolute = Math.max(0.01, ...rows.map((row) => Math.abs(row.value)));

  return (
    <div className="rounded-[0.95rem] border border-stone-200 bg-stone-50/70 p-4">
      <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-stone-500">
        {title}
      </h3>
      <div className="mt-3 flex flex-col gap-2">
        {rows.length === 0 ? (
          <div className="rounded-[0.85rem] bg-white px-3 py-3 text-sm text-stone-500 shadow-sm">
            No API return attribution values were available for this view.
          </div>
        ) : (
          rows.map((row) => (
            <div key={row.label} className="rounded-[0.85rem] bg-white px-3 py-2.5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="max-w-[65%] text-sm font-semibold text-stone-900">
                  {row.label}
                </p>
                <span
                  className={`text-sm font-semibold ${
                    row.value >= 0 ? "text-emerald-700" : "text-rose-700"
                  }`}
                >
                  {formatPercent(row.value)}
                </span>
              </div>
              <p className="mt-1.5 text-[11px] text-stone-500">
                API return {formatPercent(row.apiReturn)} | Portfolio{" "}
                {formatPercent(row.portfolioContribution)} | Benchmark{" "}
                {formatPercent(row.benchmarkContribution)}
              </p>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-stone-200">
                <div
                  className={`h-full rounded-full ${
                    row.value >= 0 ? "bg-emerald-500" : "bg-rose-500"
                  }`}
                  style={{
                    width: `${Math.max(
                      6,
                      Math.min((Math.abs(row.value) / maxAbsolute) * 100, 100),
                    )}%`,
                  }}
                />
              </div>
            </div>
          ))
        )}
      </div>
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
      className={`rounded-full px-5 py-2.5 text-sm font-semibold transition ${
        isActive
          ? "bg-stone-950 text-white shadow-[0_10px_18px_rgba(28,25,23,0.15)]"
          : "bg-stone-100 text-stone-700 hover:bg-stone-200"
      }`}
    >
      {label}
    </button>
  );
}

function buildWeightedMetricsSnapshot(
  holdings: CanonicalHolding[],
  getWeight: (holding: CanonicalHolding) => number | undefined,
): WeightedMetricsSnapshot {
  const totalWeight = holdings.reduce((sum, holding) => sum + (getWeight(holding) ?? 0), 0);

  return {
    totalWeight,
    weightedPriceToFairValue: weightedAverage(holdings, getWeight, "priceToFairValue"),
    weightedForwardPE: weightedAverage(holdings, getWeight, "forwardPE"),
    weightedPriceToBook: weightedAverage(holdings, getWeight, "priceToBook"),
    weightedRoe: weightedAverage(holdings, getWeight, "roe"),
    weightedUpsideToFairValue: weightedAverage(
      holdings,
      getWeight,
      "upsideToFairValue",
    ),
  };
}

function weightedAverage(
  holdings: CanonicalHolding[],
  getWeight: (holding: CanonicalHolding) => number | undefined,
  metric:
    | "priceToFairValue"
    | "forwardPE"
    | "priceToBook"
    | "roe"
    | "upsideToFairValue",
) {
  let weightedSum = 0;
  let denominator = 0;

  for (const holding of holdings) {
    const weight = getWeight(holding) ?? 0;
    const value = holding[metric];

    if (value == null || weight <= 0) {
      continue;
    }

    weightedSum += value * weight;
    denominator += weight;
  }

  if (denominator === 0) {
    return undefined;
  }

  return weightedSum / denominator;
}

function buildCategoryComparisonRows(
  holdings: CanonicalHolding[],
  accessor: (holding: CanonicalHolding) => string | undefined,
): ComparisonDistributionRow[] {
  const grouped = new Map<string, ComparisonDistributionRow>();

  for (const holding of holdings) {
    const label = accessor(holding) ?? "Unknown";
    const existing = grouped.get(label) ?? {
      label,
      portfolioWeight: 0,
      benchmarkWeight: 0,
    };
    existing.portfolioWeight += holding.targetWeight ?? 0;
    existing.benchmarkWeight += holding.benchmarkWeight ?? 0;
    grouped.set(label, existing);
  }

  return [...grouped.values()]
    .sort((left, right) => right.portfolioWeight - left.portfolioWeight)
    .slice(0, 6);
}

function buildQualityDistributionRows(
  holdings: CanonicalHolding[],
): ComparisonDistributionRow[] {
  return buildCategoryComparisonRows(holdings, (holding) => {
    const roe = holding.roe;
    if (roe == null || Number.isNaN(roe)) {
      return "Unknown";
    }

    if (roe >= 20) {
      return "ROE 20%+";
    }
    if (roe >= 15) {
      return "ROE 15-20%";
    }
    if (roe >= 10) {
      return "ROE 10-15%";
    }
    if (roe >= 0) {
      return "ROE 0-10%";
    }

    return "ROE < 0%";
  });
}

function buildCountryRowsWithAlgo(
  rows: ExposureRow[],
  algoRows: AlgoCountrySeries[],
): AlgoCountryDisplayRow[] {
  const latestSignals = new Map(
    algoRows
      .filter((row) => row.latestValue != null)
      .map((row) => [row.country, row.latestValue] as const),
  );

  return rows.map((row) => {
    const algoWeight = latestSignals.get(row.label);

    return {
      ...row,
      modelWeight: algoWeight,
      activeVsModel:
        algoWeight == null ? undefined : row.portfolioWeight - algoWeight,
    };
  });
}

function buildAttributionRows(
  holdings: CanonicalHolding[],
  period: AttributionPeriod,
) {
  const resolveApiReturn = (holding: CanonicalHolding) => {
    if (period === "MTD") {
      return holding.apiReturnMtd;
    }

    if (period === "YTD") {
      return holding.apiReturnYtd;
    }

    if (period === "1M") {
      return holding.apiReturn1M;
    }

    return holding.apiReturn1Y;
  };

  return holdings
    .filter((holding) => {
      const apiReturn = resolveApiReturn(holding);
      if (apiReturn == null || Number.isNaN(apiReturn)) {
        return false;
      }

      const portfolioContribution = ((holding.targetWeight ?? 0) * apiReturn) / 100;
      const benchmarkContribution = ((holding.benchmarkWeight ?? 0) * apiReturn) / 100;
      const activeAttribution = portfolioContribution - benchmarkContribution;
      return Math.abs(activeAttribution) > 0.0001;
    })
    .sort(
      (left, right) =>
        Math.abs(
          (((right.targetWeight ?? 0) - (right.benchmarkWeight ?? 0)) *
            (resolveApiReturn(right) ?? 0)) /
            100,
        ) -
        Math.abs(
          (((left.targetWeight ?? 0) - (left.benchmarkWeight ?? 0)) *
            (resolveApiReturn(left) ?? 0)) /
            100,
        ),
    )
    .map((holding) => {
      const apiReturn = resolveApiReturn(holding) ?? 0;
      const portfolioContribution = ((holding.targetWeight ?? 0) * apiReturn) / 100;
      const benchmarkContribution = ((holding.benchmarkWeight ?? 0) * apiReturn) / 100;

      return {
        label: holding.securityName,
        value: portfolioContribution - benchmarkContribution,
        portfolioContribution,
        benchmarkContribution,
        apiReturn,
      };
    });
}

function buildSummaryUniverseRows(holdings: CanonicalHolding[]) {
  const merged = new Map<string, CanonicalHolding>();

  for (const holding of holdings) {
    const key = normalizeSummaryKey(holding);
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, { ...holding });
      continue;
    }

    existing.targetWeight = (existing.targetWeight ?? 0) + (holding.targetWeight ?? 0);
    existing.benchmarkWeight = Math.max(
      existing.benchmarkWeight ?? 0,
      holding.benchmarkWeight ?? 0,
    );
    existing.activeWeightVsBenchmark =
      (existing.targetWeight ?? 0) - (existing.benchmarkWeight ?? 0);
    existing.priceToFairValue = existing.priceToFairValue ?? holding.priceToFairValue;
    existing.forwardPE = existing.forwardPE ?? holding.forwardPE;
    existing.priceToBook = existing.priceToBook ?? holding.priceToBook;
    existing.roe = existing.roe ?? holding.roe;
    existing.moat = existing.moat ?? holding.moat;
    existing.uncertainty = existing.uncertainty ?? holding.uncertainty;
    existing.country = existing.country ?? holding.country;
    existing.sector = existing.sector ?? holding.sector;
    existing.apiReturn1M = existing.apiReturn1M ?? holding.apiReturn1M;
    existing.apiReturnMtd = existing.apiReturnMtd ?? holding.apiReturnMtd;
    existing.apiReturnYtd = existing.apiReturnYtd ?? holding.apiReturnYtd;
    existing.apiReturn1Y = existing.apiReturn1Y ?? holding.apiReturn1Y;
  }

  return [...merged.values()];
}

function normalizeSummaryKey(holding: CanonicalHolding) {
  return [
    holding.secid?.trim().toLowerCase(),
    holding.isin?.trim().toLowerCase(),
    holding.securityName.trim().toLowerCase(),
  ]
    .filter(Boolean)
    .join("__");
}


function stringifyForFilter(value: string | number | undefined | null) {
  if (value == null) {
    return "";
  }

  if (typeof value === "number") {
    return value.toString().toLowerCase();
  }

  return value.toLowerCase();
}

function normalizeSortValue(value: string | number | undefined | null) {
  if (value == null || value === "") {
    return undefined;
  }

  return value;
}

function formatUpside(value?: number) {
  if (value == null || Number.isNaN(value)) {
    return "n/a";
  }

  return `${(value * 100).toFixed(1)}%`;
}

function renderWeightCell(value?: number) {
  if (value == null || Number.isNaN(value)) {
    return "n/a";
  }

  const isZeroWeight = Math.abs(value) < 0.00001;

  return (
    <span
      className={`inline-block min-w-[4rem] rounded-sm px-1.5 py-1 text-right font-semibold ${
        isZeroWeight ? "bg-rose-50 text-rose-700" : "text-stone-700"
      }`}
    >
      {formatPercent(value)}
    </span>
  );
}

function renderUpsideCell(value?: number) {
  if (value == null || Number.isNaN(value)) {
    return "n/a";
  }

  const toneClass =
    value >= 0.3
      ? "bg-sky-100 text-sky-900"
      : value >= 0.1
        ? "bg-sky-50 text-sky-800"
        : value >= 0
          ? "bg-slate-50 text-slate-800"
          : value <= -0.1
            ? "bg-rose-100 text-rose-900"
            : "bg-rose-50 text-rose-800";

  return (
    <span className={`inline-block min-w-[4.75rem] rounded-sm px-1.5 py-1 text-right font-semibold ${toneClass}`}>
      {formatUpside(value)}
    </span>
  );
}

function formatRoeCell(value?: number) {
  if (value == null || Number.isNaN(value)) {
    return "n/a";
  }

  const normalized = Math.abs(value) > 1 ? value / 100 : value;
  return normalized.toFixed(2);
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

function formatAlgoNumber(value?: number) {
  if (value == null || Number.isNaN(value)) {
    return "n/a";
  }

  return `${value.toFixed(2)}%`;
}

function exportColumnWidth(column: LookthroughColumn) {
  switch (column.key) {
    case "securityName":
      return 34;
    case "isin":
      return 16;
    case "country":
      return 14;
    case "sector":
      return 18;
    case "targetWeight":
    case "benchmarkWeight":
      return 14;
    case "priceToFairValue":
    case "upsideToFairValue":
    case "forwardPE":
    case "priceToBook":
    case "roe":
      return 12;
    case "moat":
      return 14;
    case "uncertainty":
      return 20;
    default:
      return 14;
  }
}
