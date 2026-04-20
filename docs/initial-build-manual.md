# Opp Value Dashboard Initial Build Manual

## Purpose
This manual explains what needs to be done to create the first working version of the dashboard from an empty repository.

It is intended as the practical companion to the implementation plan: less product framing, more execution order.

## What We Are Building
We are building a client-side Next.js dashboard that:
- accepts an uploaded Excel workbook
- parses multiple sheets in the browser
- detects the purpose of each sheet
- reconciles mismatched rows into a canonical holdings model
- calculates portfolio analytics
- displays the results in a clean, shareable UI
- exports reconciled outputs to CSV

## Build Sequence
The safest order is:

1. Set up the app shell.
2. Build workbook ingestion.
3. Normalize headers and classify sheets.
4. Build reconciliation and issue tracking.
5. Add portfolio calculations.
6. Build the dashboard views.
7. Add exports.
8. Harden against workbook edge cases.

## Step-By-Step Manual

### Step 1: Bootstrap The Project
Create a new Next.js app with TypeScript and Tailwind.

Needed setup:
- Next.js
- TypeScript
- Tailwind CSS
- ESLint
- Prettier if desired
- Vitest for unit tests
- shadcn/ui setup

Expected output:
- working app in local dev
- clean repo structure
- initial `README.md`

### Step 2: Install Core Dependencies
Install the data and UI libraries required for v1.

Core packages:
- `xlsx`
- `@tanstack/react-table`
- `recharts`
- `fuse.js`
- `zod`
- `clsx`
- `tailwind-merge`

Optional helpers:
- a state solution such as Zustand if local component state becomes too heavy
- file saver helper if export UX needs it

### Step 3: Define The Type System First
Before building parsing logic, define the main TypeScript models.

Create types for:
- workbook sheet metadata
- parsed row records
- normalized headers
- detected sheet roles
- canonical holdings
- reconciliation issues
- summary KPIs
- sector aggregates

Why this matters:
- the parser and UI will move faster once the output contracts are stable
- it reduces rework when connecting features later

### Step 4: Build Upload And Workbook Parsing
Implement the file upload flow and parse the workbook client-side.

Tasks:
- create upload component
- read file with browser APIs
- parse workbook via `xlsx`
- extract all sheet names
- convert each sheet into JSON-like row records
- preserve original header names and normalized versions

Minimum success criteria:
- user uploads workbook
- app shows detected sheets and row counts
- parser works without server code

### Step 5: Add Header Normalization
Create a normalization utility before writing any reconciliation logic.

Normalization rules should include:
- trim whitespace
- lowercase for internal matching
- remove line breaks
- collapse duplicate spacing
- strip simple formatting noise
- map aliases to canonical field names where possible

Example alias groups:
- security name
- ticker
- ISIN
- target weight
- drifted weight
- benchmark weight
- sector
- industry
- forward PE
- price to book
- ROE

Minimum success criteria:
- the app can display normalized headers for each sheet
- the alias system can detect likely important columns

### Step 6: Build Sheet Profiling And Role Detection
Once headers are normalized, classify sheets by likely role.

Detection signals:
- sheet name keywords
- presence of identifier columns
- density of numeric metrics
- prevalence of date columns
- presence of sector labels
- portfolio-summary style layouts

Roles to detect:
- holdings
- metrics
- benchmark
- sector summary
- model or algo
- time series
- unknown

Important rule:
- role detection should return confidence, not just a final label

### Step 7: Build The Canonical Holdings Pipeline
This is the heart of the product.

Tasks:
- identify candidate holdings rows from detected sheets
- map rows into a common intermediate structure
- merge rows across sheets using matching priority
- generate one canonical record per security
- attach provenance and quality flags

Matching priority:
1. ISIN exact match
2. ticker exact match
3. normalized security name exact match
4. fuzzy name match with confidence threshold

The output must include:
- match method
- confidence
- source sheets
- unresolved rows
- duplicates
- missing weights
- missing metrics

### Step 8: Implement Reconciliation Issue Tracking
Build issue reporting as a first-class feature, not an afterthought.

Issue types should include:
- unmatched security
- duplicate candidate match
- low-confidence fuzzy match
- missing identifier
- missing weight
- missing metric
- conflicting values across sources

Minimum success criteria:
- reconciliation view can list issues even before the dashboard is polished

### Step 9: Implement Calculation Utilities
All calculations should be written as pure functions and tested independently.

Build:
- total weight
- holdings count
- weighted average forward PE
- weighted average price to book
- weighted average ROE
- weighted average price to fair value
- weighted average upside to fair value
- sector weights
- active sector exposures vs benchmark
- active sector exposures vs model
- top holdings by weight

Rules:
- default to `targetWeight`
- allow `driftedWeight` toggle if available
- ignore blanks in weighted averages
- never treat missing values as zero

### Step 10: Build The Initial UI Shell
Do not start with highly polished visuals. Start with an honest, inspectable product shell.

Initial screens:
- upload state
- workbook summary state
- overview KPI section
- holdings table
- reconciliation issues table
- sector comparison charts

First UI objective:
- prove that the data pipeline is correct and inspectable

### Step 11: Build The Holdings Table
Use TanStack Table for:
- sorting
- filtering
- search
- column visibility

Core columns:
- security name
- ticker
- sector
- target weight
- drifted weight
- benchmark weight
- model weight
- active weight fields
- valuation metrics
- reconciliation status

### Step 12: Build Overview And Sector Views
Overview should show:
- total holdings
- total weight
- weighted valuation metrics
- issue counts
- missing data warnings

Sector view should show:
- portfolio weights by sector
- benchmark sector weights
- active differences
- optional model comparison

### Step 13: Add Export Actions
Implement:
- export canonical holdings to CSV
- export unresolved issues to CSV

Include:
- source sheet references
- match method
- confidence
- key weights and metrics

### Step 14: Add Test Coverage
Focus tests on logic, not just components.

Highest-priority tests:
- header normalization
- alias mapping
- sheet-role detection
- exact matching
- fuzzy matching thresholds
- weighted average calculations
- active exposure calculations

### Step 15: Harden Against Real Workbook Behavior
After the first happy-path version works, validate with the real workbook and refine.

Hardening tasks:
- expand header aliases
- handle blank rows and merged-looking headers
- handle sheets with leading metadata rows
- guard against inconsistent numeric formatting
- improve fallback behavior for ambiguous matches

## Suggested Initial Backlog

### Sprint 1
- scaffold app
- install dependencies
- add types
- create upload flow
- parse workbook
- render sheet summary

### Sprint 2
- header normalization
- alias mapping
- sheet profiling
- role detection

### Sprint 3
- canonical holdings builder
- exact matching
- fuzzy fallback
- issue tracking

### Sprint 4
- calculation engine
- overview KPIs
- holdings table
- sector view

### Sprint 5
- reconciliation panel
- exports
- tests
- polish and hardening

## Files We Should Create Early
- `README.md`
- `docs/implementation-plan.md`
- `docs/initial-build-manual.md`
- `src/types/holdings.ts`
- `src/types/workbook.ts`
- `src/features/workbook/parseWorkbook.ts`
- `src/features/workbook/normalizeHeaders.ts`
- `src/features/workbook/detectSheetRole.ts`
- `src/features/reconciliation/matchSecurities.ts`
- `src/features/reconciliation/canonicalizeHoldings.ts`
- `src/features/calculations/portfolioMetrics.ts`

## Practical Notes For This Repo
- The repo currently appears empty aside from `.git`, so we should scaffold from scratch rather than retrofit an existing app.
- Because the source workbook structure may evolve, the parser should be resilient and heavily typed.
- The reconciliation engine is the highest-risk and highest-value part of the build, so it should be implemented before spending much time on visual polish.

## Recommended Next Action
The next concrete move should be to scaffold the Next.js project and commit the base app shell, workbook upload flow, and parsing utilities before touching charts or advanced UI.
