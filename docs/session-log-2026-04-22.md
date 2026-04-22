# Session Log - 2026-04-22

## Goal
Refocus the project on data quality first, using the PMHub monthly holdings workbook as the owned portfolio input and Morningstar Data SDK as the enrichment path.

## Decisions Locked In
- The owned monthly input is `pmhub-report_*`, not `xUS Opp Value Portfolio Sheet.xlsx`.
- `xUS Opp Value Portfolio Sheet.xlsx` is only a presentation/layout reference for the eventual product.
- PMHub workbook contract:
  - sheet: `Sheet A`
  - header row: `1`
  - holdings start row: `3`
  - row `2` is a sleeve summary row, not a holding
  - official portfolio weight: `Weight`
- Matching priority:
  - `ISIN`
  - `Ticker`
- Benchmark code provided by user: `MGXTMENU`
- Saved Direct data set provided by user: `Global xUS Opp Value`

## Repo Changes Made

### Docs
- Replaced the old multi-file planning docs with:
  - `docs/data-foundation-scope.md`
  - `docs/data-audit-checklist.md`
- Added this session log:
  - `docs/session-log-2026-04-22.md`

### Data Contract / Parser
- Replaced the old workbook contract with:
  - `src/lib/pmhub-workbook-contract.ts`
- Updated source classification in:
  - `src/lib/data-sources.ts`
- Updated workbook parsing assumptions in:
  - `src/features/workbook/parseWorkbook.ts`

### Audit / State Model
- Refactored the dashboard data model around PMHub in:
  - `src/features/dashboard/buildDashboardState.ts`
- Updated audit types in:
  - `src/types/dashboard.ts`
- Updated Morningstar enrichment types in:
  - `src/types/morningstar.ts`
- Updated issue detection in:
  - `src/features/reconciliation/issueDetection.ts`

### Morningstar SDK Bridge
- Added server-side SDK bridge:
  - `src/features/morningstar/sdkBridge.server.ts`
- Added Python bridge script:
  - `scripts/morningstar_sdk_bridge.py`
- Updated enrichment entry point:
  - `src/features/morningstar/enrichPortfolioHoldings.ts`

### UI Copy
- Updated the current app copy so it refers to PMHub as the monthly source instead of the old fake golden workbook.

## Validation Completed
- `npm run typecheck` passed
- `npm run lint` passed

## Morningstar SDK Findings

### Auth
- The correct SDK auth env var is `MD_AUTH_TOKEN`
- `MORNINGSTAR_API_TOKEN` is now mapped into `MD_AUTH_TOKEN` by the Python bridge as a convenience
- The SDK token setup is working

### Proxy Issue
- The local environment had broken proxy variables pointing to `127.0.0.1:9`
- The Python bridge now clears those proxy variables before calling Morningstar services

### Saved Data Set
- `Global xUS Opp Value` resolved successfully
- Resolved data set id: `8467690`
- The data set returns fields including:
  - `Business Country`
  - `GICS Sector`
  - `Price To Fair Value`
  - `Economic Moat`
  - `Forward Price To Earnings Ratio`
  - `Return On Equity-FY`
  - `Price To Book Ratio`
  - `Fair Value Uncertainty`

### Security Enrichment
- Direct enrichment works for a test security by `ISIN`
- Confirmed example:
  - `AAPL`
  - PFV returned
  - moat returned
  - uncertainty returned
  - business country returned

## Benchmark Findings

### Benchmark Resolution
- `MGXTMENU` resolves to benchmark `SecId` `F000016KHB`
- Latest benchmark holdings date was found successfully:
  - `2026-03-31`

### Benchmark Holdings Problem
- `get_holding_dates(...)` works for benchmark ids
- `get_holdings(...)` returns zero rows for benchmark/index objects tested so far

#### Tested benchmark-like ids
- `F000016KHB`
- `F000011IK3`

#### Tested call shapes
- default `get_holdings`
- explicit `date`
- `start_date` / `end_date`
- `HoldingsView.FULL`
- `HoldingsView.BEST_AVAILABLE`
- `SecId;Universe`
- async path:
  - `get_holdings_task`
  - `md.mdapi.get_task_status`
  - `get_holdings_task_result`
- `get_lookthrough_holdings`

#### Result
- all benchmark constituent retrieval attempts returned zero rows

### Additional Benchmark Clues
- For `F000011IK3`, Morningstar lookup returned:
  - ticker: `MSUTMENU`
  - security type: `XI`
  - fund id: `FS0000E3LG`
  - performance id: `0P0001F3SA`
- Those sibling ids have not yet been fully tested as holdings-bearing objects

## Open Blocker
- PMHub -> Morningstar security enrichment is working
- benchmark constituent weights are still unresolved
- next likely step:
  - test sibling benchmark ids such as `Fund Id` / `Performance Id`
  - or locate a benchmark/index-specific constituent retrieval pattern in Morningstar docs

## Security Note
- Debug output exposed the daily bearer token in local command output during troubleshooting
- Since the token rotates daily, replace it tomorrow in `.env.local`
