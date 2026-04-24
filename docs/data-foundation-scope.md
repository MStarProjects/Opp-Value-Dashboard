# Opp Value Current Data Foundation Scope

Date: 2026-04-24

## Purpose
This document is the current source of truth for how the dashboard works today.

It replaces the older “data only, UI later” framing. The app now has a working UI, but the logic is still intentionally data-first and audit-first.

## Current Monthly Inputs

### 1. PMHub Workbook
- Required monthly upload
- Role: owned portfolio holdings
- Sheet: `Sheet A`
- Header row: `1`
- Holdings start row: `3`
- Row `2` is a sleeve summary row and is ignored
- Official portfolio weight field: `Weight`

### 2. Equity Algo Workbook
- Optional monthly upload
- Role: country-level algo signal
- Sheet: `International_Opp_Value`
- Row `1` contains dates
- Column `A` contains identifiers like `JP EQ`
- Latest value is always column `B`
- Only sheet rows `2` through `30` are used
- The `Mom` block is not used
- Algo values are decimals in Excel and are multiplied by `100` so the app treats them as percentage weights

## Morningstar Contract

### Benchmark
- Benchmark investment id: `MGXTMENU`
- The app resolves the latest available benchmark holdings date from Morningstar
- Benchmark holdings are pulled for that latest date

### Matching Priority
1. `ISIN`
2. `Ticker`

### Benchmark Join Logic
- Exact benchmark matches attach directly to the portfolio row
- Reliable ADR/local-share benchmark equivalents stay on the same portfolio row
- True off-benchmark portfolio names remain portfolio-only with `benchmarkWeight = 0`
- Cash and currency rows are allowed and are not benchmark match failures

### Fundamental Enrichment
- Benchmark holdings and benchmark weights come from Morningstar
- Portfolio-held security metrics should come from Morningstar when available
- Workbook values are used as fallback for metric gaps when Morningstar does not return a value

### Brazil / Mexico Override Logic
- If `Business Country` resolves to `Brazil` or `Mexico`, the app can use ADR-linked overrides for:
  - `P/FV`
  - `Moat`
  - `Forward P/E`
- Some names are permanently pinned to explicit override `SecId`s

## Current Dashboard Tabs

### Summary
- Portfolio weighted metrics
- Benchmark weighted metrics using the full benchmark universe, not just overlap names
- Sector positioning
- Country positioning
- Attribution
- Benchmark connection audit

### Algo
- Country include/exclude controls
- Interactive time-series chart
- Last 12 months of raw country algo values
- Values displayed as percentage weights

### Details / Portfolio Lookthrough
- Wide workbook-style table
- Portfolio + benchmark full-join view
- Sort/filter controls
- Column hide/show controls
- Zoom controls
- Excel export for the visible filtered view

## Country Position Logic
- `Portfolio Weight`
- `Benchmark Weight`
- `Active Weight vs Benchmark`
- `Algo Weight`
- `Active Weight vs Algo`

`Algo Weight` is the scaled percentage value from the algo workbook. `Active Weight vs Algo` is calculated against that scaled value.

## Retention Logic
- Every PMHub upload and token-driven refresh is retained locally by date
- The app stores:
  - PMHub workbook values
  - Morningstar pulled values
  - dashboard state snapshots
- If a live Morningstar refresh is unavailable later, the app can reuse the latest retained compatible snapshot

## Practical Rules For Future Changes
- Do not reintroduce the `Mom` algo block unless explicitly requested
- Do not compare raw algo decimals to portfolio weights
- Do not calculate benchmark summary metrics from overlap rows only
- Keep the full benchmark universe available in the detail/audit layer
