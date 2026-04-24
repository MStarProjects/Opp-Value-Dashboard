import json
import math
import os
import re
import sys
from typing import Any

import pandas as pd

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


def _json_safe(value: Any) -> Any:
    if hasattr(value, "item"):
        try:
            value = value.item()
        except Exception:
            pass

    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        return value

    if isinstance(value, dict):
        return {key: _json_safe(item) for key, item in value.items()}

    if isinstance(value, list):
        return [_json_safe(item) for item in value]

    if isinstance(value, tuple):
        return [_json_safe(item) for item in value]

    return value


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
_RETURN_BATCH_SIZE = 500


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


def _build_return_period_window(end_date: str) -> dict[str, pd.Timestamp]:
    end_timestamp = pd.Timestamp(end_date).normalize()
    one_month_start = (end_timestamp - pd.DateOffset(months=1)).normalize()
    month_to_date_start = end_timestamp.replace(day=1)
    year_to_date_start = end_timestamp.replace(month=1, day=1)
    one_year_start = (end_timestamp - pd.DateOffset(years=1)).normalize()

    earliest_start = min(one_month_start, month_to_date_start, year_to_date_start, one_year_start)

    return {
        "end": end_timestamp,
        "fetchStart": (earliest_start - pd.DateOffset(days=7)).normalize(),
        "1M": one_month_start,
        "MTD": month_to_date_start,
        "YTD": year_to_date_start,
        "1Y": one_year_start,
    }


def _find_return_value_column(columns: list[str]) -> str | None:
    explicit = _find_column(columns, ["Daily Return", "Return"])
    if explicit:
        return explicit

    for column in columns:
        if _normalize(column) not in {"id", "date", "name"}:
            return column

    return None


def _compute_period_return_from_index(
    values: list[tuple[pd.Timestamp, float]],
    start_timestamp: pd.Timestamp,
    end_timestamp: pd.Timestamp,
) -> float | None:
    if not values:
        return None

    start_candidates = [value for timestamp, value in values if timestamp <= start_timestamp]
    end_candidates = [value for timestamp, value in values if timestamp <= end_timestamp]
    if not start_candidates or not end_candidates:
        return None

    start_value = float(start_candidates[-1])
    end_value = float(end_candidates[-1])
    if start_value == 0:
        return None

    return ((end_value / start_value) - 1) * 100


def _summarize_return_rows(
    rows: list[dict[str, Any]],
    columns: list[str],
    return_window: dict[str, pd.Timestamp],
) -> dict[str, dict[str, float | None]]:
    id_column = _find_column(columns, ["ID", "Id"])
    date_column = _find_column(columns, ["Date"])
    value_column = _find_return_value_column(columns)

    if not id_column or not date_column or not value_column:
        return {}

    grouped_rows: dict[str, list[tuple[pd.Timestamp, float]]] = {}
    for row in rows:
        security_id = row.get(id_column)
        date_value = row.get(date_column)
        return_value = row.get(value_column)

        if not security_id or not _has_value(date_value) or not _has_value(return_value):
            continue

        try:
            timestamp = pd.Timestamp(date_value).normalize()
            numeric_return = float(return_value)
        except Exception:
            continue

        normalized_security_id = str(security_id).strip()
        if not normalized_security_id:
            continue

        grouped_rows.setdefault(normalized_security_id, []).append((timestamp, numeric_return))

    period_field_map = {
        "1M": "apiReturn1M",
        "MTD": "apiReturnMtd",
        "YTD": "apiReturnYtd",
        "1Y": "apiReturn1Y",
    }

    results: dict[str, dict[str, float | None]] = {}
    end_timestamp = return_window["end"]
    for security_id, values in grouped_rows.items():
        ordered_values = sorted(values, key=lambda item: item[0])
        metrics: dict[str, float | None] = {}

        for period_key, field_name in period_field_map.items():
            metrics[field_name] = _compute_period_return_from_index(
                ordered_values,
                return_window[period_key],
                end_timestamp,
            )

        results[security_id] = metrics

    return results


def _fetch_return_metrics_by_security(
    md: Any,
    security_ids: list[str],
    end_date: str,
    notes: list[str],
) -> dict[str, dict[str, float | None]]:
    unique_security_ids = [security_id for security_id in dict.fromkeys(security_ids) if security_id]
    if not unique_security_ids:
        return {}

    return_window = _build_return_period_window(end_date)
    rows: list[dict[str, Any]] = []
    columns: list[str] = []

    for index in range(0, len(unique_security_ids), _RETURN_BATCH_SIZE):
        batch = unique_security_ids[index : index + _RETURN_BATCH_SIZE]
        try:
            frame = md.direct.get_returns(
                investments=batch,
                start_date=return_window["fetchStart"].strftime("%Y-%m-%d"),
                end_date=end_date,
                freq=md.direct.data_type.Frequency.daily,
            )
            if not columns:
                columns = list(frame.columns)
            rows.extend(frame.to_dict(orient="records"))
        except Exception as exc:
            notes.append(
                f"Daily return batch failed for {len(batch)} securities; retrying individually. "
                f"Reason: {type(exc).__name__}: {exc}"
            )
            for security_id in batch:
                try:
                    frame = md.direct.get_returns(
                        investments=[security_id],
                        start_date=return_window["fetchStart"].strftime("%Y-%m-%d"),
                        end_date=end_date,
                        freq=md.direct.data_type.Frequency.daily,
                    )
                    if not columns:
                        columns = list(frame.columns)
                    rows.extend(frame.to_dict(orient="records"))
                except Exception as single_exc:
                    notes.append(
                        f"Daily return lookup failed for {security_id}: "
                        f"{type(single_exc).__name__}: {single_exc}"
                    )

    metrics_by_security = _summarize_return_rows(rows, columns, return_window)
    notes.append(
        f"Loaded API return series for {len(metrics_by_security)} securities using daily Morningstar returns."
    )
    return metrics_by_security


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
                "1M/MTD/YTD/1Y returns",
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
        print(json.dumps(_json_safe(response), default=_json_default, allow_nan=False))
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
            print(json.dumps(_json_safe(response), default=_json_default, allow_nan=False))
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

        benchmark_metric_rows: list[dict[str, Any]] = []
        benchmark_metric_columns: list[str] = []
        benchmark_metric_record_indices: list[int] = []
        if benchmark_records and data_points is not None:
            benchmark_metric_identifiers = []
            for index, benchmark_record in enumerate(benchmark_records):
                identifier = _build_lookup_identifier(InvestmentIdentifier, benchmark_record)
                if identifier is None:
                    continue
                benchmark_metric_identifiers.append(identifier)
                benchmark_metric_record_indices.append(index)

            if benchmark_metric_identifiers:
                try:
                    benchmark_metric_rows, benchmark_metric_columns = _fetch_investment_rows_batched(
                        md,
                        data_points,
                        benchmark_metric_identifiers,
                    )
                except Exception as exc:
                    notes.append(
                        "Benchmark constituent metric enrichment partially failed; continuing with raw benchmark weights. "
                        f"Reason: {type(exc).__name__}: {exc}"
                    )

            for metric_row_index, benchmark_record_index in enumerate(benchmark_metric_record_indices):
                metric_row = (
                    benchmark_metric_rows[metric_row_index]
                    if metric_row_index < len(benchmark_metric_rows)
                    else {}
                )
                benchmark_record = benchmark_records[benchmark_record_index]

                metric_country = _pick_value(
                    _safe_value(metric_row, benchmark_metric_columns, ["Business Country", "Country"]),
                    benchmark_record.get("country"),
                    benchmark_record.get("Country"),
                )
                metric_ticker = _pick_value(
                    _safe_value(metric_row, benchmark_metric_columns, ["Ticker"]),
                    benchmark_record.get("ticker"),
                    benchmark_record.get("Ticker"),
                )
                explicit_override_rule = find_pfv_pe_override(
                    security_name=_pick_value(
                        benchmark_record.get("name"),
                        benchmark_record.get("Name"),
                    ),
                    ticker=metric_ticker,
                    country=metric_country,
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
                benchmark_pfv_override, _ = _resolve_override_metric(
                    explicit_override_result,
                    "priceToFairValue",
                )
                benchmark_forward_pe_override, _ = _resolve_override_metric(
                    explicit_override_result,
                    "forwardPE",
                )

                benchmark_record["secId"] = _pick_value(
                    benchmark_record.get("secId"),
                    metric_row.get("Id"),
                    metric_row.get("SecId"),
                )
                benchmark_record["ticker"] = metric_ticker
                benchmark_record["country"] = metric_country
                benchmark_record["sector"] = _pick_value(
                    _safe_value(
                        metric_row,
                        benchmark_metric_columns,
                        [
                            "Morningstar Sector - display text",
                            "Morningstar Sector",
                            "Sector",
                        ],
                    ),
                    benchmark_record.get("gicsSector"),
                    benchmark_record.get("GICS Sector"),
                    benchmark_record.get("sector"),
                    benchmark_record.get("Sector"),
                )
                benchmark_record["priceToFairValue"] = _pick_value(
                    benchmark_pfv_override,
                    _safe_value(
                        metric_row,
                        benchmark_metric_columns,
                        [
                            "Price To Fair Value",
                            "Price to Fair Value",
                            "P/FV",
                            "Price/Fair Value",
                        ],
                    ),
                )
                benchmark_record["forwardPE"] = _pick_value(
                    benchmark_forward_pe_override,
                    _safe_value(
                        metric_row,
                        benchmark_metric_columns,
                        [
                            "Forward Price To Earnings Ratio",
                            "Forward Price/Earnings Ratio",
                            "Forward P/E",
                            "Forward PE",
                        ],
                    ),
                )
                benchmark_record["priceToBook"] = _safe_value(
                    metric_row,
                    benchmark_metric_columns,
                    ["Price To Book Ratio", "Price/Book", "Price to Book", "P/B"],
                )
                benchmark_record["roe"] = _safe_value(
                    metric_row,
                    benchmark_metric_columns,
                    ["Return On Equity-FY", "Return on Equity", "ROE"],
                )
                benchmark_record["moat"] = _safe_value(
                    metric_row,
                    benchmark_metric_columns,
                    ["Economic Moat", "Moat"],
                )
                benchmark_record["uncertainty"] = _safe_value(
                    metric_row,
                    benchmark_metric_columns,
                    ["Fair Value Uncertainty", "Uncertainty"],
                )

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

        return_security_ids = [
            str(security_id).strip()
            for security_id in [
                _pick_value(record.get("secId"), record.get("SecId"))
                for record in benchmark_records
            ]
            if security_id
        ]
        return_security_ids.extend(
            str(security_id).strip()
            for security_id in [
                _pick_value(record.get("Id"), record.get("SecId"))
                for record in investment_row_by_canonical_id.values()
            ]
            if security_id
        )

        api_return_metrics_by_security: dict[str, dict[str, float | None]] = {}
        if return_security_ids:
            try:
                api_return_metrics_by_security = _fetch_return_metrics_by_security(
                    md,
                    return_security_ids,
                    latest_benchmark_date,
                    notes,
                )
            except Exception as exc:
                notes.append(
                    "API return enrichment failed; attribution will remain unavailable until returns can be pulled live. "
                    f"Reason: {type(exc).__name__}: {exc}"
                )

        for benchmark_record in benchmark_records:
            benchmark_security_id = _pick_value(
                benchmark_record.get("secId"),
                benchmark_record.get("SecId"),
            )
            if not benchmark_security_id:
                continue

            return_metrics = api_return_metrics_by_security.get(str(benchmark_security_id).strip(), {})
            benchmark_record["apiReturn1M"] = return_metrics.get("apiReturn1M")
            benchmark_record["apiReturnMtd"] = return_metrics.get("apiReturnMtd")
            benchmark_record["apiReturnYtd"] = return_metrics.get("apiReturnYtd")
            benchmark_record["apiReturn1Y"] = return_metrics.get("apiReturn1Y")

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
            investment_security_id = _pick_value(
                investment_row.get("Id"),
                investment_row.get("SecId"),
            )
            api_return_metrics = (
                api_return_metrics_by_security.get(str(investment_security_id).strip(), {})
                if investment_security_id
                else {}
            )

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
            moat_override, _ = _resolve_override_metric(
                explicit_override_result,
                "moat",
            )
            uncertainty_override, _ = _resolve_override_metric(
                explicit_override_result,
                "uncertainty",
            )

            def ensure_adr_override_row() -> tuple[dict[str, Any], list[str]]:
                nonlocal adr_override_row, adr_override_columns
                if adr_override_row or adr_override_columns:
                    return adr_override_row, adr_override_columns

                if explicit_override_result is not None:
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
            moat = _pick_value(
                moat_override,
                metric_value("Economic Moat", "Moat", allow_adr_override=True),
            )
            uncertainty = _pick_value(
                uncertainty_override,
                metric_value(
                    "Fair Value Uncertainty",
                    "Uncertainty",
                    allow_adr_override=True,
                ),
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
            sector = _pick_value(
                metric_value(
                    "Morningstar Sector - display text",
                    "Morningstar Sector",
                    "Sector",
                ),
                _pick_value(
                    (benchmark_row or {}).get("gicsSector"),
                    (benchmark_row or {}).get("GICS Sector"),
                    (benchmark_row or {}).get("sector"),
                    (benchmark_row or {}).get("Sector"),
                ),
            )
            country = _pick_value(
                metric_value("Business Country", "Country"),
                _pick_value(
                    (benchmark_row or {}).get("country"),
                    (benchmark_row or {}).get("Country"),
                    (benchmark_row or {}).get("businessCountry"),
                    (benchmark_row or {}).get("Business Country"),
                ),
            )

            records.append(
                {
                    "identifier": {
                        "canonicalId": requested.get("canonicalId"),
                        "isin": requested.get("isin"),
                        "cusip": requested.get("cusip"),
                        "sedol": requested.get("sedol"),
                        "secid": investment_security_id,
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
                    "apiReturn1M": api_return_metrics.get("apiReturn1M"),
                    "apiReturnMtd": api_return_metrics.get("apiReturnMtd"),
                    "apiReturnYtd": api_return_metrics.get("apiReturnYtd"),
                    "apiReturn1Y": api_return_metrics.get("apiReturn1Y"),
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
                    "1M/MTD/YTD/1Y returns",
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

        print(json.dumps(_json_safe(response), default=_json_default, allow_nan=False))
        return 0
    except Exception as exc:
        response = _build_stub_response(
            payload,
            notes + [f"Morningstar SDK request failed: {type(exc).__name__}: {exc}"],
        )
        print(json.dumps(_json_safe(response), default=_json_default, allow_nan=False))
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
