# Opp Value Session Log

Date: 2026-04-24

## Goal
Lock the repo to the exact current working version so another person can pull it and reproduce the same PMHub + Morningstar + algo workflow without guessing.

## Final Working Inputs

### PMHub Workbook
- Monthly holdings upload
- `Sheet A`
- Row `1` headers
- Row `3` holdings start
- Row `2` ignored

### Equity Algo Workbook
- Monthly country algo upload
- `International_Opp_Value`
- Row `1` date headers
- Column `B` is latest month
- Only rows `2` through `30`
- `Mom` block ignored
- Algo decimals multiplied by `100` into percentage weights

### Morningstar
- Daily token entered in app
- Benchmark investment id `MGXTMENU`
- Latest benchmark holdings date pulled automatically
- Benchmark holdings + weights fetched live

## Matching / Join Rules
- Match portfolio to Morningstar by:
  1. `ISIN`
  2. `Ticker`
- Exact benchmark matches stay on the same row
- ADR/local-share equivalents stay on the same row when the match is reliable
- Off-benchmark names stay visible with `benchmarkWeight = 0`
- Cash/currency rows are allowed

## Metric Rules
- Portfolio-held security Direct metrics win first
- Benchmark-local fallback metrics fill gaps only
- Workbook fallback values can still fill gaps where appropriate
- Brazil/Mexico names can use ADR-linked overrides for:
  - `P/FV`
  - `Moat`
  - `Forward P/E`
- Explicit override `SecId`s remain pinned where configured

## Algo Rules
- Country determined from the two-letter code in column `A`
- Dedupe by country code so each country appears once
- Algo tab uses the latest 12 months from the absolute-value block only
- Country Position uses:
  - `Portfolio Weight`
  - `Benchmark Weight`
  - `Active Weight vs Benchmark`
  - `Algo Weight`
  - `Active Weight vs Algo`
- `Algo Weight` is the scaled percentage value from the workbook

## UI State Locked In

### Summary
- Portfolio and benchmark weighted metrics
- Sector positioning
- Country positioning with algo comparison
- Contributors and detractors side by side
- Benchmark connection at the bottom

### Algo
- Laptop-sized layout
- Compact country selector
- Interactive line chart with hover
- Raw 12-month table

### Details / Portfolio Lookthrough
- Dense workbook-style table
- Full join view
- Sort / filter / hide columns / zoom
- Excel export

## Retention
- PMHub uploads retained locally
- Algo uploads retained locally
- Morningstar refresh snapshots retained locally
- App can reuse retained live-compatible snapshots when Morningstar is unavailable

## Cleanup Done
- Updated current source-of-truth docs so they reflect the working app, not the earlier prototype
- Removed stale “UI later” framing from the main docs
- Removed stale algo ambiguity by documenting the exact row range and scaling rule
- Removed leftover split between raw algo decimal logic and percent-weight display logic

## Files To Treat As Current Source Of Truth
- [README.md](C:/Users/schuri2/OneDrive%20-%20MORNINGSTAR%20INC/Documents/GitHub/Opp-Value-Dashboard/README.md)
- [docs/current-dashboard-logic.md](C:/Users/schuri2/OneDrive%20-%20MORNINGSTAR%20INC/Documents/GitHub/Opp-Value-Dashboard/docs/current-dashboard-logic.md)
- [docs/data-foundation-scope.md](C:/Users/schuri2/OneDrive%20-%20MORNINGSTAR%20INC/Documents/GitHub/Opp-Value-Dashboard/docs/data-foundation-scope.md)
- [docs/data-audit-checklist.md](C:/Users/schuri2/OneDrive%20-%20MORNINGSTAR%20INC/Documents/GitHub/Opp-Value-Dashboard/docs/data-audit-checklist.md)
