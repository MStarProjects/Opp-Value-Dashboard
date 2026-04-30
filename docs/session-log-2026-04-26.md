# Session Log - 2026-04-26

## Scope

Added the first multi-sleeve expansion on top of the existing Global xUS dashboard:

- top-level sleeve tabs
- sleeve-aware PMHub parsing
- sleeve-aware benchmark wiring
- sleeve-aware algo parsing
- initial `US Opp Value` support

## New Sleeve Model

Added a shared sleeve config model in `src/lib/sleeves.ts`.

Current sleeves:

- `global_xus`
- `us_opp`
- `consumer`
- `dividend`

Only `global_xus` and `us_opp` have live parsing logic right now. `consumer` and `dividend` are placeholders.

## PMHub Role Split

Replaced the old single PMHub role with sleeve-specific roles:

- `pmhub_global_xus`
- `pmhub_us_opp`
- `pmhub_consumer`
- `pmhub_dividend`

This change touched:

- `src/lib/data-sources.ts`
- `src/lib/current-workbook-store.ts`
- `src/features/workbook/parseWorkbook.ts`

## US Opp Value PMHub Contract

Added the US PMHub contract in `src/lib/pmhub-workbook-contract.ts`.

Rules:

- sheet `Sheet A`
- header row `1`
- holdings start row `3`
- weight column is `Weight`
- benchmark id `F000011IK3`
- Direct data set label `US Opp Value`

## Algo Parser Split

Replaced the old single-sheet algo parser with a sleeve-aware parser in:

- `src/features/algo/parseAlgoWorkbook.ts`

Rules now:

### Global xUS

- sheet `International_Opp_Value`
- start at the first data row after the header
- use Excel rows `2-30`
- stop at the first blank / non-country row
- no `Mom`
- values multiplied by `100`

### US Opp Value

- sheet `US_Opp_Value`
- start at the first data row after the header
- use the first absolute-value sector block only
- stop at the first blank / non-sector row
- no `Mom`
- values multiplied by `100`
- identifiers mapped to sector names
- sector alias matching is allowed when comparing algo labels to dashboard sector labels

## UI Sleeve Tabs

Added top-level sleeve tabs in `src/components/dashboard-workbench.tsx`:

- Global xUS Opp Value
- US Opp Value
- Consumer
- Dividend

Behavior:

- the app boots into `Global xUS Opp Value`
- switching sleeves loads the requested sleeve on demand
- token refresh only refreshes the active sleeve
- PMHub upload only updates the active sleeve

## Summary and Detail Behavior for US

US sleeve behavior introduced:

- detail lookthrough supports `GICS Industry`
- country/business-country is not shown in the US detail table
- summary uses `Industry Position` instead of `Country Position`
- sector positioning can still use algo overlay for the US sleeve

## API / Bridge Changes

Updated the Morningstar bridge interfaces to be sleeve-aware:

- `src/features/morningstar/enrichPortfolioHoldings.ts`
- `src/features/morningstar/sdkBridge.server.ts`

Also added first-pass `industry` extraction to:

- `scripts/morningstar_sdk_bridge.py`

Current rule:

- if Morningstar returns industry via the metrics row or benchmark-enriched row, the app now carries it through
- no fake local industry mapping was added

## Retention Update

Retention snapshots now store the owning sleeve id in:

- `src/lib/data-retention.ts`

This prevents multi-sleeve retention from becoming ambiguous.

## Local Raw Files Added

Added these files to `data/raw/` so a fresh pull can reproduce the sleeve setup:

- `usopp_424.xlsx`
- `Equity Algo LR (1).xlsx`

## Validation

Validation passed after the sleeve refactor:

- `npm run typecheck`
- `npm run lint`

## Open Follow-Up

The next likely pass is:

- verify live Morningstar industry coverage for the US sleeve end to end
- refine the US summary visuals once the live sleeve data is refreshed in the app
