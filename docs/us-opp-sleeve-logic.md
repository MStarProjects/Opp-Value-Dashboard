# US Opp Value Sleeve Logic

This document is the source of truth for the `US Opp Value` sleeve that now lives alongside the existing `Global xUS Opp Value` sleeve.

## Files

- PMHub holdings input: `usopp_*.xlsx`
- Algo input: `Equity Algo LR (1).xlsx`

## Sleeve Id

- Internal sleeve id: `us_opp`
- Top tab label: `US Opp Value`

## PMHub Parser

The US PMHub workbook uses a separate contract from the Global xUS sleeve.

### Workbook shape

- Sheet name: `Sheet A`
- Header row: `1`
- Data starts on row: `3`
- Sleeve summary row on row `2` is ignored

### Columns used

- `Security Name`
- `Ticker`
- `CUSIP`
- `ISIN`
- `Weight`

### Matching rules

- Primary match key: `ISIN`
- Ticker is still passed through for enrichment fallback, but the sleeve is designed around `ISIN` matching.
- Benchmark/portfolio name matching should resolve to full overlap for the current sleeve setup.

## Morningstar Configuration

- Benchmark investment id: `F000011IK3`
- Direct data set label: `US Opp Value`
- If the saved data set is unavailable for a token, the bridge falls back to direct datapoints.

### Metrics expected from Morningstar

- benchmark weight
- price to fair value
- economic moat
- fair value uncertainty
- sector
- gics industry, when provided by the API response
- forward P/E
- ROE
- price/book
- return series for `1M`, `MTD`, `YTD`, `1Y`

## Detail Lookthrough Rules

The US sleeve detail table differs from the Global xUS sleeve.

### Included columns

- Stock
- ISIN
- Sector
- `GICS Industry`
- Opp Value Weight
- Weight Benchmark
- MER P/Fair Value
- Upside MER V
- Forward PE
- P/B
- RO
- Moat
- Fair Value Uncertainty

### Removed column

- `business_country` / country is not shown in the US detail lookthrough.

## Summary Rules

The US sleeve summary differs from the Global xUS sleeve.

### Positioning sections

- Sector Position remains in the summary and is the section that can use the US algo overlay.
- Country Position is replaced by `Industry Position`.

### Current accepted summary output

- Attribution is not shown in the current accepted UI.
- The sleeve shares the common PM-facing summary visuals where applicable:
  - Conviction vs Valuation
  - Return vs Active Weight
  - Sector Valuation Spread
  - Quality Concentration
  - Active Risk Map
  - Benchmark Overlap
  - Benchmark Opportunity Board
  - Off-Benchmark Conviction Board
- The old `P/FV Mix` summary card is removed.
- The old `Country Active vs Algo` chart is removed.
- Scatter charts use Excel-style hover labels:
  - no permanent label area
  - tooltip appears only when the cursor is directly over a point
  - tooltip disappears when the cursor leaves the point

## Algo Parser

The US sleeve uses a different sheet from the same algo workbook.

### Workbook and sheet

- Workbook: `Equity Algo LR (1).xlsx`
- Sheet: `US_Opp_Value`

### Parsing window

- Use only the top absolute-value block
- Included rows: `2` through `12`
- Ignore everything below that block:
  - blank separator rows
  - `Mom`
  - relative/range sections

### Algo identifiers

The parser maps the sheet identifiers to sector labels:

- `US IT EQ` -> `Information Technology`
- `US FN EQ` -> `Financials`
- `US HC EQ` -> `Healthcare`
- `US CD EQ` -> `Consumer Discretionary`
- `US ID EQ` -> `Industrials`
- `US TL EQ` -> `Communication Services`
- `US CS EQ` -> `Consumer Staples`
- `US EN EQ` -> `Energy`
- `US MT EQ` -> `Materials`
- `US REIT` -> `Real Estate`
- `US UT EQ` -> `Utilities`

### Value scaling

- Algo values are stored in the workbook as decimals.
- Multiply every algo value by `100` during parsing.
- The parsed algo values are then treated as percentage weights.

## Sleeve Refresh Behavior

- Token save / live refresh updates only the currently selected sleeve.
- PMHub upload updates only the currently selected sleeve.
- Algo upload remains shared, but each sleeve reads a different sheet from the same workbook.

## Top-Level Sleeve Tabs

The app now has these sleeve tabs:

- `Global xUS Opp Value`
- `US Opp Value`
- `Consumer`
- `Dividend`

Only `Global xUS Opp Value` and `US Opp Value` have real parser logic wired right now. `Consumer` and `Dividend` are placeholders until their PMHub and benchmark rules are provided.
