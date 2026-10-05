"""경제지표 수집: FRED(미국), ECOS(한국은행)."""

import datetime as dt
import os

import requests

import db
from config import ECOS_SERIES, FRED_SERIES


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


def _ecos_period(d: dt.date, cycle: str) -> str:
    return {"D": d.strftime("%Y%m%d"), "M": d.strftime("%Y%m"), "Q": f"{d.year}Q{(d.month - 1) // 3 + 1}", "A": str(d.year)}[cycle]


def _ecos_date(t: str, cycle: str) -> str:
    if cycle == "D":
        return f"{t[:4]}-{t[4:6]}-{t[6:8]}"
    if cycle == "M":
        return f"{t[:4]}-{t[4:6]}-01"
    if cycle == "Q":
        return f"{t[:4]}-{(int(t[5]) - 1) * 3 + 1:02d}-01"
    return f"{t[:4]}-01-01"


def collect_ecos(start: dt.date) -> None:
    key = os.environ.get("ECOS_API_KEY")
    if not key:
        print("ECOS_API_KEY 없음, ECOS 건너뜀")
        return
    today = dt.date.today()
    for code, cycle, item, name, unit in ECOS_SERIES:
        url = (
            f"https://ecos.bok.or.kr/api/StatisticSearch/{key}/json/kr/1/10000/"
            f"{code}/{cycle}/{_ecos_period(start, cycle)}/{_ecos_period(today, cycle)}/{item}"
        )
        data = requests.get(url, timeout=30).json()
        rows = data.get("StatisticSearch", {}).get("row", [])
        if not rows:
            print(f"ECOS {code} 결과 없음: {data.get('RESULT')}")
            continue
        series_id = f"ECOS:{code}/{cycle}/{item}"
        db.upsert("macro_series", [{"series_id": series_id, "source": "ECOS", "name": name, "unit": unit, "country": "KR"}])
        db.upsert(
            "macro_observations",
            [{"series_id": series_id, "date": _ecos_date(r["TIME"], cycle), "value": float(r["DATA_VALUE"])} for r in rows],
        )


def collect(start: dt.date) -> None:
    collect_fred(start)
    collect_ecos(start)
