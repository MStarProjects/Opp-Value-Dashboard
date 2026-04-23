import json
import math
import os
import re
import sys
from typing import Any

from join_override_rules import (
    PFV_PE_OVERRIDE_RULES,
    find_pfv_pe_override,
    latest_metric_value,
)


def _normalize(name: str) -> str:
    return "".join(ch.lower() for ch in str(name).strip())


def _find_column(columns: list[str], candidates: list[str]) -> str | None:
    normalized = {_normalize(column): column for column in columns}
    for candidate in candidates:
        key = _normalize(candidate)
        if key in normalized:
            return normalized[key]
        prefix_matches = [
            column
            for normalized_column, column in normalized.items()
            if normalized_column.startswith(key)
        ]
        if prefix_matches:
            prefix_matches.sort(key=len)
            return prefix_matches[0]
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


def _has_value(value: Any) -> bool:
    if value is None:
        return False

    if isinstance(value, float) and math.isnan(value):
        return False

    if isinstance(value, str) and not value.strip():
        return False

    return True


def _pick_value(*values: Any) -> Any:
    for value in values:
        if _has_value(value):
            return value

    return None


def _is_cash_like_name(value: str | None) -> bool:
    if not value:
        return False

    normalized = _normalize(str(value or ""))
    compact = re.sub(r"[^a-z0-9]+", " ", normalized).strip()
    tokens = set(compact.split()) if compact else set()

    if "cash" in tokens or "currency" in tokens:
        return True

    currency_tokens = {
        "dollar",
        "won",
        "peso",
        "pounds",
        "sterling",
        "euro",
        "yen",
        "krw",
        "gbp",
        "mxn",
        "usd",
    }
    if tokens.intersection(currency_tokens):
        return True

    cash_patterns = ["cash_usd", "cash_gbp", "cash_mxn", "cash_krw", "pend_cash"]
    return any(pattern in normalized for pattern in cash_patterns)


def _is_cash_like_holding(holding: dict[str, Any]) -> bool:
    return _is_cash_like_name(holding.get("securityName")) or _is_cash_like_name(
        holding.get("ticker")
    )


_COMPANY_NAME_PATTERNS = [
    r"\bsponsored adr class [a-z]\b",
    r"\bsponsored adr\b",
    r"\badr\b",
    r"\bclass [a-z]\b",
    r"\bordinary shares?\b",
    r"\bparticipating preferred\b",
    r"\bpreferred\b",
    r"\bcorp(?:oration)?\b",
    r"\bco\b",
    r"\bltd\b",
    r"\blimited\b",
    r"\bplc\b",
    r"\bn\.?v\.?\b",
    r"\bs\.?a\.?\b",
    r"\bs\.?p\.?a\.?\b",
    r"\bag\b",
    r"\bholdings?\b",
    r"\bgroup\b",
]

_KNOWN_DATA_SET_IDS = {
    "global xus opp value": "8467690",
}

_INVESTMENT_BATCH_SIZE = 500


def _resolve_data_set_details(md: Any, data_set_name: str, notes: list[str]) -> tuple[Any, str]:
    normalized_data_set_name = data_set_name.strip().lower()

    user_data_sets = md.direct.user_items.get_data_sets()
    user_data_set_records = user_data_sets.to_dict(orient="records")
    matching_user_data_set = next(
        (
            record
            for record in user_data_set_records
            if str(record.get("name", "")).strip().lower() == normalized_data_set_name
        ),
        None,
    )

    candidate_ids: list[tuple[str, str]] = []
    if matching_user_data_set and matching_user_data_set.get("datasetId") is not None:
        candidate_ids.append((str(matching_user_data_set.get("datasetId")), "user"))

    known_id = _KNOWN_DATA_SET_IDS.get(normalized_data_set_name)
    if known_id and known_id not in {candidate_id for candidate_id, _ in candidate_ids}:
        candidate_ids.append((known_id, "cached"))

    morningstar_lookup_records: list[dict[str, Any]] = []
    try:
        morningstar_data_sets = md.direct.lookup.get_morningstar_data_sets()
        morningstar_lookup_records = morningstar_data_sets.to_dict(orient="records")
    except Exception as exc:
        notes.append(f"Morningstar data set catalog lookup failed: {type(exc).__name__}: {exc}")

    matching_morningstar_data_set = next(
        (
            record
            for record in morningstar_lookup_records
            if str(
                _pick_value(
                    record.get("name"),
                    record.get("datasetName"),
                    record.get("displayName"),
                )
                or ""
            )
            .strip()
            .lower()
            == normalized_data_set_name
        ),
        None,
    )
    if matching_morningstar_data_set:
        morningstar_id = _pick_value(
            matching_morningstar_data_set.get("datasetId"),
            matching_morningstar_data_set.get("dataSetId"),
            matching_morningstar_data_set.get("id"),
        )
        if morningstar_id is not None and str(morningstar_id) not in {
            candidate_id for candidate_id, _ in candidate_ids
        }:
            candidate_ids.append((str(morningstar_id), "morningstar"))

    attempted_ids: list[str] = []
    for data_set_id, source in candidate_ids:
        attempted_ids.append(f"{data_set_id} ({source})")
        try:
            data_points = md.direct.user_items.get_data_set_details(data_set_id=data_set_id)
            notes.append(f"Resolved Direct data set id: {data_set_id} ({source}).")
            return data_points, data_set_id
        except Exception as exc:
            notes.append(
                f"Data set id {data_set_id} ({source}) was not usable: {type(exc).__name__}: {exc}"
            )

    attempted_label = ", ".join(attempted_ids) if attempted_ids else "none"
    raise RuntimeError(
        f"Unable to resolve usable data set details for '{data_set_name}'. Attempted ids: {attempted_label}."
    )


def _build_default_data_points(as_of_date: str) -> list[dict[str, Any]]:
    return [
        {"datapointId": "OS603", "startDate": as_of_date, "endDate": as_of_date},
        {"datapointId": "LT181", "startDate": as_of_date, "endDate": as_of_date},
        {"datapointId": "ST201", "startDate": as_of_date, "endDate": as_of_date},
        {"datapointId": "LA03Z"},
        {"datapointId": "BC001"},
        {"datapointId": "ST198", "startDate": as_of_date, "endDate": as_of_date},
        {"datapointId": "ST408", "startDate": as_of_date, "endDate": as_of_date},
        {"datapointId": "ST377"},
    ]


def _build_override_data_points(as_of_date: str) -> list[dict[str, Any]]:
    return [
        {"datapointId": "OS603"},
        {"datapointId": "ST198"},
    ]


def _normalize_company_name(value: str | None) -> str:
    normalized = str(value or "").lower()
    normalized = normalized.replace("&", " and ")
    normalized = re.sub(r"[.,()/\-]", " ", normalized)
    for pattern in _COMPANY_NAME_PATTERNS:
        normalized = re.sub(pattern, " ", normalized)
    normalized = re.sub(r"[^a-z0-9 ]+", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def _tokenize_company_name(value: str | None) -> list[str]:
    normalized = _normalize_company_name(value)
    return normalized.split() if normalized else []


def _find_equivalent_benchmark_row(
    holding: dict[str, Any], benchmark_rows: list[dict[str, Any]]
) -> dict[str, Any] | None:
    holding_name = holding.get("securityName")
    holding_normalized = _normalize_company_name(holding_name)
    holding_tokens = _tokenize_company_name(holding_name)

    if not holding_normalized or not holding_tokens:
        return None

    best_candidate = None
    best_score = 0.0

    for row in benchmark_rows:
        benchmark_name = row.get("name")
        benchmark_normalized = row.get("_normalized_company_name") or _normalize_company_name(
            benchmark_name
        )
        benchmark_tokens = row.get("_company_tokens") or _tokenize_company_name(benchmark_name)

        if not benchmark_normalized or not benchmark_tokens:
            continue

        if benchmark_normalized == holding_normalized:
            score = 1.0
        else:
            shared_tokens = set(holding_tokens).intersection(benchmark_tokens)
            if len(shared_tokens) < 2:
                continue

            if holding_tokens[0] != benchmark_tokens[0]:
                continue

            contains_match = (
                benchmark_normalized.startswith(holding_normalized)
                or holding_normalized.startswith(benchmark_normalized)
            )
            token_ratio = len(shared_tokens) / max(len(holding_tokens), len(benchmark_tokens))

            if contains_match:
                score = max(token_ratio, 0.95)
            elif token_ratio >= 0.67:
                score = token_ratio
            else:
                continue

        if (
            score > best_score
            or (
                score == best_score
                and best_candidate is not None
                and _pick_value(row.get("weight"), 0) > _pick_value(best_candidate.get("weight"), 0)
            )
        ):
            best_candidate = row
            best_score = score

    return best_candidate


def _country_allows_adr_override(value: Any) -> bool:
    normalized = _normalize(str(value or ""))
    return normalized in {"brazil", "mexico"}


def _build_lookup_identifier(InvestmentIdentifier: Any, row: dict[str, Any]) -> Any | None:
    secid = _pick_value(row.get("secId"), row.get("SecId"))
    isin = _pick_value(row.get("ISIN"), row.get("isin"))
    ticker = _pick_value(row.get("Ticker"), row.get("ticker"))

    if secid:
        return str(secid)
    if isin:
        return InvestmentIdentifier(isin=str(isin))
    if ticker:
        return InvestmentIdentifier(ticker=str(ticker))

    return None


def _fetch_single_investment_row(
    md: Any, data_points: Any, identifier: Any
) -> tuple[dict[str, Any], list[str]]:
    frame = md.direct.get_investment_data(
        investments=[identifier],
        data_points=data_points,
        display_name=True,
    )
    records = frame.to_dict(orient="records")
    return (records[0] if records else {}), list(frame.columns)


def _fetch_investment_rows_batched(
    md: Any, data_points: Any, identifiers: list[Any]
) -> tuple[list[dict[str, Any]], list[str]]:
    if not identifiers:
        return [], []

    records: list[dict[str, Any]] = []
    columns: list[str] = []
    for index in range(0, len(identifiers), _INVESTMENT_BATCH_SIZE):
        batch = identifiers[index : index + _INVESTMENT_BATCH_SIZE]
        frame = md.direct.get_investment_data(
            investments=batch,
            data_points=data_points,
            display_name=True,
        )
        if not columns:
            columns = list(frame.columns)
        records.extend(frame.to_dict(orient="records"))

    return records, columns


def _resolve_override_metric(
    override_result: dict[str, Any] | None, field: str
) -> tuple[Any, str | None]:
    if not override_result:
        return None, None

    static_value = override_result.get(field)
    if _has_value(static_value):
        first_secid = override_result.get("secIds", [None])[0]
        return static_value, (str(first_secid) if first_secid else None)

    for secid in override_result.get("secIds", []):
        metrics = override_result.get("metricsBySecId", {}).get(str(secid), {})
        value = metrics.get(field)
        if _has_value(value):
            return value, str(secid)

    first_secid = override_result.get("secIds", [None])[0]
    return None, (str(first_secid) if first_secid else None)


def _find_adr_lookup_candidate(
    md: Any, security_name: str, notes: list[str]
) -> dict[str, Any] | None:
    lookup_results = md.direct.lookup.investments(keyword=security_name, count=20)
    lookup_records = lookup_results.to_dict(orient="records")

    best_candidate = None
    best_score = 0.0
    security_tokens = _tokenize_company_name(security_name)
    security_normalized = _normalize_company_name(security_name)

    for row in lookup_records:
        candidate_name = _pick_value(row.get("Name"), row.get("name"))
        if "adr" not in _normalize(str(candidate_name or "")):
            continue

        candidate_normalized = _normalize_company_name(candidate_name)
        candidate_tokens = _tokenize_company_name(candidate_name)
        if not candidate_normalized or not candidate_tokens:
            continue

        shared_tokens = set(security_tokens).intersection(candidate_tokens)
        if security_normalized and candidate_normalized == security_normalized:
            score = 1.0
        elif (
            security_tokens
            and candidate_tokens
            and security_tokens[0] == candidate_tokens[0]
            and len(shared_tokens) >= 2
        ):
            score = len(shared_tokens) / max(len(security_tokens), len(candidate_tokens))
        else:
            continue

        if score > best_score:
            best_candidate = row
            best_score = score

    if best_candidate is None:
        notes.append(f"No ADR override candidate found for '{security_name}'.")
        return None

    return best_candidate


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
            "benchmarkMatchedExactly": 0,
            "benchmarkMatchedByEquivalent": 0,
            "offBenchmarkRows": 0,
            "cashLikeRows": 0,
            "benchmarkFallbackMetricRows": 0,
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
        data_points = None
        data_set_id = None
        try:
            data_points, data_set_id = _resolve_data_set_details(md, data_set_name, notes)
        except Exception as exc:
            notes.append(
                "Continuing without saved Direct data set enrichment. "
                f"Benchmark weights will still load live, and workbook fields will remain as the metric fallback. "
                f"Reason: {type(exc).__name__}: {exc}"
            )

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

        if data_points is None:
            data_points = _build_default_data_points(latest_benchmark_date)
            notes.append(
                "Using direct Morningstar datapoints for PFV, moat, uncertainty, sector, "
                "business country, ROE, forward P/E, and price/book."
            )

        override_metrics_by_secid: dict[str, dict[str, Any]] = {}
        override_secids = [
            secid
            for rule in PFV_PE_OVERRIDE_RULES
            for secid in rule.get("secIds", [])
            if secid
        ]
        if override_secids:
            try:
                override_records, _ = _fetch_investment_rows_batched(
                    md,
                    _build_override_data_points(latest_benchmark_date),
                    override_secids,
                )
                for override_record in override_records:
                    override_secid = str(override_record.get("Id") or "")
                    if not override_secid:
                        continue
                    override_metrics_by_secid[override_secid] = {
                        "priceToFairValue": latest_metric_value(
                            override_record,
                            "Price To Fair Value ",
                        ),
                        "forwardPE": latest_metric_value(
                            override_record,
                            "Forward Price To Earnings Ratio ",
                        ),
                    }
                notes.append("Loaded explicit PFV/PE override metrics from the SecId override list.")
            except Exception as exc:
                notes.append(
                    "Failed loading the explicit PFV/PE override SecIds; continuing without those explicit overrides. "
                    f"Reason: {type(exc).__name__}: {exc}"
                )

        benchmark_holdings = md.direct.get_holdings(
            investments=[resolved_benchmark_id],
            date=latest_benchmark_date,
        )
        notes.append("Benchmark holdings were retrieved successfully.")

        investment_requests = []
        requested_holdings = []
        benchmark_records = benchmark_holdings.to_dict(orient="records")
        benchmark_columns = list(benchmark_holdings.columns)

        benchmark_map_isin: dict[str, Any] = {}
        benchmark_map_cusip: dict[str, Any] = {}
        for row in benchmark_records:
            isin = _safe_value(row, benchmark_columns, ["ISIN", "Holding ISIN"])
            cusip = _safe_value(row, benchmark_columns, ["CUSIP", "Holding CUSIP"])
            if isin:
                benchmark_map_isin[str(isin).strip().lower()] = row
            if cusip:
                benchmark_map_cusip[str(cusip).strip().lower()] = row
            row["_normalized_company_name"] = _normalize_company_name(row.get("name"))
            row["_company_tokens"] = _tokenize_company_name(row.get("name"))

        cash_like_rows = 0
        for holding in holdings:
            requested_holding = {
                "isCashLike": _is_cash_like_holding(holding),
                **holding,
            }
            if requested_holding["isCashLike"]:
                cash_like_rows += 1
            elif holding.get("isin"):
                investment_requests.append(InvestmentIdentifier(isin=holding["isin"]))
                requested_holding["matchMethod"] = "isin"
            elif holding.get("ticker"):
                investment_requests.append(InvestmentIdentifier(ticker=holding["ticker"]))
                requested_holding["matchMethod"] = "ticker"
            requested_holdings.append(requested_holding)

        investment_records: list[dict[str, Any]] = []
        investment_columns: list[str] = []
        if investment_requests and data_points is not None:
            try:
                investment_records, investment_columns = _fetch_investment_rows_batched(
                    md,
                    data_points,
                    investment_requests,
                )
            except Exception as exc:
                notes.append(
                    "Portfolio metric enrichment partially failed; continuing with benchmark matching and workbook fallbacks. "
                    f"Reason: {type(exc).__name__}: {exc}"
                )

        investment_row_by_canonical_id: dict[str, Any] = {}
        investment_record_index = 0
        matched_by_isin = 0
        matched_by_ticker = 0
        for requested in requested_holdings:
            if requested.get("isCashLike") or not requested.get("matchMethod"):
                continue

            investment_row = (
                investment_records[investment_record_index]
                if investment_record_index < len(investment_records)
                else {}
            )
            investment_record_index += 1
            investment_row_by_canonical_id[str(requested.get("canonicalId"))] = investment_row

            if investment_row:
                if requested["matchMethod"] == "isin":
                    matched_by_isin += 1
                else:
                    matched_by_ticker += 1

        equivalent_benchmark_requests = []
        equivalent_request_by_benchmark_isin: dict[str, Any] = {}
        benchmark_match_by_canonical_id: dict[str, Any] = {}

        benchmark_matched_exactly = 0
        benchmark_matched_by_equivalent = 0
        off_benchmark_rows = 0

        for requested in requested_holdings:
            benchmark_row = None
            benchmark_match_method = None

            requested_isin = requested.get("isin")
            requested_cusip = requested.get("cusip")
            if requested_isin:
                benchmark_row = benchmark_map_isin.get(str(requested_isin).strip().lower())
                if benchmark_row is not None:
                    benchmark_match_method = "benchmark_exact_isin"
            if benchmark_row is None and requested_cusip:
                benchmark_row = benchmark_map_cusip.get(str(requested_cusip).strip().lower())
                if benchmark_row is not None:
                    benchmark_match_method = "benchmark_exact_cusip"

            if benchmark_row is None and requested.get("isCashLike"):
                benchmark_match_method = "cash_like"
            elif benchmark_row is None:
                benchmark_row = _find_equivalent_benchmark_row(requested, benchmark_records)
                if benchmark_row is not None:
                    benchmark_match_method = "benchmark_equivalent_name"
                    benchmark_isin = _safe_value(
                        benchmark_row, benchmark_columns, ["ISIN", "Holding ISIN"]
                    )
                    if benchmark_isin:
                        equivalent_request_by_benchmark_isin[str(benchmark_isin).strip().lower()] = (
                            benchmark_row
                        )
                else:
                    benchmark_match_method = "off_benchmark"

            if benchmark_match_method in {"benchmark_exact_isin", "benchmark_exact_cusip"}:
                benchmark_matched_exactly += 1
            elif benchmark_match_method == "benchmark_equivalent_name":
                benchmark_matched_by_equivalent += 1
            elif benchmark_match_method == "off_benchmark":
                off_benchmark_rows += 1

            benchmark_match_by_canonical_id[str(requested.get("canonicalId"))] = {
                "benchmarkRow": benchmark_row,
                "benchmarkMatchMethod": benchmark_match_method,
            }

        benchmark_fallback_records: list[dict[str, Any]] = []
        benchmark_fallback_columns: list[str] = []
        if equivalent_request_by_benchmark_isin and data_points is not None:
            equivalent_benchmark_requests = [
                InvestmentIdentifier(isin=isin)
                for isin in equivalent_request_by_benchmark_isin.keys()
            ]
            try:
                benchmark_fallback_records, benchmark_fallback_columns = _fetch_investment_rows_batched(
                    md,
                    data_points,
                    equivalent_benchmark_requests,
                )
            except Exception as exc:
                notes.append(
                    "Benchmark local-line fallback metric enrichment failed; continuing without those fallback metrics. "
                    f"Reason: {type(exc).__name__}: {exc}"
                )

        benchmark_fallback_by_isin: dict[str, Any] = {}
        for index, benchmark_isin in enumerate(equivalent_request_by_benchmark_isin.keys()):
            benchmark_fallback_by_isin[benchmark_isin] = (
                benchmark_fallback_records[index] if index < len(benchmark_fallback_records) else {}
            )

        records = []
        benchmark_fallback_metric_rows = 0
        adr_override_rows = 0
        adr_override_cache: dict[str, tuple[dict[str, Any], list[str]]] = {}

        for requested in requested_holdings:
            canonical_id = str(requested.get("canonicalId"))
            investment_row = investment_row_by_canonical_id.get(canonical_id, {})
            benchmark_match = benchmark_match_by_canonical_id.get(canonical_id, {})
            benchmark_row = benchmark_match.get("benchmarkRow")
            benchmark_match_method = benchmark_match.get("benchmarkMatchMethod")

            benchmark_fallback_row = {}
            if benchmark_match_method == "benchmark_equivalent_name":
                benchmark_isin = _safe_value(
                    benchmark_row or {}, benchmark_columns, ["ISIN", "Holding ISIN"]
                )
                if benchmark_isin:
                    benchmark_fallback_row = benchmark_fallback_by_isin.get(
                        str(benchmark_isin).strip().lower(), {}
                    )

            used_benchmark_fallback_metrics = False
            used_adr_override_metrics = False
            adr_override_row: dict[str, Any] = {}
            adr_override_columns: list[str] = []
            resolved_country = _pick_value(
                _safe_value(investment_row, investment_columns, ["Business Country", "Country"]),
                _safe_value(
                    benchmark_fallback_row,
                    benchmark_fallback_columns,
                    ["Business Country", "Country"],
                ),
                _pick_value(
                    (benchmark_row or {}).get("country"),
                    (benchmark_row or {}).get("Country"),
                ),
            )
            adr_override_allowed = _country_allows_adr_override(resolved_country)
            explicit_override_rule = find_pfv_pe_override(
                security_name=_pick_value(
                    requested.get("securityName"),
                    _pick_value((benchmark_row or {}).get("name"), (benchmark_row or {}).get("Name")),
                ),
                ticker=requested.get("ticker"),
                country=resolved_country,
            )
            explicit_override_result = None
            if explicit_override_rule is not None:
                explicit_override_result = {
                    "label": explicit_override_rule.get("label"),
                    "secIds": [str(secid) for secid in explicit_override_rule.get("secIds", [])],
                    "priceToFairValue": explicit_override_rule.get("priceToFairValue"),
                    "forwardPE": explicit_override_rule.get("forwardPE"),
                    "metricsBySecId": override_metrics_by_secid,
                }
            price_to_fair_value_override, price_to_fair_value_override_secid = _resolve_override_metric(
                explicit_override_result,
                "priceToFairValue",
            )
            forward_pe_override, forward_pe_override_secid = _resolve_override_metric(
                explicit_override_result,
                "forwardPE",
            )

            def ensure_adr_override_row() -> tuple[dict[str, Any], list[str]]:
                nonlocal adr_override_row, adr_override_columns
                if adr_override_row or adr_override_columns:
                    return adr_override_row, adr_override_columns

                search_names = [
                    requested.get("securityName"),
                    _pick_value((benchmark_row or {}).get("name"), (benchmark_row or {}).get("Name")),
                ]
                for search_name in search_names:
                    normalized_search_name = _normalize_company_name(search_name)
                    if not normalized_search_name:
                        continue

                    cached = adr_override_cache.get(normalized_search_name)
                    if cached is not None:
                        adr_override_row, adr_override_columns = cached
                        if adr_override_row or adr_override_columns:
                            return adr_override_row, adr_override_columns
                        continue

                    adr_candidate = _find_adr_lookup_candidate(md, str(search_name), notes)
                    if adr_candidate is None:
                        adr_override_cache[normalized_search_name] = ({}, [])
                        continue

                    adr_identifier = _build_lookup_identifier(InvestmentIdentifier, adr_candidate)
                    if adr_identifier is None:
                        notes.append(
                            f"ADR override candidate for '{search_name}' had no ISIN or ticker."
                        )
                        adr_override_cache[normalized_search_name] = ({}, [])
                        continue

                    if data_points is None:
                        adr_override_cache[normalized_search_name] = ({}, [])
                        continue

                    try:
                        adr_override_row, adr_override_columns = _fetch_single_investment_row(
                            md,
                            data_points,
                            adr_identifier,
                        )
                    except Exception as exc:
                        notes.append(
                            f"ADR override lookup failed for '{search_name}': {type(exc).__name__}: {exc}"
                        )
                        adr_override_cache[normalized_search_name] = ({}, [])
                        continue
                    adr_override_cache[normalized_search_name] = (
                        adr_override_row,
                        adr_override_columns,
                    )
                    if adr_override_row or adr_override_columns:
                        return adr_override_row, adr_override_columns

                return adr_override_row, adr_override_columns

            def metric_value(*candidates: str, allow_adr_override: bool = False) -> Any:
                nonlocal used_benchmark_fallback_metrics, used_adr_override_metrics
                portfolio_value = _safe_value(investment_row, investment_columns, list(candidates))
                if _has_value(portfolio_value):
                    return portfolio_value

                fallback_value = _safe_value(
                    benchmark_fallback_row, benchmark_fallback_columns, list(candidates)
                )
                if _has_value(fallback_value):
                    used_benchmark_fallback_metrics = True
                    return fallback_value

                if allow_adr_override and adr_override_allowed:
                    override_row, override_columns = ensure_adr_override_row()
                    override_value = _safe_value(override_row, override_columns, list(candidates))
                    if _has_value(override_value):
                        used_adr_override_metrics = True
                        return override_value

                return None

            price_to_fair_value = _pick_value(
                price_to_fair_value_override,
                metric_value(
                "Price To Fair Value",
                "Price to Fair Value",
                "P/FV",
                "Price/Fair Value",
                allow_adr_override=True,
                ),
            )
            moat = metric_value("Economic Moat", "Moat", allow_adr_override=True)
            uncertainty = metric_value(
                "Fair Value Uncertainty",
                "Uncertainty",
            )
            forward_pe = _pick_value(
                forward_pe_override,
                metric_value(
                "Forward Price To Earnings Ratio",
                "Forward Price/Earnings Ratio",
                "Forward P/E",
                "Forward PE",
                allow_adr_override=True,
                ),
            )
            roe = metric_value("Return On Equity-FY", "Return on Equity", "ROE")
            price_to_book = metric_value(
                "Price To Book Ratio",
                "Price/Book",
                "Price to Book",
                "P/B",
            )
            sector = metric_value("Morningstar Sector - display text", "Morningstar Sector", "Sector")
            country = metric_value("Business Country", "Country")

            records.append(
                {
                    "identifier": {
                        "canonicalId": requested.get("canonicalId"),
                        "isin": requested.get("isin"),
                        "cusip": requested.get("cusip"),
                        "sedol": requested.get("sedol"),
                        "ticker": requested.get("ticker"),
                        "securityName": requested.get("securityName"),
                    },
                    "matchedBenchmark": {
                        "name": _pick_value(
                            (benchmark_row or {}).get("name"),
                            (benchmark_row or {}).get("Name"),
                        ),
                        "secId": _pick_value(
                            (benchmark_row or {}).get("secId"),
                            (benchmark_row or {}).get("SecId"),
                        ),
                        "isin": _pick_value(
                            (benchmark_row or {}).get("isin"),
                            (benchmark_row or {}).get("ISIN"),
                        ),
                        "cusip": _pick_value(
                            (benchmark_row or {}).get("cusip"),
                            (benchmark_row or {}).get("CUSIP"),
                        ),
                        "weight": _pick_value(
                            _safe_value(
                                benchmark_row or {},
                                benchmark_columns,
                                ["Weight", "Benchmark Weight", "Weighting"],
                            ),
                            0 if benchmark_match_method in {"off_benchmark", "cash_like"} else None,
                        ),
                    },
                    "benchmarkWeight": _pick_value(
                        _safe_value(
                            benchmark_row or {},
                            benchmark_columns,
                            ["Weight", "Benchmark Weight", "Weighting"],
                        ),
                        0 if benchmark_match_method in {"off_benchmark", "cash_like"} else None,
                    ),
                    "benchmarkMatchMethod": benchmark_match_method,
                    "usedBenchmarkFallbackMetrics": used_benchmark_fallback_metrics,
                    "isCashLike": requested.get("isCashLike"),
                    "priceToFairValue": price_to_fair_value,
                    "moat": moat,
                    "uncertainty": uncertainty,
                    "forwardPE": forward_pe,
                    "pfvOverrideSecId": price_to_fair_value_override_secid,
                    "forwardPEOverrideSecId": forward_pe_override_secid,
                    "roe": roe,
                    "priceToBook": price_to_book,
                    "sector": sector,
                    "country": country,
                }
            )

            if used_benchmark_fallback_metrics:
                benchmark_fallback_metric_rows += 1
            if used_adr_override_metrics:
                adr_override_rows += 1

        response = {
            "records": records,
            "audit": {
                "provider": "morningstar-internal-api",
                "status": "configured",
                "benchmarkInvestmentId": benchmark_id,
                "directDataSetIdOrName": data_set_id or data_set_name,
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
                "unmatchedHoldings": max(
                    len(holdings) - matched_by_isin - matched_by_ticker - cash_like_rows,
                    0,
                ),
                "workbookFallbackRows": 0,
                "benchmarkConstituentCount": len(benchmark_records),
                "benchmarkMatchedExactly": benchmark_matched_exactly,
                "benchmarkMatchedByEquivalent": benchmark_matched_by_equivalent,
                "offBenchmarkRows": off_benchmark_rows,
                "cashLikeRows": cash_like_rows,
                "benchmarkFallbackMetricRows": benchmark_fallback_metric_rows,
                "adrOverrideRows": adr_override_rows,
                "notes": notes,
            },
        }
        if payload.get("includeBenchmarkHoldings"):
            response["benchmarkHoldings"] = {
                "latestDate": latest_benchmark_date,
                "records": [
                    {
                        key: value
                        for key, value in row.items()
                        if not str(key).startswith("_")
                    }
                    for row in benchmark_records
                ],
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
