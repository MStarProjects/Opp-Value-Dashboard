# Opp Value Current Audit Checklist

Date: 2026-04-24

## PMHub Workbook Checks
- Workbook contains `Sheet A`
- Header row is `1`
- Holdings parsing starts on row `3`
- Row `2` is ignored
- `Weight` is captured as the official portfolio weight
- All workbook columns are preserved

## Equity Algo Workbook Checks
- Workbook contains `International_Opp_Value`
- Date row is `1`
- Latest value comes from column `B`
- Only rows `2` through `30` are parsed
- The `Mom` section is ignored
- Algo identifiers map cleanly to countries
- Algo values are multiplied by `100` into percentage weights
- Each country appears only once after parsing

## Portfolio Identifier Checks
- Attempt `ISIN` first
- Use `Ticker` only when `ISIN` is missing
- Rows missing both `ISIN` and `Ticker` are flagged

## Benchmark Join Checks
- Latest benchmark holdings date is resolved from Morningstar
- Full benchmark holdings are received for `MGXTMENU`
- Exact benchmark matches are counted
- ADR/local-share equivalent matches are counted
- Portfolio-only off-benchmark rows remain visible
- Cash/currency rows are counted separately and not treated as benchmark failures

## Fundamental Field Checks
- `Benchmark Weight`
- `Price To Fair Value`
- `Economic Moat`
- `Fair Value Uncertainty`
- `Sector`
- `Business Country`
- `ROE`
- `Forward P/E`
- `Price/Book`

## Override Checks
- Portfolio-held security metrics win first
- Benchmark-local fallback metrics only fill gaps
- Brazil/Mexico ADR override logic applies only to:
  - `P/FV`
  - `Moat`
  - `Forward P/E`
- Explicit pinned override `SecId`s override generic ADR search where configured

## Summary Checks
- Portfolio weighted metrics use portfolio weights only
- Benchmark weighted metrics use the full benchmark universe
- Benchmark total weight is based on the full benchmark pull, not overlap rows

## Country Position Checks
- `Algo Weight` is shown as a percentage weight
- `Active Weight vs Algo` is compared against the scaled algo weight
- Algo slider/filter uses the scaled algo weight

## Detail / Lookthrough Checks
- Full join includes:
  - portfolio rows
  - connected benchmark rows
  - benchmark-only rows
- User can sort visible columns
- User can filter visible columns
- User can hide columns
- User can zoom the table
- User can export the current view to Excel

## Algo Tab Checks
- Chart shows only the parsed absolute-value country rows
- Hover shows country, month, and value
- Chart and controls fit a normal laptop screen without requiring oversized desktop width
- Raw data table shows the latest 12 months

## Retention Checks
- PMHub uploads are retained by date
- Token refresh pulls are retained by date
- Retained snapshots can be reused if live Morningstar refresh is unavailable
