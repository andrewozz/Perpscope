"""
Alternative.me Fear & Greed Index extractor.
"""
from __future__ import annotations

import datetime as dt

import requests

from .. import config


def _today() -> str:
    return dt.datetime.now(dt.timezone.utc).date().isoformat()


def fetch_feargreed(limit: int = 0) -> list[dict]:
    """Full Fear & Greed history in one call (limit=0 = all available days).

    Feeds: fct_fear_greed. Small payload (~2KB), so we re-pull the full
    history every day; staging dedupes by `date`, keeping the latest load.
    """
    r = requests.get(config.FNG_URL, params={"limit": limit}, timeout=config.REQUEST_TIMEOUT)
    r.raise_for_status()
    data = r.json().get("data", [])
    snap = _today()

    records = []
    for row in data:
        try:
            date = dt.datetime.fromtimestamp(
                int(row["timestamp"]), tz=dt.timezone.utc
            ).date().isoformat()
            records.append({
                "snapshot_date": snap,
                "date": date,
                "fng_value": int(row["value"]),
                "fng_classification": row["value_classification"],
            })
        except (KeyError, TypeError, ValueError):
            continue
    return records
