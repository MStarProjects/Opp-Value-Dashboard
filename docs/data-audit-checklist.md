# Opp Value Data Audit Checklist

Date: 2026-04-22

## Goal
A batch is ready only when the monthly PMHub workbook is parsed cleanly and every expected security has been evaluated against Morningstar enrichment rules.

## Workbook Structure Checks
- workbook contains `Sheet A`
- header row is row `1`
- data parsing begins on row `3`
- row `2` is excluded from holdings parsing
- `Weight` is successfully captured as the portfolio weight field
- all workbook columns are preserved in the parsed row model

## Portfolio Row Checks
- row has a recognizable security name or identifier
- portfolio weight is present when expected
- duplicate rows are surfaced, not silently merged

## Identifier Checks
- `ISIN` present
- if `ISIN` missing, `Ticker` present
- rows missing both `ISIN` and `Ticker` are flagged

## Duplicate Checks
- duplicate `ISIN`
- duplicate `Ticker`
- duplicate identifier collisions across different security names

## Morningstar Matching Checks
- every row with `ISIN` is attempted against Morningstar using `ISIN`
- rows without `ISIN` attempt `Ticker`
- rows matched by ticker are flagged as fallback matches
- unmatched rows remain unmatched and visible in audit output

## Benchmark Checks
- benchmark constituents are received from Morningstar for `MGXTMENU`
- latest available benchmark holding date is identified correctly
- benchmark weights are attached to matched securities when applicable
- securities not in the benchmark are not treated as match failures if Morningstar security enrichment still succeeds
- missing benchmark weight is informational for off-benchmark holdings
- cash and currency rows are allowed to carry `0` benchmark weight without being treated as match failures
- ADR/local-share pairs are matched onto the same portfolio row when a reliable issuer-equivalent benchmark constituent exists
- benchmark-local fallback metrics are only used when the portfolio-held security is missing the Direct field
- Securities whose `Business Country` is Brazil or Mexico are allowed to use ADR overrides for `PFV`, `Moat`, and `Forward P/E` when those fields are missing on the local line

## Fundamental Field Checks
- `PFV`
- `Economic Moat`
- `Fair Value Uncertainty`
- `Sector`
- `Business Country`
- `ROE`
- `Forward P/E`
- `Price/Book`

## Workbook Fallback Checks
- if the API does not return a fundamental field, workbook fallback is attempted where available
- workbook fallback usage is counted and visible
- `Currency Contrib` remains workbook-owned

## Allowed Missingness
- `PFV` may be missing

## Audit Failures
- workbook row with `ISIN` does not match to Morningstar
- row missing both `ISIN` and `Ticker`
- duplicate identifier collision unresolved
- parse contract for `Sheet A` is broken

## Audit Output We Want In Code
- parsed workbook rows
- holdings rows with portfolio weight
- rows missing `ISIN`
- rows missing `Ticker`
- duplicate `ISIN` count
- duplicate `Ticker` count
- rows ready for API matching by `ISIN`
- rows requiring `Ticker` fallback
- rows enriched from API
- rows using workbook fallback fields
- unmatched rows
- exact benchmark matches
- ADR/local-share benchmark equivalent matches
- cash/currency rows ignored for benchmark matching
- off-benchmark rows with explicit `0` benchmark weight
- rows that used benchmark-local fallback metrics
- rows that used Brazil/Mexico ADR overrides
