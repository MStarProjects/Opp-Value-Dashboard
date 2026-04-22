# Opp Value Data Foundation Scope

Date: 2026-04-22

## Purpose
This project is data-first.

Before dashboard layout, charts, or app polish, we are defining the canonical contract for the monthly Opp Value process so every downstream view is built on trusted inputs.

## v1 Data Model

### Owned Input
- One monthly PMHub holdings workbook uploaded by the user
- This workbook is the only required manual input

### PMHub Workbook Contract
- Sheet name: `Sheet A`
- Header row: row `1`
- Data starts: row `3`
- Row `2` is a sleeve summary row and should not be treated as a holding
- All workbook columns are preserved
- Official portfolio weight for v1: `Weight`

### Security Matching Priority
1. `ISIN`
2. `Ticker`

### Benchmark Contract
- Benchmark investment id: `MGXTMENU`
- Benchmark holdings should use the latest available date from Morningstar holdings history

### Data Set Contract
- Saved Direct data set: `Global xUS Opp Value`
- Morningstar Data SDK is the preferred integration path

## Source Of Truth By Field

### Workbook-owned
- portfolio holdings
- portfolio weight
- currency contribution
- security return contribution fields
- fallback values for metrics when the API does not return a result

### Morningstar-owned
- benchmark constituents
- benchmark weights
- benchmark security fundamentals
- enrichment data for every portfolio holding, even when the holding is not in the benchmark

## Required API Enrichment Fields
- benchmark weight
- price to fair value
- economic moat
- fair value uncertainty
- sector
- business country
- return on equity
- forward price to earnings ratio
- price to book

## Core Data Rules
- Every workbook row with an `ISIN` must match to Morningstar security data.
- Rows without `ISIN` should attempt `Ticker`.
- Unmatched rows are flagged, never guessed.
- Missing `PFV` is allowed.
- A security can be fully matched and enriched even if it is not in the benchmark.
- Benchmark membership is separate from Morningstar security enrichment.

## What Will Be Built First
1. PMHub workbook parser
2. Canonical holdings model
3. Morningstar SDK enrichment contract
4. Data audit output
5. API integration wiring

UI work is explicitly out of scope until the data audit is reliable.

## Immediate Deliverables
- parser aligned to `Sheet A`
- audit output aligned to `ISIN` then `Ticker` matching
- documentation for workbook-owned vs API-owned fields
- placeholder Morningstar enrichment client shaped around the benchmark id and saved data set
