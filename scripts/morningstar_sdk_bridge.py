import json
import os
import sys
from typing import Any


def _normalize(name: str) -> str:
    return "".join(ch.lower() for ch in str(name).strip())


def _find_column(columns: list[str], candidates: list[str]) -> str | None:
    normalized = {_normalize(column): column for column in columns}
    for candidate in candidates:
        key = _normalize(candidate)
        if key in normalized:
            return normalized[key]
    return None


def _safe_value(row: dict[str, Any], columns: list[str], candidates: list[str]) -> Any:
    column = _find_column(columns, candidates)
    return row.get(column) if column else None


def _json_default(value: Any) -> Any:
    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:
            pass

    if hasattr(value, "isoformat"):
        try:
            return value.isoformat()
        except Exception:
            pass

    return str(value)


def _build_stub_response(payload: dict[str, Any], notes: list[str]) -> dict[str, Any]:
    holdings = payload.get("holdings", [])
    return {
        "records": [],
        "audit": {
            "provider": "morningstar-internal-api",
            "status": "stubbed",
            "benchmarkInvestmentId": payload.get("benchmarkInvestmentId"),
            "directDataSetIdOrName": payload.get("directDataSetIdOrName"),
            "requestedFieldGroups": [
                "benchmark weights",
                "price/fair value",
                "economic moat",
                "fair value uncertainty",
                "sector",
                "business country",
                "forward PE",
                "ROE",
                "price/book",
            ],
            "matchedByIsin": 0,
            "matchedByTicker": 0,
            "unmatchedHoldings": len(holdings),
            "workbookFallbackRows": 0,
            "benchmarkConstituentCount": 0,
            "notes": notes,
        },
    }


def main() -> int:
    payload = json.load(sys.stdin)

    for proxy_key in [
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "ALL_PROXY",
        "GIT_HTTP_PROXY",
        "GIT_HTTPS_PROXY",
        "http_proxy",
        "https_proxy",
        "all_proxy",
    ]:
        os.environ.pop(proxy_key, None)

    try:
        import morningstar_data as md
        from morningstar_data.direct import InvestmentIdentifier
    except Exception as exc:
        response = _build_stub_response(
            payload,
            [
                "Morningstar SDK bridge is wired, but the morningstar_data package is not installed.",
                f"Import error: {type(exc).__name__}: {exc}",
            ],
        )
        print(json.dumps(response, default=_json_default))
        return 0

    notes: list[str] = []
    token = os.environ.get("MORNINGSTAR_API_TOKEN")
    md_auth_token = os.environ.get("MD_AUTH_TOKEN")
    if token and not md_auth_token:
        os.environ["MD_AUTH_TOKEN"] = token
        md_auth_token = token
        notes.append("Mapped MORNINGSTAR_API_TOKEN into MD_AUTH_TOKEN for the Morningstar SDK.")

    if md_auth_token:
        notes.append("MD_AUTH_TOKEN is present in the environment.")
    else:
        notes.append("MD_AUTH_TOKEN is not set; the SDK may rely on an existing local session.")

    benchmark_id = payload["benchmarkInvestmentId"]
    data_set_name = payload["directDataSetIdOrName"]
    holdings = payload.get("holdings", [])

    try:
        data_sets = md.direct.user_items.get_data_sets()
        data_set_records = data_sets.to_dict(orient="records")
        matching_data_set = next(
            (
                record
                for record in data_set_records
                if str(record.get("name", "")).strip().lower() == data_set_name.strip().lower()
            ),
            None,
        )

        if not matching_data_set:
            response = _build_stub_response(
                payload,
                notes + [f"Unable to resolve Direct data set named '{data_set_name}'."],
            )
            print(json.dumps(response, default=_json_default))
            return 0

        data_set_id = str(matching_data_set.get("datasetId"))
        notes.append(f"Resolved Direct data set id: {data_set_id}.")

        data_points = md.direct.user_items.get_data_set_details(data_set_id=data_set_id)
        resolved_benchmark_id = benchmark_id
        if not benchmark_id.startswith("F") and not benchmark_id.startswith("0P"):
            benchmark_lookup = md.direct.lookup.investments(keyword=benchmark_id, count=10)
            benchmark_lookup_records = benchmark_lookup.to_dict(orient="records")
            benchmark_match = next(
                (
                    row
                    for row in benchmark_lookup_records
                    if str(row.get("Ticker", "")).strip().lower() == benchmark_id.strip().lower()
                ),
                benchmark_lookup_records[0] if benchmark_lookup_records else None,
            )
            if benchmark_match:
                resolved_benchmark_id = str(
                    benchmark_match.get("SecId")
                    or benchmark_match.get("Performance Id")
                    or benchmark_match.get("PerformanceId")
                    or benchmark_id
                )
                notes.append(
                    f"Resolved benchmark identifier {benchmark_id} to {resolved_benchmark_id}."
                )

        benchmark_dates = md.direct.get_holding_dates(investment_ids=[resolved_benchmark_id])
        benchmark_date_records = benchmark_dates.to_dict(orient="records")
        if not benchmark_date_records:
            response = _build_stub_response(
                payload,
                notes + [f"No benchmark holding dates were returned for {resolved_benchmark_id}."],
            )
            print(json.dumps(response, default=_json_default))
            return 0

        latest_benchmark_date = max(str(record.get("date")) for record in benchmark_date_records)
        notes.append(f"Latest benchmark holdings date: {latest_benchmark_date}.")

        benchmark_holdings = md.direct.get_holdings(
            investments=[resolved_benchmark_id],
            date=latest_benchmark_date,
        )

        investments = []
        requested_holdings = []
        for holding in holdings:
          if holding.get("isin"):
              investments.append(InvestmentIdentifier(isin=holding["isin"]))
              requested_holdings.append({"matchMethod": "isin", **holding})
          elif holding.get("ticker"):
              investments.append(InvestmentIdentifier(ticker=holding["ticker"]))
              requested_holdings.append({"matchMethod": "ticker", **holding})

        if not investments:
            response = _build_stub_response(
                payload,
                notes + ["No PMHub holdings had ISIN or ticker values available for Morningstar matching."],
            )
            print(json.dumps(response, default=_json_default))
            return 0

        investment_data = md.direct.get_investment_data(
            investments=investments,
            data_points=data_points,
            display_name=True,
        )

        investment_records = investment_data.to_dict(orient="records")
        investment_columns = list(investment_data.columns)
        benchmark_records = benchmark_holdings.to_dict(orient="records")
        benchmark_columns = list(benchmark_holdings.columns)

        benchmark_map_isin: dict[str, Any] = {}
        benchmark_map_ticker: dict[str, Any] = {}
        for row in benchmark_records:
            isin = _safe_value(row, benchmark_columns, ["ISIN", "Holding ISIN"])
            ticker = _safe_value(row, benchmark_columns, ["Ticker", "Holding Ticker"])
            if isin:
                benchmark_map_isin[str(isin).strip().lower()] = row
            if ticker:
                benchmark_map_ticker[str(ticker).strip().lower()] = row

        records = []
        matched_by_isin = 0
        matched_by_ticker = 0

        for index, requested in enumerate(requested_holdings):
            investment_row = investment_records[index] if index < len(investment_records) else {}
            benchmark_row = None
            if requested.get("isin"):
                benchmark_row = benchmark_map_isin.get(str(requested["isin"]).strip().lower())
            if benchmark_row is None and requested.get("ticker"):
                benchmark_row = benchmark_map_ticker.get(str(requested["ticker"]).strip().lower())

            if investment_row:
                if requested["matchMethod"] == "isin":
                    matched_by_isin += 1
                else:
                    matched_by_ticker += 1

            records.append(
                {
                    "identifier": {
                        "isin": requested.get("isin"),
                        "ticker": requested.get("ticker"),
                        "securityName": requested.get("securityName"),
                    },
                    "benchmarkWeight": _safe_value(
                        benchmark_row or {},
                        benchmark_columns,
                        ["Weight", "Benchmark Weight", "Weighting"],
                    ),
                    "priceToFairValue": _safe_value(
                        investment_row,
                        investment_columns,
                        ["Price to Fair Value", "P/FV", "Price/Fair Value"],
                    ),
                    "moat": _safe_value(investment_row, investment_columns, ["Economic Moat", "Moat"]),
                    "uncertainty": _safe_value(
                        investment_row,
                        investment_columns,
                        ["Fair Value Uncertainty", "Uncertainty"],
                    ),
                    "forwardPE": _safe_value(
                        investment_row,
                        investment_columns,
                        ["Forward Price/Earnings Ratio", "Forward P/E", "Forward PE"],
                    ),
                    "roe": _safe_value(
                        investment_row,
                        investment_columns,
                        ["Return on Equity", "ROE"],
                    ),
                    "priceToBook": _safe_value(
                        investment_row,
                        investment_columns,
                        ["Price/Book", "Price to Book", "P/B"],
                    ),
                    "sector": _safe_value(investment_row, investment_columns, ["Sector"]),
                    "country": _safe_value(
                        investment_row,
                        investment_columns,
                        ["Business Country", "Country"],
                    ),
                }
            )

        response = {
            "records": records,
            "audit": {
                "provider": "morningstar-internal-api",
                "status": "configured",
                "benchmarkInvestmentId": benchmark_id,
                "directDataSetIdOrName": data_set_name,
                "requestedFieldGroups": [
                    "benchmark weights",
                    "price/fair value",
                    "economic moat",
                    "fair value uncertainty",
                    "sector",
                    "business country",
                    "forward PE",
                    "ROE",
                    "price/book",
                ],
                "matchedByIsin": matched_by_isin,
                "matchedByTicker": matched_by_ticker,
                "unmatchedHoldings": max(len(holdings) - matched_by_isin - matched_by_ticker, 0),
                "workbookFallbackRows": 0,
                "benchmarkConstituentCount": len(benchmark_records),
                "notes": notes,
            },
        }

        print(json.dumps(response, default=_json_default))
        return 0
    except Exception as exc:
        response = _build_stub_response(
            payload,
            notes + [f"Morningstar SDK request failed: {type(exc).__name__}: {exc}"],
        )
        print(json.dumps(response, default=_json_default))
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
