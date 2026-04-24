# Opp Value Dashboard

This repo now contains the current working local dashboard for Global xUS Opportunistic Value.

## Current Inputs
- Monthly PMHub workbook for owned holdings
- Monthly `Equity Algo LR` workbook for country algo weights
- Daily Morningstar token for live benchmark and enrichment pulls

## Primary Docs
- [docs/current-dashboard-logic.md](C:/Users/schuri2/OneDrive%20-%20MORNINGSTAR%20INC/Documents/GitHub/Opp-Value-Dashboard/docs/current-dashboard-logic.md)
- [docs/data-foundation-scope.md](C:/Users/schuri2/OneDrive%20-%20MORNINGSTAR%20INC/Documents/GitHub/Opp-Value-Dashboard/docs/data-foundation-scope.md)
- [docs/data-audit-checklist.md](C:/Users/schuri2/OneDrive%20-%20MORNINGSTAR%20INC/Documents/GitHub/Opp-Value-Dashboard/docs/data-audit-checklist.md)
- [docs/session-log-2026-04-24.md](C:/Users/schuri2/OneDrive%20-%20MORNINGSTAR%20INC/Documents/GitHub/Opp-Value-Dashboard/docs/session-log-2026-04-24.md)

## Opening The App
- double-click `Open Opp Value Dashboard.vbs` to start the local server and open the dashboard in your browser
- if you prefer to see the server window, double-click `Open Opp Value Dashboard.cmd`
- the app opens at `http://127.0.0.1:3000`

## Current Working Logic
- PMHub workbook:
  - sheet `Sheet A`
  - header row `1`
  - holdings start row `3`
- Algo workbook:
  - sheet `International_Opp_Value`
  - dates on row `1`
  - only rows `2` through `30`
  - latest month in column `B`
  - values scaled from decimals into percentage weights
- Morningstar:
  - benchmark investment id `MGXTMENU`
  - latest benchmark holdings date is pulled automatically
  - portfolio matching uses `ISIN`, then `Ticker`

## Retention
- PMHub uploads are retained locally
- Algo uploads are retained locally
- token-driven Morningstar refreshes are retained locally
- the app can reuse the latest retained compatible snapshot if Morningstar is temporarily unavailable

## Morningstar SDK Wiring
- preferred integration path: Python `morningstar_data` SDK
- benchmark investment id: `MGXTMENU`
- preferred token env var: `MD_AUTH_TOKEN`
- accepted alias: `MORNINGSTAR_API_TOKEN`
- optional Python path override: `MORNINGSTAR_PYTHON_PATH`
