import json
import logging
import math
import os
from pathlib import Path
from typing import Any

from join_override_rules import (
    PFV_PE_OVERRIDE_RULES,
    find_pfv_pe_override,
    latest_metric_value,
    metric_value,
)


REPO_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_PATH = REPO_ROOT / "outputs" / "benchmark-audit" / "benchmark_audit_data.json"
BENCHMARK_SECID = "F000016KHB"
BATCH_SIZE = 500


def _clear_proxy_environment() -> None:
    for key in [
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "ALL_PROXY",
        "http_proxy",
        "https_proxy",
        "all_proxy",
        "GIT_HTTP_PROXY",
        "GIT_HTTPS_PROXY",
    ]:
        os.environ.pop(key, None)
    os.environ["NO_PROXY"] = "*"


def _load_token_from_files() -> None:
    env_path = REPO_ROOT / ".env.local"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf8").splitlines():
            trimmed = line.strip()
            if not trimmed or trimmed.startswith("#") or "=" not in trimmed:
                continue
            key, value = trimmed.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())

    session_path = REPO_ROOT / ".morningstar-session.json"
    if session_path.exists() and "MD_AUTH_TOKEN" not in os.environ:
        payload = json.loads(session_path.read_text(encoding="utf8"))
        token = payload.get("token") or payload.get("accessToken")
        if token:
            os.environ["MD_AUTH_TOKEN"] = str(token)


def _sanitize(value: Any) -> Any:
    if isinstance(value, float) and math.isnan(value):
        return None
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
    if isinstance(value, dict):
        return {key: _sanitize(child) for key, child in value.items()}
    if isinstance(value, list):
        return [_sanitize(item) for item in value]
    return value


def _chunked(values: list[str], size: int) -> list[list[str]]:
    return [values[index : index + size] for index in range(0, len(values), size)]


def _direct_data_points(as_of_date: str) -> list[dict[str, Any]]:
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


def _override_data_points(as_of_date: str) -> list[dict[str, Any]]:
    return [
        {"datapointId": "OS603"},
        {"datapointId": "ST198"},
    ]


def main() -> int:
    _clear_proxy_environment()
    _load_token_from_files()
    logging.getLogger().setLevel(logging.CRITICAL)
    logging.getLogger("morningstar_data").setLevel(logging.CRITICAL)

    import morningstar_data as md

    holding_dates = md.direct.get_holding_dates(investment_ids=[BENCHMARK_SECID]).to_dict(
        orient="records"
    )
    latest_date = max(str(record.get("date")) for record in holding_dates)
    holdings_frame = md.direct.get_holdings(investments=[BENCHMARK_SECID], date=latest_date)
    holdings_records = holdings_frame.to_dict(orient="records")

    secids = [str(row.get("secId")) for row in holdings_records if row.get("secId")]
    data_points = _direct_data_points(latest_date)
    override_secids = [
        str(secid)
        for rule in PFV_PE_OVERRIDE_RULES
        for secid in rule.get("secIds", [])
        if secid
    ]

    metric_records: list[dict[str, Any]] = []
    for batch in _chunked(secids, BATCH_SIZE):
        frame = md.direct.get_investment_data(
            investments=batch,
            data_points=data_points,
            display_name=True,
        )
        metric_records.extend(frame.to_dict(orient="records"))

    override_records: list[dict[str, Any]] = []
    for batch in _chunked(override_secids, BATCH_SIZE):
        frame = md.direct.get_investment_data(
            investments=batch,
            data_points=_override_data_points(latest_date),
            display_name=True,
        )
        override_records.extend(frame.to_dict(orient="records"))

    metric_by_secid = {str(record.get("Id")): record for record in metric_records if record.get("Id")}
    override_by_secid = {
        str(record.get("Id")): record for record in override_records if record.get("Id")
    }

    benchmark_metric_rows = []
    coverage = {
        "priceToFairValue": 0,
        "moat": 0,
        "uncertainty": 0,
        "sector": 0,
        "country": 0,
        "roe": 0,
        "forwardPE": 0,
        "priceToBook": 0,
    }

    for index, holding in enumerate(holdings_records):
        secid = str(holding.get("secId") or "")
        metrics = metric_by_secid.get(secid, {})
        override_rule = find_pfv_pe_override(
            security_name=str(holding.get("name") or ""),
            ticker=None,
            country=metrics.get("Business Country"),
        )
        override_secid = None
        override_pfv = None
        override_pe = None
        if override_rule is not None:
            override_pfv = override_rule.get("priceToFairValue")
            override_pe = override_rule.get("forwardPE")
            for candidate_secid in override_rule.get("secIds", []):
                candidate_record = override_by_secid.get(str(candidate_secid), {})
                override_pfv = override_pfv if override_pfv is not None else latest_metric_value(
                    candidate_record,
                    "Price To Fair Value ",
                )
                override_pe = override_pe if override_pe is not None else latest_metric_value(
                    candidate_record,
                    "Forward Price To Earnings Ratio ",
                )
                if override_pfv is not None or override_pe is not None:
                    override_secid = str(candidate_secid)
                    break
        row = {
            "Rank": index + 1,
            "Name": holding.get("name"),
            "Benchmark Weight": holding.get("weight"),
            "SecId": holding.get("secId"),
            "ISIN": holding.get("isin"),
            "CUSIP": holding.get("cusip"),
            "Currency": holding.get("currency"),
            "Holding Type": holding.get("detailHoldingType"),
            "Shares": holding.get("shares"),
            "Market Value": holding.get("marketValue"),
            "Price To Fair Value": override_pfv
            if override_pfv is not None
            else metric_value(
                metrics,
                f"Price To Fair Value {latest_date}",
                "Price To Fair Value ",
            ),
            "Economic Moat": metric_value(
                metrics,
                f"Economic Moat {latest_date}",
                "Economic Moat ",
            ),
            "Fair Value Uncertainty": metric_value(
                metrics,
                f"Fair Value Uncertainty {latest_date}",
                "Fair Value Uncertainty ",
            ),
            "Sector": metrics.get("Morningstar Sector - display text")
            or metrics.get("Morningstar Sector"),
            "Business Country": metrics.get("Business Country"),
            "Return On Equity": metrics.get("Return On Equity-FY"),
            "Forward P/E": override_pe
            if override_pe is not None
            else metric_value(
                metrics,
                f"Forward Price To Earnings Ratio {latest_date}",
                "Forward Price To Earnings Ratio ",
            ),
            "Price / Book": metric_value(
                metrics,
                f"Price To Book Ratio {latest_date}",
                "Price To Book Ratio ",
            ),
            "PFV/PE Override SecId": override_secid,
        }

        if row["Price To Fair Value"] is not None:
            coverage["priceToFairValue"] += 1
        if row["Economic Moat"]:
            coverage["moat"] += 1
        if row["Fair Value Uncertainty"]:
            coverage["uncertainty"] += 1
        if row["Sector"]:
            coverage["sector"] += 1
        if row["Business Country"]:
            coverage["country"] += 1
        if row["Return On Equity"] is not None:
            coverage["roe"] += 1
        if row["Forward P/E"] is not None:
            coverage["forwardPE"] += 1
        if row["Price / Book"] is not None:
            coverage["priceToBook"] += 1

        benchmark_metric_rows.append(row)

    total_weight = sum(
        float(row.get("weight"))
        for row in holdings_records
        if row.get("weight") is not None and not math.isnan(float(row.get("weight")))
    )

    payload = {
        "summary": {
            "latestBenchmarkDate": latest_date,
            "benchmarkConstituentCount": len(holdings_records),
            "benchmarkTotalWeight": total_weight,
            "benchmarkMetricCoverage": coverage,
        },
        "benchmarkMetricRows": _sanitize(benchmark_metric_rows),
        "benchmarkRawRows": _sanitize(holdings_records),
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(payload, default=_sanitize, ensure_ascii=True, indent=2), encoding="utf8")
    print(str(OUTPUT_PATH))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
