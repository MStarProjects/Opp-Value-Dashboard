import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

import XLSX from "xlsx";

const repoRoot = process.cwd();
const dataDir = path.join(repoRoot, "data", "raw");
const pmhubFile = path.join(dataDir, "pmhub-report_intl_opp value_42026.xlsx");
const benchmarkDataFile = path.join(repoRoot, "outputs", "benchmark-audit", "benchmark_audit_data.json");
const sessionFile = path.join(repoRoot, ".morningstar-session.json");
const envFile = path.join(repoRoot, ".env.local");
const bridgeScript = path.join(repoRoot, "scripts", "morningstar_sdk_bridge.py");
const benchmarkMetricsScript = path.join(repoRoot, "scripts", "export_full_benchmark_metrics.py");
const outputDir = path.join(repoRoot, "outputs", "benchmark-audit");
const outputJson = path.join(outputDir, "full_join_audit_data.json");

const SHEET_NAME = "Sheet A";
const HEADER_ROW_INDEX = 0;
const DATA_START_ROW_INDEX = 2;

function asString(value) {
  if (value == null) {
    return undefined;
  }

  const normalized = String(value).trim();
  return normalized || undefined;
}

function asNumber(value) {
  if (value == null || value === "") {
    return undefined;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  const normalized = Number(String(value).replaceAll(",", "").replace("%", ""));
  return Number.isFinite(normalized) ? normalized : undefined;
}

function normalizeIdentifier(value) {
  return asString(value)?.toLowerCase();
}

function buildCanonicalId(row, fallback) {
  return [
    normalizeIdentifier(row.ISIN),
    normalizeIdentifier(row.Ticker),
    normalizeIdentifier(row["Security Name"]),
    fallback,
  ]
    .filter(Boolean)
    .join("__");
}

function sanitizeJson(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeJson);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, sanitizeJson(child)]),
    );
  }

  if (typeof value === "number" && !Number.isFinite(value)) {
    return null;
  }

  return value;
}

function loadPmhubRows() {
  const workbook = XLSX.readFile(pmhubFile, { cellDates: false });
  const sheet = workbook.Sheets[SHEET_NAME];
  if (!sheet) {
    throw new Error(`Unable to find ${SHEET_NAME} in ${pmhubFile}.`);
  }

  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false,
  });

  const headers = rows[HEADER_ROW_INDEX].map((value, index) => asString(value) ?? `Column ${index + 1}`);
  return rows
    .slice(DATA_START_ROW_INDEX)
    .map((values, index) => {
      const row = Object.fromEntries(headers.map((header, headerIndex) => [header, values[headerIndex] ?? null]));
      const sourceRowIndex = DATA_START_ROW_INDEX + index + 1;
      row.__rowIndex = sourceRowIndex;
      row.__canonicalId = buildCanonicalId(row, `pmhub-${sourceRowIndex}`);
      return row;
    })
    .filter((row) =>
      Boolean(
        asString(row["Security Name"]) ||
          asString(row.ISIN) ||
          asString(row.Ticker) ||
          asNumber(row.Weight) != null,
      ),
    )
    .filter((row) => (asNumber(row.Weight) ?? 0) > 0);
}

async function loadToken() {
  try {
    const envText = await fs.readFile(envFile, "utf8");
    for (const line of envText.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        continue;
      }

      const [key, ...valueParts] = trimmed.split("=");
      if (key.trim() === "MD_AUTH_TOKEN") {
        return asString(valueParts.join("="));
      }
    }
  } catch {
    // Ignore missing env file.
  }

  try {
    const payload = JSON.parse(await fs.readFile(sessionFile, "utf8"));
    return asString(payload.token ?? payload.accessToken);
  } catch {
    return undefined;
  }
}

function runPython({ args = [], stdin = "", token }) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    for (const key of [
      "HTTP_PROXY",
      "HTTPS_PROXY",
      "ALL_PROXY",
      "http_proxy",
      "https_proxy",
      "all_proxy",
      "GIT_HTTP_PROXY",
      "GIT_HTTPS_PROXY",
    ]) {
      delete env[key];
    }

    if (token) {
      env.MD_AUTH_TOKEN = token;
    }

    const child = spawn("python", args, {
      cwd: repoRoot,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Python command failed with exit code ${code}.`));
        return;
      }
      resolve(stdout);
    });

    if (stdin) {
      child.stdin.write(stdin);
    }
    child.stdin.end();
  });
}

async function runBridge(portfolioRows, token) {
  const payload = {
    benchmarkInvestmentId: "MGXTMENU",
    directDataSetIdOrName: "Global xUS Opp Value",
    holdings: portfolioRows.map((row) => ({
      canonicalId: row.__canonicalId,
      securityName: asString(row["Security Name"]),
      isin: asString(row.ISIN),
      cusip: asString(row.CUSIP),
      sedol: asString(row.SEDOL),
      ticker: asString(row.Ticker),
    })),
  };

  const stdout = await runPython({
    args: [bridgeScript],
    stdin: JSON.stringify(payload),
    token,
  });

  return JSON.parse(stdout);
}

function buildNote(record) {
  if (record.isCashLike) {
    return "Cash or currency row";
  }

  switch (record.benchmarkMatchMethod) {
    case "benchmark_exact_isin":
      return "Connected by exact ISIN";
    case "benchmark_exact_cusip":
      return "Connected by exact CUSIP";
    case "benchmark_equivalent_name":
      return "Connected by equivalent local/ADR name";
    case "off_benchmark":
      return "Portfolio security not found in benchmark";
    default:
      return "";
  }
}

async function main() {
  const portfolioRows = loadPmhubRows();
  const token = await loadToken();
  await runPython({
    args: [benchmarkMetricsScript],
    token,
  });
  const benchmarkPayload = JSON.parse(await fs.readFile(benchmarkDataFile, "utf8"));
  const benchmarkRows = benchmarkPayload.benchmarkMetricRows ?? [];
  const bridgeOutput = await runBridge(portfolioRows, token);
  const bridgeRecords = new Map(
    (bridgeOutput.records ?? []).map((record) => [record.identifier?.canonicalId, record]),
  );

  const benchmarkBySecId = new Map(
    benchmarkRows
      .filter((row) => asString(row.SecId))
      .map((row) => [asString(row.SecId), row]),
  );
  const benchmarkByIsin = new Map(
    benchmarkRows
      .filter((row) => asString(row.ISIN))
      .map((row) => [asString(row.ISIN), row]),
  );

  const matchedBenchmarkSecIds = new Set();
  const fullJoinRows = [];
  const portfolioOnlyRows = [];

  for (const portfolioRow of portfolioRows) {
    const record = bridgeRecords.get(portfolioRow.__canonicalId) ?? {};
    const matchedBenchmark = record.matchedBenchmark ?? {};
    const matchedBenchmarkRow =
      (asString(matchedBenchmark.secId) && benchmarkBySecId.get(asString(matchedBenchmark.secId))) ||
      (asString(matchedBenchmark.isin) && benchmarkByIsin.get(asString(matchedBenchmark.isin))) ||
      null;

    if (matchedBenchmarkRow && asString(matchedBenchmarkRow.SecId)) {
      matchedBenchmarkSecIds.add(asString(matchedBenchmarkRow.SecId));
    }

    const portfolioWeight = asNumber(portfolioRow.Weight) ?? 0;
    const benchmarkWeight =
      asNumber(record.benchmarkWeight) ??
      asNumber(matchedBenchmarkRow?.["Benchmark Weight"]) ??
      (record.benchmarkMatchMethod === "off_benchmark" || record.isCashLike ? 0 : undefined);

    const status =
      record.benchmarkMatchMethod === "benchmark_exact_isin" ||
      record.benchmarkMatchMethod === "benchmark_exact_cusip" ||
      record.benchmarkMatchMethod === "benchmark_equivalent_name"
        ? "Both"
        : "Portfolio Only";

    const joinedRow = {
      Status: status,
      "Match Method": record.benchmarkMatchMethod ?? null,
      Note: buildNote(record),
      "Portfolio Row": portfolioRow.__rowIndex,
      "Portfolio Name": portfolioRow["Security Name"] ?? null,
      "Portfolio Ticker": portfolioRow.Ticker ?? null,
      "Portfolio ISIN": portfolioRow.ISIN ?? null,
      "Portfolio CUSIP": portfolioRow.CUSIP ?? null,
      "Portfolio Weight": portfolioWeight,
      "Benchmark Name": matchedBenchmarkRow?.Name ?? matchedBenchmark.name ?? null,
      "Benchmark SecId": matchedBenchmarkRow?.SecId ?? matchedBenchmark.secId ?? null,
      "Benchmark ISIN": matchedBenchmarkRow?.ISIN ?? matchedBenchmark.isin ?? null,
      "Benchmark Weight": benchmarkWeight ?? null,
      "Active Weight":
        benchmarkWeight != null ? portfolioWeight - benchmarkWeight : portfolioWeight,
      "Metric P/FV": asNumber(record.priceToFairValue) ?? null,
      "Metric Moat": record.moat ?? null,
      "Metric Uncertainty": record.uncertainty ?? null,
      "Metric Sector": record.sector ?? matchedBenchmarkRow?.Sector ?? null,
      "Metric Business Country": record.country ?? matchedBenchmarkRow?.["Business Country"] ?? null,
      "Metric ROE": asNumber(record.roe) ?? null,
      "Metric Forward P/E": asNumber(record.forwardPE) ?? null,
      "PFV Override SecId": record.pfvOverrideSecId ?? matchedBenchmarkRow?.["PFV/PE Override SecId"] ?? null,
      "Forward P/E Override SecId": record.forwardPEOverrideSecId ?? matchedBenchmarkRow?.["PFV/PE Override SecId"] ?? null,
      "Metric Price / Book": asNumber(record.priceToBook) ?? null,
      "Portfolio Workbook ROE": asNumber(portfolioRow.ROE) ?? null,
      "Portfolio Workbook PE FY1": asNumber(portfolioRow["PE FY1"]) ?? null,
      "Portfolio Workbook Price/Bk": asNumber(portfolioRow["Price/Bk"]) ?? null,
      "Portfolio Country Code": portfolioRow["Country Code"] ?? null,
      "Currency Contrib": asNumber(portfolioRow["Currency Contrib"]) ?? null,
      Currency: portfolioRow.Currency ?? null,
      "Contribution to Return - MTD": asNumber(portfolioRow["Contribution to Return - MTD"]) ?? null,
      "Contribution to Return - YTD": asNumber(portfolioRow["Contribution to Return - YTD"]) ?? null,
      "Contribution to Return - 1 Mo": asNumber(portfolioRow["Contribution to Return - 1 Mo"]) ?? null,
      "Is Cash Like": record.isCashLike ?? null,
    };

    fullJoinRows.push(joinedRow);
    if (status === "Portfolio Only") {
      portfolioOnlyRows.push(joinedRow);
    }
  }

  const benchmarkOnlyRows = benchmarkRows
    .filter((row) => !matchedBenchmarkSecIds.has(asString(row.SecId)))
    .map((row) => ({
      Status: "Benchmark Only",
      "Match Method": "benchmark_only",
      Note: "Benchmark constituent not held in portfolio",
      "Portfolio Row": null,
      "Portfolio Name": null,
      "Portfolio Ticker": null,
      "Portfolio ISIN": null,
      "Portfolio CUSIP": null,
      "Portfolio Weight": 0,
      "Benchmark Name": row.Name ?? null,
      "Benchmark SecId": row.SecId ?? null,
      "Benchmark ISIN": row.ISIN ?? null,
      "Benchmark Weight": asNumber(row["Benchmark Weight"]) ?? null,
      "Active Weight": asNumber(row["Benchmark Weight"]) != null ? -asNumber(row["Benchmark Weight"]) : null,
      "Metric P/FV": asNumber(row["Price To Fair Value"]) ?? null,
      "Metric Moat": row["Economic Moat"] ?? null,
      "Metric Uncertainty": row["Fair Value Uncertainty"] ?? null,
      "Metric Sector": row.Sector ?? null,
      "Metric Business Country": row["Business Country"] ?? null,
      "Metric ROE": asNumber(row["Return On Equity"]) ?? null,
      "Metric Forward P/E": asNumber(row["Forward P/E"]) ?? null,
      "PFV Override SecId": row["PFV/PE Override SecId"] ?? null,
      "Forward P/E Override SecId": row["PFV/PE Override SecId"] ?? null,
      "Metric Price / Book": asNumber(row["Price / Book"]) ?? null,
      "Portfolio Workbook ROE": null,
      "Portfolio Workbook PE FY1": null,
      "Portfolio Workbook Price/Bk": null,
      "Portfolio Country Code": null,
      "Currency Contrib": null,
      Currency: row.Currency ?? null,
      "Contribution to Return - MTD": null,
      "Contribution to Return - YTD": null,
      "Contribution to Return - 1 Mo": null,
      "Is Cash Like": false,
    }));

  fullJoinRows.push(...benchmarkOnlyRows);

  const unmatchedPortfolioRows = portfolioOnlyRows.filter((row) => !row["Is Cash Like"]);
  const bothCount = fullJoinRows.filter((row) => row.Status === "Both").length;
  const portfolioOnlyCount = fullJoinRows.filter((row) => row.Status === "Portfolio Only").length;
  const benchmarkOnlyCount = fullJoinRows.filter((row) => row.Status === "Benchmark Only").length;
  const exactCount = fullJoinRows.filter((row) =>
    ["benchmark_exact_isin", "benchmark_exact_cusip"].includes(row["Match Method"]),
  ).length;
  const equivalentCount = fullJoinRows.filter((row) => row["Match Method"] === "benchmark_equivalent_name").length;
  const cashCount = fullJoinRows.filter((row) => row["Is Cash Like"]).length;

  const output = sanitizeJson({
    summary: {
      portfolioWeightedRows: portfolioRows.length,
      benchmarkRows: benchmarkRows.length,
      fullJoinRows: fullJoinRows.length,
      bothCount,
      portfolioOnlyCount,
      benchmarkOnlyCount,
      exactCount,
      equivalentCount,
      unmatchedPortfolioCount: unmatchedPortfolioRows.length,
      cashCount,
      unmatchedPortfolioNames: unmatchedPortfolioRows.map((row) => row["Portfolio Name"]),
    },
    bridgeAudit: bridgeOutput.audit ?? {},
    fullJoinRows,
    portfolioOnlyRows,
    unmatchedPortfolioRows,
    benchmarkOnlyRows,
  });

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputJson, JSON.stringify(output, null, 2), "utf8");
  process.stdout.write(`${outputJson}\n`);
}

await main();
