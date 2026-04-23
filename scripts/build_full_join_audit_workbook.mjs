import fs from "node:fs/promises";
import path from "node:path";

import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const repoRoot = process.cwd();
const dataPath = path.join(repoRoot, "outputs", "benchmark-audit", "full_join_audit_data.json");
const outputPath = path.join(repoRoot, "outputs", "benchmark-audit", "Opp Value Full Join Audit.xlsx");

function columnLetter(index) {
  let value = index + 1;
  let output = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    output = String.fromCharCode(65 + remainder) + output;
    value = Math.floor((value - 1) / 26);
  }
  return output;
}

function normalizeRows(rows) {
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        typeof value === "number" && !Number.isFinite(value) ? null : value,
      ]),
    ),
  );
}

function addTableSheet(workbook, name, rows, tableName, options = {}) {
  const sheet = workbook.worksheets.add(name);
  sheet.showGridLines = false;

  if (!rows.length) {
    sheet.getRange("A1:B2").values = [
      ["Status", "Message"],
      ["Empty", "No rows available"],
    ];
    return sheet;
  }

  const normalizedRows = normalizeRows(rows);
  const headers = Object.keys(normalizedRows[0]);
  const matrix = [
    headers,
    ...normalizedRows.map((row) => headers.map((header) => row[header] ?? null)),
  ];

  const endColumn = columnLetter(headers.length - 1);
  const endRow = matrix.length;
  const rangeRef = `A1:${endColumn}${endRow}`;

  sheet.getRange(rangeRef).values = matrix;
  sheet.tables.add(rangeRef, true, tableName);

  sheet.getRange(`A1:${endColumn}1`).format = {
    fill: "#0F172A",
    font: { bold: true, color: "#FFFFFF" },
    wrapText: true,
    horizontalAlignment: "center",
    verticalAlignment: "center",
  };

  for (const header of options.numberColumnHeaders ?? []) {
    const headerIndex = headers.indexOf(header);
    if (headerIndex < 0) {
      continue;
    }
    const columnRef = columnLetter(headerIndex);
    sheet.getRange(`${columnRef}2:${columnRef}${endRow}`).format.numberFormat = "0.0000";
  }

  sheet.freezePanes.freezeRows(1);
  sheet.getRange(rangeRef).format.autofitColumns();
  sheet.getRange(rangeRef).format.autofitRows();
  return sheet;
}

async function main() {
  const payload = JSON.parse(await fs.readFile(dataPath, "utf8"));
  const summary = payload.summary ?? {};
  const fullJoinRows = normalizeRows(payload.fullJoinRows ?? []);
  const unmatchedPortfolioRows = normalizeRows(payload.unmatchedPortfolioRows ?? []);
  const benchmarkOnlyRows = normalizeRows(payload.benchmarkOnlyRows ?? []);
  const portfolioOnlyRows = normalizeRows(payload.portfolioOnlyRows ?? []);

  const workbook = Workbook.create();
  const summarySheet = workbook.worksheets.add("Summary");
  summarySheet.showGridLines = false;

  summarySheet.getRange("A1:F1").merge();
  summarySheet.getRange("A1").values = [["Portfolio vs Benchmark Full Join Audit"]];
  summarySheet.getRange("A1").format = {
    fill: "#0F172A",
    font: { bold: true, color: "#FFFFFF", size: 18 },
    horizontalAlignment: "center",
    verticalAlignment: "center",
  };

  summarySheet.getRange("A3:B12").values = [
    ["Portfolio weighted rows", summary.portfolioWeightedRows ?? 0],
    ["Benchmark rows", summary.benchmarkRows ?? 0],
    ["Full join rows", summary.fullJoinRows ?? 0],
    ["Both", summary.bothCount ?? 0],
    ["Portfolio only", summary.portfolioOnlyCount ?? 0],
    ["Benchmark only", summary.benchmarkOnlyCount ?? 0],
    ["Exact matches", summary.exactCount ?? 0],
    ["Equivalent matches", summary.equivalentCount ?? 0],
    ["Unmatched portfolio names", summary.unmatchedPortfolioCount ?? 0],
    ["Cash rows", summary.cashCount ?? 0],
  ];

  summarySheet.getRange("A3:B12").format = {
    fill: "#F8FAFC",
    borders: {
      top: { style: "Continuous", color: "#CBD5E1" },
      bottom: { style: "Continuous", color: "#CBD5E1" },
      left: { style: "Continuous", color: "#CBD5E1" },
      right: { style: "Continuous", color: "#CBD5E1" },
    },
  };
  summarySheet.getRange("A3:A12").format.font = { bold: true, color: "#0F172A" };

  const unmatchedPreview = [
    ["Portfolio names still not connected"],
    ...(summary.unmatchedPortfolioNames ?? []).map((name) => [name]),
  ];
  const unmatchedEndRow = Math.max(unmatchedPreview.length, 2);
  summarySheet.getRange(`D3:D${unmatchedEndRow + 2}`).values = unmatchedPreview;
  summarySheet.getRange(`D3:D${unmatchedEndRow + 2}`).format = {
    fill: "#F8FAFC",
    borders: {
      top: { style: "Continuous", color: "#CBD5E1" },
      bottom: { style: "Continuous", color: "#CBD5E1" },
      left: { style: "Continuous", color: "#CBD5E1" },
      right: { style: "Continuous", color: "#CBD5E1" },
    },
  };
  summarySheet.getRange("D3").format.font = { bold: true, color: "#0F172A" };

  const chartRows = [
    ["Status", "Count"],
    ["Both", summary.bothCount ?? 0],
    ["Portfolio Only", summary.portfolioOnlyCount ?? 0],
    ["Benchmark Only", summary.benchmarkOnlyCount ?? 0],
  ];
  summarySheet.getRange("F3:G6").values = chartRows;
  const chart = summarySheet.charts.add("bar", summarySheet.getRange("F3:G6"));
  chart.title = "Join Status Counts";
  chart.setPosition("I3", "N18");
  chart.hasLegend = false;
  chart.barOptions.direction = "column";

  addTableSheet(workbook, "Full Join", fullJoinRows, "FullJoinAuditTable", {
    numberColumnHeaders: [
      "Portfolio Weight",
      "Benchmark Weight",
      "Active Weight",
      "Metric P/FV",
      "Metric ROE",
      "Metric Forward P/E",
      "Metric Price / Book",
      "Portfolio Workbook ROE",
      "Portfolio Workbook PE FY1",
      "Portfolio Workbook Price/Bk",
      "Currency Contrib",
      "Contribution to Return - MTD",
      "Contribution to Return - YTD",
      "Contribution to Return - 1 Mo",
    ],
  });
  addTableSheet(workbook, "Portfolio Not Connected", unmatchedPortfolioRows, "PortfolioNotConnectedTable", {
    numberColumnHeaders: [
      "Portfolio Weight",
      "Benchmark Weight",
      "Active Weight",
      "Metric P/FV",
      "Metric ROE",
      "Metric Forward P/E",
      "Metric Price / Book",
      "Portfolio Workbook ROE",
      "Portfolio Workbook PE FY1",
      "Portfolio Workbook Price/Bk",
      "Currency Contrib",
      "Contribution to Return - MTD",
      "Contribution to Return - YTD",
      "Contribution to Return - 1 Mo",
    ],
  });
  addTableSheet(workbook, "Portfolio Only", portfolioOnlyRows, "PortfolioOnlyTable", {
    numberColumnHeaders: [
      "Portfolio Weight",
      "Benchmark Weight",
      "Active Weight",
      "Metric P/FV",
      "Metric ROE",
      "Metric Forward P/E",
      "Metric Price / Book",
      "Portfolio Workbook ROE",
      "Portfolio Workbook PE FY1",
      "Portfolio Workbook Price/Bk",
      "Currency Contrib",
      "Contribution to Return - MTD",
      "Contribution to Return - YTD",
      "Contribution to Return - 1 Mo",
    ],
  });
  addTableSheet(workbook, "Benchmark Only", benchmarkOnlyRows, "BenchmarkOnlyTable", {
    numberColumnHeaders: [
      "Portfolio Weight",
      "Benchmark Weight",
      "Active Weight",
      "Metric P/FV",
      "Metric ROE",
      "Metric Forward P/E",
      "Metric Price / Book",
      "Portfolio Workbook ROE",
      "Portfolio Workbook PE FY1",
      "Portfolio Workbook Price/Bk",
      "Currency Contrib",
      "Contribution to Return - MTD",
      "Contribution to Return - YTD",
      "Contribution to Return - 1 Mo",
    ],
  });

  const inspect = await workbook.inspect({
    kind: "table",
    range: "Summary!A1:N18",
    include: "values,formulas",
    tableMaxRows: 18,
    tableMaxCols: 14,
  });
  await fs.writeFile(
    path.join(repoRoot, "outputs", "benchmark-audit", "full-join-summary-inspect.ndjson"),
    inspect.ndjson,
    "utf8",
  );

  const preview = await workbook.render({
    sheetName: "Summary",
    range: "A1:N18",
    scale: 1.2,
    format: "png",
  });
  const previewBytes = new Uint8Array(await preview.arrayBuffer());
  await fs.writeFile(
    path.join(repoRoot, "outputs", "benchmark-audit", "full-join-summary-preview.png"),
    previewBytes,
  );

  const xlsx = await SpreadsheetFile.exportXlsx(workbook);
  await xlsx.save(outputPath);
  process.stdout.write(`${outputPath}\n`);
}

await main();
