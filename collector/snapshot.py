"""일반 계좌 순자산 스냅숏: 보유 종목(관심종목 quantity) × 최근 종가 + 현금을 그날(KST) 날짜로 저장.

연도별 수익률은 전년 마지막 스냅숏을 기준으로 화면에서 계산함. 퇴직연금은 넣지 않음.
"""

import datetime as dt

import requests

import db

FX_SERIES = "YF:KRW=X"


def collect() -> None:
    if not db.URL:
        return
    held = [w for w in db.select("watchlist", "select=ticker,market,quantity&quantity=gt.0") if float(w["quantity"] or 0) > 0]
    close = {p["ticker"]: float(p["close"]) for p in db.select("latest_prices", "select=ticker,close")}
    fx_rows = db.select("macro_observations", f"select=value&series_id=eq.{FX_SERIES}&order=date.desc&limit=1")
    fx = float(fx_rows[0]["value"]) if fx_rows else None
    cash_rows = db.select("settings", "select=value&key=eq.cash_krw")
    cash = float(cash_rows[0]["value"]) if cash_rows else 0.0

    stock = 0.0
    for w in held:
        price = close.get(w["ticker"])
        rate = fx if w["market"] == "US" else 1.0
        if price is None or rate is None:
            print(f"{w['ticker']} 종가·환율 없음: 스냅숏을 건너뜀")
            return  # 빠진 종목이 있으면 순자산이 틀어지므로 저장하지 않음
        stock += price * float(w["quantity"]) * rate

    today = (dt.datetime.utcnow() + dt.timedelta(hours=9)).date().isoformat()
    row = {"snap_date": today, "net_worth": round(stock + cash), "stock_krw": round(stock), "cash_krw": round(cash), "updated_at": dt.datetime.utcnow().isoformat() + "Z"}
    try:
        db.upsert("portfolio_snapshots", [row])
    except requests.HTTPError as e:  # 019 SQL 실행 전이면 다른 수집을 실패로 만들지 않음
        print(f"portfolio_snapshots 저장 실패(019_portfolio_snapshots.sql 실행 필요?): {e}")
