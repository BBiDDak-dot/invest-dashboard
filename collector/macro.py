"""투자 지표 수집: FRED, ISM(미국)."""

import datetime as dt
import os

import requests

import db
import ism
import yfinance as yf

from config import FRED_SERIES, YAHOO_SERIES


def collect_fred(start: dt.date) -> None:
    key = os.environ.get("FRED_API_KEY")
    if not key:
        print("FRED_API_KEY 없음, FRED 건너뜀")
        return
    for sid, name, unit, units in FRED_SERIES:
        params = {"series_id": sid, "api_key": key, "file_type": "json", "observation_start": start.isoformat()}
        if units:
            params["units"] = units
        r = requests.get("https://api.stlouisfed.org/fred/series/observations", params=params, timeout=30)
        r.raise_for_status()
        series_id = f"FRED:{sid}"
        db.upsert("macro_series", [{"series_id": series_id, "source": "FRED", "name": name, "unit": unit, "country": "US"}])
        obs = [
            {"series_id": series_id, "date": o["date"], "value": float(o["value"])}
            for o in r.json()["observations"]
            if o["value"] != "."  # 결측치
        ]
        db.upsert("macro_observations", obs)


def collect_yahoo(start: dt.date) -> None:
    for symbol, name, unit in YAHOO_SERIES:
        df = yf.Ticker(symbol).history(start=start.isoformat(), auto_adjust=False)
        if df.empty:
            raise RuntimeError(f"Yahoo {symbol} 데이터 없음")
        series_id = f"YF:{symbol}"
        db.upsert("macro_series", [{"series_id": series_id, "source": "Yahoo", "name": name, "unit": unit, "country": "US"}])
        db.upsert("macro_observations", [
            {"series_id": series_id, "date": idx.date().isoformat(), "value": round(float(r["Close"]), 4)}
            for idx, r in df.iterrows()
            if r["Close"] == r["Close"]  # NaN 제외
        ])


HISTORY_DAYS = 1100  # 화면에서 3년치를 보여주므로 항상 3년 이상 받음 (새 지표도 바로 채워짐)


def collect(start: dt.date) -> None:
    start = min(start, dt.date.today() - dt.timedelta(days=HISTORY_DAYS))
    collect_fred(start)
    collect_yahoo(start)
    ism.collect(start)
    # config에서 뺀 지표는 DB에서도 지움 (관측치는 cascade로 함께 삭제)
    keep = [f"FRED:{sid}" for sid, *_ in FRED_SERIES] + [f"YF:{s}" for s, *_ in YAHOO_SERIES] + [ism.SERIES_ID]
    db.delete("macro_series", "series_id=not.in.(" + ",".join(f'"{k}"' for k in keep) + ")")
