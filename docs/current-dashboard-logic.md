# Opp Value Current Dashboard Logic

Date: 2026-04-24

## What This App Uses

### Portfolio Input
- Monthly PMHub workbook
- Sheet: `Sheet A`
- Header row: `1`
- Holdings begin on row `3`
- Row `2` is ignored

### Algo Input
- Monthly `Equity Algo LR` workbook
- Sheet: `International_Opp_Value`
- Date headers on row `1`
- Latest month is column `B`
- Only rows `2` through `30`
- The `Mom` block is ignored
- Values are decimal weights in Excel and are converted to percentage weights in the app

### Morningstar Input
- Benchmark investment id: `MGXTMENU`
- Latest benchmark holdings date is pulled automatically
- Benchmark constituents and weights are fetched from Morningstar
- Security-level enrichment is matched by:
  1. `ISIN`
  2. `Ticker`

## Current Matching Rules

### Portfolio to Benchmark
- Exact benchmark matches stay on the same row
- Reliable ADR/local-share equivalents stay on the same row
- True off-benchmark names remain portfolio-only with `benchmarkWeight = 0`
- Cash and currency rows are allowed and are not treated as failures

### Metric Priority
1. Direct metrics on the held portfolio security
2. Benchmark-local fallback metrics for gaps
3. Workbook fallback values where applicable

### Brazil / Mexico Override Rule
- If `Business Country` is `Brazil` or `Mexico`, and the local line is missing:
  - `P/FV`
  - `Moat`
  - `Forward P/E`
- then use the ADR-linked override path
- explicit pinned override `SecId`s win over generic ADR search

## Current Tabs

### Summary
- Portfolio weighted metrics
- Benchmark weighted metrics from the full benchmark universe
- Sector positioning
- Country positioning with algo comparison
- Attribution
- Benchmark connection audit

### Algo
- Include / exclude countries
- Interactive 12-month line chart
- Raw 12-month table
- Country values displayed as percentage weights

### Details / Portfolio Lookthrough
- Full join of portfolio + benchmark
- Workbook-style dense table
- Sort / filter / hide columns / zoom
- Excel export

## Country Position Formula
- `Portfolio Weight`
- `Benchmark Weight`
- `Active Weight vs Benchmark = Portfolio Weight - Benchmark Weight`
- `Algo Weight = scaled algo value`
- `Active Weight vs Algo = Portfolio Weight - Algo Weight`

## Retention
- PMHub uploads are persisted locally
- Algo uploads are persisted locally
- Token-driven Morningstar refreshes are persisted locally
- If Morningstar is unavailable later, the app can reuse the latest compatible retained snapshot

## Reproduction Notes
- Open the app locally with the included launchers
- Upload the current PMHub workbook
- Upload the current algo workbook
- Paste the daily Morningstar token
- Click `Refresh live`
- The dashboard should rebuild using the same logic documented above
