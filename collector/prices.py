"""관심종목 일별 종가 수집 (yfinance). 국내 종목은 .KS(코스피) → .KQ(코스닥) 순으로 시도함."""

import datetime as dt

import yfinance as yf

import db


def _history(ticker: str, market: str, start: dt.date):
    candidates = [ticker] if market == "US" else [f"{ticker}.KS", f"{ticker}.KQ"]
    for symbol in candidates:
        df = yf.Ticker(symbol).history(start=start.isoformat(), auto_adjust=False)
        if not df.empty:
            return df
    return None


BACKFILL_DAYS = 400  # 새로 추가된 종목은 1년치 이상 채움 (차트용)


def collect(start: dt.date, watchlist: list[dict]) -> None:
    has_prices = {p["ticker"] for p in db.select("latest_prices", "select=ticker")} if db.URL else set()
    for w in watchlist:
        since = start if w["ticker"] in has_prices else dt.date.today() - dt.timedelta(days=BACKFILL_DAYS)
        df = _history(w["ticker"], w["market"], min(start, since) - dt.timedelta(days=7))
        if df is None:
            print(f"{w['ticker']} 시세 없음")
            continue
        # 첫 행은 전일 종가가 없어 등락률을 못 구하므로 버림(기존 값을 null로 덮어쓰지 않도록)
        df["change_pct"] = df["Close"].pct_change() * 100
        df = df.dropna(subset=["change_pct"])
        rows = [
            {
                "ticker": w["ticker"],
                "date": idx.date().isoformat(),
                "close": round(float(r["Close"]), 4),
                "change_pct": round(float(r["change_pct"]), 4),
                "volume": int(r["Volume"]),
            }
            for idx, r in df.iterrows()
        ]
        db.upsert("prices", rows)
