# Opp Value Dashboard

Next.js dashboard for client-side workbook reconciliation, comparison views, attribution framing, and stock-level detail for the `xUS Opp Value` workflow.

## Current State
- Next.js App Router scaffolded with TypeScript and Tailwind CSS.
- Multi-file Excel upload implemented with `xlsx`.
- Source-role detection added for:
  - portfolio workbook
  - PMHub holdings
  - PFV override
  - TME reference
- First working dashboard includes:
  - refresh summary
  - top-level KPIs
  - sector comparison
  - attribution-style ranked views
  - stock-level detail
  - data quality panel

## Included Source Files
Real workbook inputs are checked in under `data/raw/`:
- `xUS Opp Value Portfolio Sheet.xlsx`
- `pmhub-report_intl_opp value_42026.xlsx`
- `xUS Opp Value_pfv overide_42026.xlsx`
- `xustme_42026.xlsx`

## Docs
- `docs/implementation-plan.md`
- `docs/initial-build-manual.md`
- `docs/workbook-integration-plan.md`

## Run Locally
```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Current Refresh Model
1. Upload the main portfolio workbook and any dated companion files.
2. The app classifies each file by role.
3. Holdings are rebuilt from the current batch.
4. PFV override and TME data enrich the stock-level dataset.
5. Summary, comparison, and detail views refresh from the merged result.

## Next Build Priorities
1. Improve charting depth for attribution and comparison analysis.
2. Add more robust field-level provenance and issue surfacing.
3. Add explicit file-date ranking when multiple dated files are uploaded.
4. Expand stock detail with more benchmark and reference comparisons.
