# Opp Value Dashboard Implementation Plan

## Purpose
This document translates the original scope brief into an implementation-ready plan for building the v1 `US Opp Value` dashboard as a client-side web app.

The goal for v1 is to let a user upload the workbook, reconcile cross-sheet data into a canonical holdings model, calculate portfolio metrics, and explore the results through a clean dashboard without requiring a backend.

## Product Goals
- Ingest the workbook directly in the browser.
- Detect and classify workbook sheets by role.
- Normalize inconsistent headers and identifiers.
- Reconcile mismatched holdings data into a canonical security model.
- Calculate portfolio-level metrics from reconciled data.
- Surface data quality issues and unresolved mappings clearly.
- Present overview, holdings, sector, reconciliation, and optional time series views.
- Support CSV export for canonical holdings and unresolved issues.

## Non-Goals For V1
- Authentication or user accounts.
- Persistent storage of uploaded workbooks or overrides.
- Multi-user workflows.
- Scheduled refreshes.
- Write-back into Excel.
- Database-backed mapping management.

## Recommended Technical Stack
- Next.js with App Router
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- `xlsx` for workbook parsing
- TanStack Table for holdings grid
- Recharts for dashboard visuals
- Fuse.js for fuzzy matching fallback
- Zod for runtime validation of parsed structures
- Vitest for unit testing

## Architecture Summary
The app should be structured as a browser-first ingestion and analytics pipeline:

1. User uploads workbook.
2. Parser reads workbook sheets client-side.
3. Sheet inspector normalizes headers and profiles content.
4. Sheet-role detector classifies sheets into likely business roles.
5. Reconciliation engine merges sheet data into a canonical holdings dataset.
6. Calculation engine derives portfolio KPIs, sector exposures, and comparison metrics.
7. UI renders the output and flags ambiguous or unresolved data issues.
8. Export utilities generate CSV outputs from the canonical dataset and issue list.

## Proposed Project Structure
```text
src/
  app/
    page.tsx
    layout.tsx
  components/
    upload/
    dashboard/
    holdings/
    reconciliation/
    charts/
    shared/
  features/
    workbook/
      parseWorkbook.ts
      detectSheetRole.ts
      normalizeHeaders.ts
      workbookProfile.ts
    reconciliation/
      canonicalizeHoldings.ts
      matchSecurities.ts
      fuzzyMatch.ts
      issueDetection.ts
    calculations/
      portfolioMetrics.ts
      sectorAggregation.ts
      comparisonMetrics.ts
    export/
      exportCsv.ts
    state/
      dashboardStore.ts
  lib/
    aliases.ts
    constants.ts
    formatters.ts
    math.ts
  types/
    workbook.ts
    holdings.ts
    reconciliation.ts
    metrics.ts
  test/
    fixtures/
    unit/
docs/
```

## Core Domain Model
The canonical holding should be the center of the app. Every downstream view should consume this model rather than raw sheet rows.

### Canonical Holding Fields
- `canonicalId`
- `securityName`
- `ticker`
- `isin`
- `secid`
- `sector`
- `industry`
- `targetWeight`
- `driftedWeight`
- `benchmarkWeight`
- `modelWeight`
- `activeWeightVsBenchmark`
- `activeWeightVsModel`
- `priceToFairValue`
- `upsideToFairValue`
- `uncertainty`
- `forwardPE`
- `priceToBook`
- `roe`
- `sourceSheets`
- `matchMethod`
- `matchConfidence`
- `reconciliationStatus`
- `dataQualityFlags`

### Supporting Models
- `WorkbookSheetProfile`
- `HeaderAliasMap`
- `DetectedSheetRole`
- `ReconciliationIssue`
- `PortfolioSummaryMetrics`
- `SectorExposureRow`
- `ExportRow`

## Functional Workstreams

### 1. App Foundation
Deliverables:
- Next.js app scaffolded and running locally
- Tailwind configured
- basic layout and page shell
- shared TypeScript and lint/test configuration

Acceptance criteria:
- app boots locally with no workbook
- project contains a clear directory structure
- typecheck and tests run successfully

### 2. Workbook Ingestion
Deliverables:
- browser upload control
- workbook parser using `xlsx`
- extraction of sheet names, headers, and raw row objects
- support for varying column layouts

Acceptance criteria:
- user can upload a workbook in the browser
- app reads multiple sheets successfully
- parser returns structured sheet data with no hardcoded dependence on one sheet format

### 3. Header Normalization And Sheet Profiling
Deliverables:
- normalized header utilities
- alias dictionary for expected field families
- content profiler for date density, identifier density, and numeric density
- sheet-role detection logic

Acceptance criteria:
- sheets can be tagged as likely holdings, metrics, benchmark, sector, model, or time series
- normalized headers support common workbook column variants
- ambiguous role classification is surfaced as low confidence rather than hidden

### 4. Reconciliation Engine
Deliverables:
- deterministic security matching by ISIN, ticker, and normalized name
- fuzzy fallback matching with confidence score
- duplicate and unresolved record detection
- canonical holdings builder

Acceptance criteria:
- canonical records capture source references and match method
- unresolved mappings remain visible to the user
- conflicting matches generate issue records

### 5. Calculation Engine
Deliverables:
- pure calculation utilities
- weighted average metrics
- sector exposure aggregation
- active weight comparisons versus benchmark and model
- data quality warnings for missing denominators or incomplete weights

Acceptance criteria:
- calculations ignore blanks instead of treating missing values as zero
- weight basis can switch between `targetWeight` and `driftedWeight`
- outputs are unit-tested

### 6. Dashboard UI
Deliverables:
- overview page with KPI cards and data quality summary
- holdings table with sorting, filtering, and search
- sector exposure comparison charts
- reconciliation issue panel
- optional time series panel when usable data exists

Acceptance criteria:
- main views render from canonical state
- user can inspect unresolved mappings and low-confidence matches
- layout works on laptop and desktop widths

### 7. Export Layer
Deliverables:
- export canonical holdings CSV
- export reconciliation issues CSV

Acceptance criteria:
- exported files match current filtered or full-state output depending on chosen UX rule
- issue export includes match confidence and source references

### 8. Hardening And Workbook Adaptation
Deliverables:
- workbook-specific alias refinement
- improved tolerance for evolving workbook formats
- error states and empty states
- fixture-driven regression tests

Acceptance criteria:
- common workbook variations do not break the ingest pipeline
- app gives clear feedback when required columns are missing

## Delivery Phases

### Phase 0: Repo Bootstrap
- scaffold app
- configure TypeScript, Tailwind, linting, formatting, testing
- create docs and development conventions

### Phase 1: Parsing Foundation
- implement upload flow
- parse workbook
- list sheets and normalized headers
- create profile summaries for each sheet

### Phase 2: Canonical Model And Matching
- implement aliasing
- detect roles
- build canonical holdings records
- generate reconciliation issues

### Phase 3: Metrics Engine
- implement reusable weighted metric functions
- compute summary KPIs
- compute sector views and active weights

### Phase 4: UI Assembly
- overview page
- holdings table
- reconciliation panel
- chart layer
- exports

### Phase 5: Hardening
- validate against the target workbook
- improve alias dictionaries
- add fixture tests for edge cases
- polish loading and error UX

## Key Decisions To Make Early
- Use App Router rather than Pages Router.
- Keep all workbook processing client-side for v1.
- Build around a canonical data model before spending time on charts.
- Treat reconciliation transparency as a first-class user requirement.
- Use pure functions for all calculations and matching so they are easy to test.

## Open Questions
- Which sheet is the authoritative source for target weight versus drifted weight?
- Are benchmark and model weights security-level or sector-level in the workbook?
- Do any sheets contain stable IDs like `secid` consistently enough to add above ticker in the matching order?
- Should exported CSV reflect current UI filters or always export the full reconciled dataset?
- How often is the workbook schema expected to change?

## Risks
- workbook sheets may look similar while representing different concepts
- formulas may not expose cached values consistently
- fuzzy matching can create false positives if not carefully bounded
- some metrics may exist only at aggregate level and cannot be projected safely to holdings
- time series sheets may require separate modeling from current-state sheets

## Recommended Definition Of Done
V1 is done when:
- a user can upload the workbook in the browser
- the app detects the main sheet roles with explainable logic
- canonical holdings are built from reconciled source rows
- portfolio metrics and sector comparisons are calculated from canonical data
- unresolved issues are clearly surfaced
- canonical holdings and issue lists can be exported
- core parsing, matching, and math logic is covered by unit tests

## Immediate Next Deliverables
- scaffold Next.js project
- create base type system
- implement workbook upload and raw parser
- build header normalization and sheet profiling utilities
- stub reconciliation pipeline with issue reporting
- wire a basic overview screen around parsed state
