"""KOSPI·KOSDAQ 투자자별 순매수(억원) 수집. 네이버 증권 모바일 API를 날짜별로 호출함."""

import datetime as dt
import time

import requests

import db

URL = "https://m.stock.naver.com/api/index/{market}/trend"
HEADERS = {"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"}
MARKETS = ["KOSPI", "KOSDAQ"]
BACKFILL_DAYS = 3 * 365 + 10  # 화면 최대 기간(3년)만큼 과거를 채워 둠


def _num(s) -> float | None:
    try:
        return float(str(s).replace(",", ""))
    except (TypeError, ValueError):
        return None


def _fetch(market: str, day: dt.date) -> dict | None:
    r = requests.get(URL.format(market=market), params={"bizdate": day.strftime("%Y%m%d")}, headers=HEADERS, timeout=15)
    r.raise_for_status()
    d = r.json()
    if isinstance(d, list):
        d = d[0] if d else None
    if not d or not d.get("bizdate"):
        return None
    b = d["bizdate"]
    return {
        "market": market,
        "date": f"{b[:4]}-{b[4:6]}-{b[6:8]}",
        "individual": _num(d.get("personalValue")),
        "foreigner": _num(d.get("foreignValue")),
        "institution": _num(d.get("institutionalValue")),
    }


def collect(start: dt.date) -> None:
    # 저장된 가장 오래된 날짜가 3년 전보다 늦으면 그 앞을 채움(처음 실행·기간 연장 모두)
    if db.URL:
        first = db.select("market_flows", "select=date&order=date&limit=1")
        oldest = dt.date.fromisoformat(first[0]["date"]) if first else dt.date.today()
        backfill = dt.date.today() - dt.timedelta(days=BACKFILL_DAYS)
        if oldest - backfill > dt.timedelta(days=7):
            start = min(start, backfill)
    for market in MARKETS:
        rows = {}
        day = start
        while day <= dt.date.today():
            if day.weekday() < 5:
                row = _fetch(market, day)
                # 휴장일은 0이나 직전 영업일 값이 오므로 0은 버리고 날짜로 중복 제거
                if row and any(row[k] for k in ("individual", "foreigner", "institution")):
                    rows[row["date"]] = row
                time.sleep(0.1)
            day += dt.timedelta(days=1)
        db.upsert("market_flows", list(rows.values()))
