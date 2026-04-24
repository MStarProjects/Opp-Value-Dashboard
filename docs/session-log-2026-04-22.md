# Session Log - 2026-04-22

## Goal
Move the project from loose prototype mode into a usable local dashboard built around the PMHub workbook and Morningstar SDK, while keeping the data rules explicit.

## Decisions Locked In
- The owned monthly input is `pmhub-report_*`, not `xUS Opp Value Portfolio Sheet.xlsx`.
- `xUS Opp Value Portfolio Sheet.xlsx` is only a layout/reference file for how the final workbook-style product should feel.
- PMHub workbook contract:
  - sheet: `Sheet A`
  - header row: `1`
  - holdings start row: `3`
  - row `2` is a sleeve summary row, not a holding
  - official portfolio weight: `Weight`
- Matching priority for portfolio enrichment:
  - `ISIN`
  - `Ticker`
- Benchmark investment id: `MGXTMENU`
- Saved Direct data set name supplied by user: `Global xUS Opp Value`
- Matching / override rules:
  - cash and currency rows are allowed
  - ADR/local-share equivalents should stay on the same portfolio row
  - off-benchmark holdings keep benchmark weight `0`
  - Brazil/Mexico rows can use ADR override for `PFV`, `Moat`, and `Forward P/E` when the local line is missing those values
  - `Sunbelt Rentals Holdings Inc` is intentionally treated as off benchmark

## Repo Changes Made

### Data Contract / Audit
- Replaced the old workbook contract with:
  - `src/lib/pmhub-workbook-contract.ts`
- Updated workbook parsing assumptions in:
  - `src/features/workbook/parseWorkbook.ts`
- Refactored the dashboard state around PMHub holdings plus Morningstar enrichment in:
  - `src/features/dashboard/buildDashboardState.ts`
- Updated enrichment and audit types in:
  - `src/types/dashboard.ts`
  - `src/types/morningstar.ts`
- Updated scope docs:
  - `docs/data-foundation-scope.md`
  - `docs/data-audit-checklist.md`

### Morningstar SDK Integration
- Added server-side SDK bridge:
  - `src/features/morningstar/sdkBridge.server.ts`
- Added token persistence for app-driven SDK use:
  - `src/lib/morningstar-session.ts`
  - `src/app/api/morningstar/session/route.ts`
- Added dashboard rebuild route so uploads and token refreshes rebuild on the server:
  - `src/app/api/dashboard-state/route.ts`
- Updated Python bridge:
  - `scripts/morningstar_sdk_bridge.py`
- Updated enrichment entry point:
  - `src/features/morningstar/enrichPortfolioHoldings.ts`

### App / UX
- Reworked the app into two main tabs:
  - `Summary`
  - `Details / Portfolio Lookthrough`
- Main UI file:
  - `src/components/dashboard-workbench.tsx`
- Updated first page render to open in workbook-first mode so the page does not blank while waiting on Morningstar:
  - `src/app/page.tsx`
- Added one-click local launchers:
  - `Open Opp Value Dashboard.cmd`
  - `Open Opp Value Dashboard.vbs`
- Updated local usage notes in:
  - `README.md`

## Morningstar Findings

### Auth / Session
- The correct SDK auth env var is `MD_AUTH_TOKEN`
- The bridge maps `MORNINGSTAR_API_TOKEN` into `MD_AUTH_TOKEN` when needed
- The app now stores the daily token locally in `.morningstar-session.json`
- `.morningstar-session.json` is gitignored and should never be committed

### Proxy / Environment
- The Python bridge clears local proxy env vars before calling Morningstar services
- This avoids the bad local proxy state that previously broke SDK requests

### Benchmark Resolution
- `MGXTMENU` resolves to benchmark `SecId` `F000016KHB`
- Latest benchmark holdings date resolved successfully:
  - `2026-03-31`

### Benchmark Holdings
- Benchmark holdings now work with the refreshed token/session
- Returned constituent count:
  - `2193`

### PMHub vs Benchmark Match Results
- Weighted PMHub rows checked in the live rebuild:
  - `128`
- Exact benchmark matches:
  - `111`
- Equivalent ADR/local-share matches:
  - `3`
- Off-benchmark rows:
  - `10`
- Cash/currency rows:
  - `4`

### Saved Data Set Status
- The current token/session can reach benchmark holdings
- The same token/session cannot currently resolve a usable Direct data set for `Global xUS Opp Value`
- Cached dataset id attempted:
  - `8467690`
- Result:
  - `ResourceNotFoundError`

### Bridge Fallback Fix
- The Python bridge was updated so a missing saved Direct data set no longer forces the app back to `stubbed`
- Current behavior:
  - live benchmark weights and match counts still load
  - workbook values remain the fallback for metrics such as PFV / moat / valuation when Direct dataset enrichment is unavailable
  - the dashboard can still return `configured`

## App / Server Fixes
- Fixed the token save flow so the app shows status messages instead of appearing dead
- Fixed the dashboard refresh route so token-triggered rebuilds do not require `multipart/form-data`
- Restarted and revalidated the local server after the bridge fallback fix
- Verified live `POST /api/dashboard-state` response:
  - status `200`
  - enrichment status `configured`
  - exact matches `111`
  - equivalent matches `3`
  - off benchmark `10`
  - cash rows `4`

## Validation Completed
- `npm run typecheck` passed
- `npm run lint` passed
- direct bridge smoke test returned live benchmark data and `configured` audit state

## Current State
- The local app is usable again
- The benchmark side is live
- The dashboard no longer collapses to `stubbed` just because the saved Direct data set is unavailable
- The remaining data-layer gap is direct field enrichment independent of the saved dataset

## Next Likely Step
- Replace the saved dataset dependency with explicit Direct datapoint requests so PFV / moat / uncertainty / ROE / forward P/E / price-to-book can load live without depending on `Global xUS Opp Value`

## Algo Workbook Rules
- Monthly algo source file:
  - `Equity Algo LR`
- Sheet:
  - `International_Opp_Value`
- Date headers:
  - row `1`
  - latest date is column `B`
- Allowed rows:
  - use only the absolute-value country block in sheet rows `2` through `30`
  - do not read the `Mom` block
- Country matching:
  - column `A` identifier maps to country using the two-letter country code prefix such as `JP EQ -> Japan`
  - dedupe by country code so each country appears only once
- Value scaling:
  - algo values are stored as decimals in Excel
  - multiply by `100` so the app treats them as percentage weights
- Country Position logic:
  - `Portfolio Weight`
  - `Benchmark Weight`
  - `Active Weight vs Benchmark`
  - `Algo Weight`
  - `Active Weight vs Algo`
- Algo tab:
  - interactive time-series chart with hover tooltip
  - latest `12` months of history
  - raw data table
