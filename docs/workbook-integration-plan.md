# Workbook Integration Plan

## Purpose
This document maps the real workbook files you use today into the product architecture for the dashboard.

The dashboard should preserve the feel of the current `xUS Opp Value Portfolio Sheet.xlsx` while expanding it into:
- a summary dashboard,
- richer comparison and attribution views,
- and a deeper stock-level detail experience.

It should also support a repeatable refresh flow where the user provides the latest files ending in a date and the app updates holdings, metrics, and overlays accordingly.

## Confirmed File Roles

### 1. `xUS Opp Value Portfolio Sheet.xlsx`
This is the current working sheet and should be treated as the primary reference for layout and dashboard structure.

Observed tabs:
- `Portfolio Metrics`
- `xUS Opp Value`
- `xUS Opp Value (Values)`
- `CRIMs`
- `xUS TME`
- `Overrides`
- `Algo`

How to use it:
- use as the UI model and fallback integrated workbook
- use `Portfolio Metrics` for summary KPI framing
- use `xUS Opp Value` as the main current holdings snapshot
- use `xUS TME` as embedded reference metrics when dated files are absent
- use `Overrides` as embedded manual override logic
- use `Algo` for time series and comparison inputs

### 2. `pmhub-report_intl_opp value_42026.xlsx`
This appears to be the dated holdings and market-metric snapshot.

Observed structure:
- single sheet `Sheet A`
- security-level rows with:
  - ticker
  - security name
  - CUSIP
  - SEDOL
  - ISIN
  - price
  - weight
  - ROE
  - PE FY1
  - price/book
  - return columns

How to use it:
- treat as a primary dated holdings input
- use for current position weights and stock-level financial metrics
- use as one of the main sources for the stock detail page

### 3. `xUS Opp Value_pfv overide_42026.xlsx`
This is a dated override file for valuation and moat-oriented fields.

Observed fields:
- name
- ticker
- ISIN
- CUSIP
- economic moat
- price to fair value
- fair value uncertainty
- GICS sector

How to use it:
- treat as the preferred override layer for PFV-based metrics
- use to overwrite or enrich stock-level valuation data when matched
- track provenance so the UI can show when a field comes from override data

### 4. `xustme_42026.xlsx`
This is a dated TME reference file.

Observed fields:
- name
- ticker
- ISIN
- CUSIP
- portfolio weighting
- economic moat
- price to fair value
- fair value uncertainty
- GICS sector

How to use it:
- treat as the benchmark/reference universe
- use for relative comparisons and attribution framing
- use to show how portfolio holdings compare to the broader TME opportunity set

## Recommended Product Model

### Source Hierarchy
The app should accept multiple input files in one refresh batch and classify them into source roles.

Preferred source priority:
1. Dated PMHub file for current holdings and financial metrics
2. Dated PFV override file for override valuation data
3. Dated TME file for benchmark/reference comparisons
4. Main portfolio sheet as current integrated workbook and layout reference

### Refresh Model
The app should support this workflow:

1. User uploads the latest dated files.
2. App identifies each file by filename pattern and column signature.
3. App maps each file to a source role.
4. App rebuilds the canonical holdings dataset.
5. App recomputes summary metrics, comparisons, and attribution views.
6. App preserves clear labels showing the as-of date and source coverage.

## File Detection Rules

### Filename-based detection
- `pmhub-report_*_<date>.xlsx` => `pmhub_holdings`
- `*pfv*override*_<date>.xlsx` => `pfv_override`
- `*tme*_<date>.xlsx` => `tme_reference`
- `*Portfolio Sheet*.xlsx` => `portfolio_workbook`

### Column-signature detection
Use header checks as backup when filenames vary:

- PMHub holdings:
  - `Ticker`
  - `Security Name`
  - `ISIN`
  - `Weight`
  - `ROE`
  - `PE FY1`
  - `Price/Bk`

- PFV override:
  - `Economic Moat`
  - `Price To Fair Value`
  - `Fair Value Uncertainty`

- TME reference:
  - same PFV-style fields plus `Portfolio Weighting %`

- Main portfolio workbook:
  - multiple sheets including `Portfolio Metrics` and `xUS Opp Value`

## Canonical Holding Design
Each stock should be built from merged data across these sources.

### Base identity fields
- security name
- ticker
- ISIN
- SECID
- CUSIP
- country
- sector

### Portfolio fields
- target weight
- drifted weight
- benchmark weight
- PMHub weight

### Valuation and quality fields
- price to fair value
- upside to fair value
- fair value uncertainty
- economic moat
- forward PE
- ROE
- price to book

### Provenance fields
- source file(s)
- source sheet(s)
- matched by
- field-level source priority
- as-of date

## Dashboard Structure

### 1. Summary Dashboard
This should preserve the spirit of the current portfolio sheet but be more visual and interactive.

Recommended sections:
- top KPI ribbon
- data freshness and file coverage status
- portfolio vs benchmark vs TME comparison cards
- valuation summary
- sector and country exposure summary
- data quality summary

### 2. Comparison And Attribution Views
This is the biggest expansion beyond the current workbook.

Recommended charts:
- portfolio vs benchmark sector exposure
- portfolio vs TME sector exposure
- active weight by sector
- active weight by country
- valuation spread by sector
- contribution-style chart for top overweight and underweight positions
- moat exposure distribution
- PFV distribution for portfolio vs reference universe

### 3. Stock-Level Detail
This should become a dedicated detail view rather than only a row in a spreadsheet-like table.

Recommended stock detail content:
- identifiers and classification
- weight history if available later
- current portfolio weight
- benchmark weight
- relative active weight
- valuation snapshot
- moat and uncertainty
- source data provenance
- override indicators
- comparison against TME/reference metrics

## Refresh Behavior

### What the user should do
The user should be able to drop in the latest dated files and have the dashboard refresh automatically.

### What the app should do
- identify the latest available dated files in the upload set
- parse the date from the filename
- rebuild current holdings and metrics
- update the dashboard header to show the active as-of date
- highlight missing companion files if only part of the source set is present

### Recommended v1 refresh approach
- user uploads one or more files manually
- app picks the latest dated file per source role
- app shows which files were used

### Recommended v1.1 enhancement
- support a local folder watcher or persisted workspace configuration
- auto-select newest file by source type

## Implementation Changes From Original Scope
The original scope assumed one workbook with multiple sheets as the main input. Based on the real workflow, the product should now support a hybrid model:

- one current workbook for integrated reference and layout
- multiple dated companion files for refreshable source data

This means the ingestion layer should be file-aware, not just sheet-aware.

## Immediate Build Priorities
1. Add multi-file upload instead of single workbook upload.
2. Implement source-role detection by filename and headers.
3. Parse as-of dates from filenames and sheet metadata.
4. Build canonical holdings using PMHub as the current holdings backbone.
5. Apply PFV override enrichment after base holdings load.
6. Load TME as the main comparison universe.
7. Map the summary dashboard to the current portfolio sheet structure.
8. Add stock-level detail and comparison charts after the core merge works.
