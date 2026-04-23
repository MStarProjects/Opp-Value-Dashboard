import re
from typing import Any


PFV_PE_OVERRIDE_RULES = [
    {
        "label": "Itau Unibanco Holding SA",
        "country": "Brazil",
        "tickers": ["ITUB"],
        "secIds": ["0P0000B0YE"],
        "aliases": ["itau unibanco"],
        "priceToFairValue": 1.34,
        "forwardPE": 9.96,
    },
    {
        "label": "Vale SA",
        "country": "Brazil",
        "tickers": ["VALE"],
        "secIds": ["0P0000BX47"],
        "aliases": ["vale"],
        "priceToFairValue": 1.16,
        "forwardPE": 8.39,
    },
    {
        "label": "Petroleo Brasileiro SA Petrobras",
        "country": "Brazil",
        "tickers": ["PBR"],
        "secIds": ["0P0000BITA", "0P0000CGWR"],
        "aliases": ["petroleo brasileiro", "petrobras"],
        "priceToFairValue": 1.46,
        "forwardPE": 7.66,
    },
    {
        "label": "Bank Bradesco SA",
        "country": "Brazil",
        "tickers": ["BBD"],
        "secIds": ["0P0000C5JN", "0P0000BJC2"],
        "aliases": ["bradesco"],
        "priceToFairValue": 1.16,
        "forwardPE": 9.95,
    },
    {
        "label": "Ambev SA",
        "country": "Brazil",
        "tickers": ["ABEV"],
        "secIds": ["0P0000BNIX"],
        "aliases": ["ambev"],
        "priceToFairValue": 0.85,
        "forwardPE": 14.58,
    },
    {
        "label": "Telefonica Brasil SA",
        "country": "Brazil",
        "tickers": ["VIV"],
        "secIds": ["0P0000CE63"],
        "aliases": ["telefonica brasil"],
        "priceToFairValue": 1.16,
        "forwardPE": 15.50,
    },
    {
        "label": "TIM SA Ordinary Shares",
        "country": "Brazil",
        "tickers": ["TIMB"],
        "secIds": ["0P0000B8WD"],
        "aliases": ["tim sa", "tim ordinary"],
        "priceToFairValue": 1.11,
        "forwardPE": 12.09,
    },
    {
        "label": "Fomento Economico Mexicano SAB",
        "country": "Mexico",
        "tickers": ["FMX"],
        "secIds": ["0P0000C946"],
        "aliases": ["fomento economico mexicano", "femsa"],
        "priceToFairValue": 1.03,
        "forwardPE": 124.73,
    },
    {
        "label": "America Movil SAB de CV Ordinary",
        "country": "Mexico",
        "tickers": ["AMX"],
        "secIds": ["0P0000CDQY"],
        "aliases": ["america movil"],
        "priceToFairValue": 1.12,
        "forwardPE": 12.90,
    },
    {
        "label": "Arca Continental SAB de CV Class B",
        "country": "Mexico",
        "tickers": ["AC"],
        "secIds": ["0P0000BJ9W"],
        "aliases": ["arca continental"],
        "priceToFairValue": 0.83,
        "forwardPE": 19.40,
    },
    {
        "label": "Coca-Cola Femsa SAB de CV CPO",
        "country": "Mexico",
        "tickers": ["KOF"],
        "secIds": ["0P0001H98U"],
        "aliases": ["coca cola femsa", "coca-cola femsa"],
        "priceToFairValue": 0.99,
        "forwardPE": 118.52,
    },
]


def normalize_company_name(value: str | None) -> str:
    normalized = str(value or "").lower()
    normalized = normalized.replace("&", " and ")
    normalized = re.sub(r"[.,()/\\-]", " ", normalized)
    normalized = re.sub(r"[^a-z0-9 ]+", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def find_pfv_pe_override(
    *,
    security_name: str | None,
    ticker: str | None,
    country: Any,
) -> dict[str, Any] | None:
    normalized_country = str(country or "").strip().lower()
    normalized_name = normalize_company_name(security_name)
    normalized_ticker = str(ticker or "").strip().lower()

    for rule in PFV_PE_OVERRIDE_RULES:
        if normalized_country != str(rule.get("country", "")).strip().lower():
            continue

        if normalized_ticker and normalized_ticker in {
            str(candidate).strip().lower() for candidate in rule.get("tickers", [])
        }:
            return rule

        if normalized_name and any(
            alias in normalized_name for alias in rule.get("aliases", [])
        ):
            return rule

    return None


def metric_value(record: dict[str, Any], exact: str, prefix: str | None = None) -> Any:
    if exact in record and record[exact] not in (None, ""):
        return record[exact]
    if prefix:
        for key, value in record.items():
            if str(key).startswith(prefix) and value not in (None, ""):
                return value
    return None


def latest_metric_value(record: dict[str, Any], prefix: str) -> Any:
    candidates = [
        (str(key), value)
        for key, value in record.items()
        if str(key).startswith(prefix) and value not in (None, "")
    ]
    if not candidates:
        return None

    candidates.sort(key=lambda item: item[0])
    return candidates[-1][1]
