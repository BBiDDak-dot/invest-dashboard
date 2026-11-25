"""투자 지표 수집: FRED, ISM(미국)."""

import datetime as dt
import os

import requests

import db
import freight
import ism
import oil_curve
import sentiment
import valuation
import yfinance as yf

from config import FRED_SERIES, YAHOO_SERIES


def collect_fred(start: dt.date) -> None:
    key = os.environ.get("FRED_API_KEY")
    if not key:
        print("FRED_API_KEY 없음, FRED 건너뜀")
        return
    for sid, name, unit, units in FRED_SERIES:
        # pc1(전년 대비)은 FRED 변환을 쓰지 않고 원지수로 직접 계산함.
        # FRED 변환은 1년 전 값이 빠지면 결측(.)이 됨 → 2025-10 CPI 미발표(셧다운)로 2026-10이 비었음
        fetch_start = start - dt.timedelta(days=400) if units == "pc1" else start
        params = {"series_id": sid, "api_key": key, "file_type": "json", "observation_start": fetch_start.isoformat()}
        r = requests.get("https://api.stlouisfed.org/fred/series/observations", params=params, timeout=30)
        r.raise_for_status()
        series_id = f"FRED:{sid}"
        db.upsert("macro_series", [{"series_id": series_id, "source": "FRED", "name": name, "unit": unit, "country": "US"}])
        raw = [(o["date"], float(o["value"])) for o in r.json()["observations"] if o["value"] != "."]  # 결측치 제외
        if units == "pc1":
            raw = [(d, v) for d, v in yoy_monthly(raw) if d >= start.isoformat()]
        db.upsert("macro_observations", [{"series_id": series_id, "date": d, "value": v} for d, v in raw])


def _add_months(d: str, n: int) -> str:
    y, m = int(d[:4]), int(d[5:7]) + n
    y, m = y + (m - 1) // 12, (m - 1) % 12 + 1
    return f"{y:04d}-{m:02d}-01"


def yoy_monthly(raw: list[tuple[str, float]]) -> list[tuple[str, float]]:
    """월간 지수 → 전년 동월 대비(%). 한 달만 빠진 값은 앞뒤 달 기하평균으로 채움 (미발표 달 대응)."""
    idx = dict(raw)
    for d in list(idx):
        gap, nxt = _add_months(d, 1), _add_months(d, 2)
        if gap not in idx and nxt in idx:
            idx[gap] = (idx[d] * idx[nxt]) ** 0.5
    return [
        (d, round((v / idx[prev] - 1) * 100, 2))
        for d, v in sorted(idx.items())
        if (prev := _add_months(d, -12)) in idx
    ]


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
    # config에서 뺀 지표는 DB에서도 지움 (관측치는 cascade로 함께 삭제)
    keep = [f"FRED:{sid}" for sid, *_ in FRED_SERIES] + [f"YF:{s}" for s, *_ in YAHOO_SERIES] + [ism.SERIES_ID] + sentiment.SERIES_IDS + valuation.SERIES_IDS + oil_curve.SERIES_IDS + freight.SERIES_IDS
    db.delete("macro_series", "series_id=not.in.(" + ",".join(f'"{k}"' for k in keep) + ")&series_id=not.like.AI:*&series_id=not.like.EXP:*")  # AI·수출 지표는 각 수집기가 관리
    # 한 출처가 실패해도 나머지(특히 심리 지표)는 저장되게 따로 실행
    failed = []
    for name, job in [("FRED", collect_fred), ("Yahoo", collect_yahoo), ("ISM", ism.collect), ("심리 지표", sentiment.collect)]:
        try:
            job(start)
        except Exception as e:
            print(f"[투자지표 {name}] 실패: {e}")
            failed.append(name)
    if failed:
        raise RuntimeError(f"투자지표 실패: {', '.join(failed)}")
