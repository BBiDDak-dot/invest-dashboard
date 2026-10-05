"""경제지표 수집: FRED, ISM(미국)."""

import datetime as dt
import os

import requests

import db
import ism
from config import FRED_SERIES


def collect_fred(start: dt.date) -> None:
    key = os.environ.get("FRED_API_KEY")
    if not key:
        print("FRED_API_KEY 없음, FRED 건너뜀")
        return
    for sid, name, unit in FRED_SERIES:
        r = requests.get(
            "https://api.stlouisfed.org/fred/series/observations",
            params={"series_id": sid, "api_key": key, "file_type": "json", "observation_start": start.isoformat()},
            timeout=30,
        )
        r.raise_for_status()
        series_id = f"FRED:{sid}"
        db.upsert("macro_series", [{"series_id": series_id, "source": "FRED", "name": name, "unit": unit, "country": "US"}])
        obs = [
            {"series_id": series_id, "date": o["date"], "value": float(o["value"])}
            for o in r.json()["observations"]
            if o["value"] != "."  # 결측치
        ]
        db.upsert("macro_observations", obs)


def collect(start: dt.date) -> None:
    collect_fred(start)
    ism.collect(start)
    # config에서 뺀 지표는 DB에서도 지움 (관측치는 cascade로 함께 삭제)
    keep = [f"FRED:{sid}" for sid, _, _ in FRED_SERIES] + [ism.SERIES_ID]
    db.delete("macro_series", "series_id=not.in.(" + ",".join(f'"{k}"' for k in keep) + ")")
