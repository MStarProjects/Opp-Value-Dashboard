# Opp Value Current Dashboard Logic

Date: 2026-04-30

## What This App Uses

### Portfolio Input
- Monthly PMHub workbook
- Sheet: `Sheet A`
- Header row: `1`
- Holdings begin on row `3`
- Row `2` is ignored

### Algo Input
- Monthly `Equity Algo LR` workbook
- Global xUS sleeve:
  - sheet `International_Opp_Value`
  - use only the first absolute-value block
  - parser starts at the first data row after the header
  - rows map to Excel rows `2` through `30`
  - stop at the first blank / non-country row so the `Mom` block is ignored
- US Opp Value sleeve:
  - sheet `US_Opp_Value`
  - use only the first absolute-value block
  - parser starts at the first data row after the header
  - stop at the first blank / non-sector row so the later blocks are ignored
- Date headers are on row `1`
- Latest month is column `B`
- Values are decimal weights in Excel and are converted to percentage weights in the app

### Morningstar Input
- Benchmark investment id: `MGXTMENU`
- Latest benchmark holdings date is pulled automatically
- Benchmark constituents and weights are fetched from Morningstar
- Security-level enrichment is matched by:
  1. `ISIN`
  2. `Ticker`
- `GICS Industry` / industry positioning is pulled from Morningstar per security using datapoint `LT735` (`Morningstar Industry`)
- Industry weights are calculated by summing:
  - portfolio weights by industry
  - benchmark weights by industry
- US sleeve industry positioning uses the full joined portfolio + benchmark universe and is sortable by active weight or sector

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
- Global xUS:
  - Sector positioning
  - Country positioning with algo comparison
- US Opp Value:
  - Sector positioning with algo comparison
  - Industry positioning
- Shared PM-facing summary visuals:
  - Conviction vs Valuation
  - Return vs Active Weight
  - Sector Valuation Spread
  - Country Valuation Spread where the sleeve uses country
  - Quality Concentration
  - Active Risk Map
  - Benchmark Overlap
  - Benchmark Opportunity Board
  - Off-Benchmark Conviction Board
- Benchmark connection audit

### Current Approved Summary UI

This is the currently preferred UI state and should be preserved unless the user asks for a redesign.

- `Global xUS Opp Value` and `US Opp Value` both use the same summary visual language where applicable.
- Attribution is removed from:
  - `Global xUS Opp Value`
  - `US Opp Value`
- The old `P/FV Mix` summary card is removed.
- The old `Country Active vs Algo` summary chart is removed.
- `Conviction vs Valuation` keeps a moat legend.
- Scatter hover should work like Excel:
  - nothing persistent is shown by default
  - when the cursor is directly over a point, a small floating tooltip appears at the cursor
  - the tooltip disappears when the cursor leaves the point
- The current UI is intentionally denser and laptop-friendly rather than oversized.

### Algo
- Include / exclude labels for the active sleeve
- Interactive 12-month line chart
- Raw 12-month table
- Values displayed as percentage weights

### Details / Portfolio Lookthrough
- Full join of portfolio + benchmark
- Workbook-style dense table
- Sort / filter / hide columns / zoom
- Excel export

## Algo Comparison Formula
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
