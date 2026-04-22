# Opp Value Dashboard

This repo is currently focused on getting the Opp Value data contract right before any more dashboard work.

## Current Scope
- One monthly PMHub holdings workbook is the only required manual input.
- Morningstar internal API will provide benchmark holdings, benchmark weights, and fundamental enrichment.
- Data audit comes before UI polish.

## Current Data Contract
- workbook sheet: `Sheet A`
- header row: `1`
- data start row: `3`
- row `2`: sleeve summary row, excluded from holdings parsing
- official portfolio weight for v1: `Weight`
- primary match key: `ISIN`
- fallback match key: `Ticker`
- benchmark investment id: `MGXTMENU`
- Direct data set: `Global xUS Opp Value`

## Docs
- `docs/data-foundation-scope.md`
- `docs/data-audit-checklist.md`

## Opening The App
- double-click `Open Opp Value Dashboard.vbs` to start the local server and open the dashboard in your browser
- if you prefer to see the server window, double-click `Open Opp Value Dashboard.cmd`
- the app opens at `http://127.0.0.1:3000`
- paste the current Morningstar token into the token box in the app when the daily token changes

## Morningstar SDK Wiring
- preferred integration path: Python `morningstar_data` SDK
- benchmark investment id: `MGXTMENU`
- saved Direct data set: `Global xUS Opp Value`
- environment toggle: `MORNINGSTAR_ENABLE_SDK=true`
- optional Python path override: `MORNINGSTAR_PYTHON_PATH`
- preferred token env var: `MD_AUTH_TOKEN`
- accepted alias for daily auth rotation: `MORNINGSTAR_API_TOKEN` (mapped into `MD_AUTH_TOKEN` by the Python bridge)

## Current Engineering Direction
1. Parse the PMHub workbook exactly.
2. Build an explicit audit around identifier quality and enrichment coverage.
3. Use the Python SDK bridge to fetch latest benchmark holdings and Direct data-set enrichment.
4. Revisit the app experience only after the data layer is trustworthy.
