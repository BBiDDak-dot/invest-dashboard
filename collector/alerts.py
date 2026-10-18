"""상승여력 텔레그램 알림. 관심종목 현재가가 떨어져 목표주가 대비 상승여력이 기준을 넘으면 한 번 알림.

사용법: python alerts.py  (GitHub Actions alerts 워크플로가 장중 30분마다 실행)
필요한 값: SUPABASE_URL, SUPABASE_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
"""

import datetime as dt
import os

import requests

import db

THRESHOLD = {"KR": 50.0, "US": 30.0}  # 상승여력 기준(%)
RESET_GAP = 5.0  # 기준보다 5%p 아래로 내려가면 다시 알릴 수 있게 초기화 (기준 근처에서 오르내릴 때 알림 반복 방지)
SITE = os.environ.get("SITE_URL", "https://invest-dashboard-wheat-sigma.vercel.app")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36"}


def kr_prices(codes: list[str]) -> dict[str, float]:
    if not codes:
        return {}
    r = requests.get(f"https://polling.finance.naver.com/api/realtime/domestic/stock/{','.join(codes)}", headers=UA, timeout=15)
    r.raise_for_status()
    return {d["itemCode"]: float(d["closePriceRaw"]) for d in r.json()["datas"] if float(d.get("closePriceRaw") or 0) > 0}


def us_price(ticker: str) -> float | None:
    r = requests.get(f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?range=1d&interval=5m", headers=UA, timeout=15)
    if not r.ok:
        return None
    res = r.json()["chart"].get("result") or [{}]
    return res[0].get("meta", {}).get("regularMarketPrice")


def send(text: str) -> bool:
    token, chat = os.environ.get("TELEGRAM_BOT_TOKEN"), os.environ.get("TELEGRAM_CHAT_ID")
    if not token or not chat:
        print("[알림] TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID 없음, 보내지 않음:\n" + text)
        return False
    r = requests.post(f"https://api.telegram.org/bot{token}/sendMessage", json={"chat_id": chat, "text": text, "parse_mode": "HTML", "disable_web_page_preview": True}, timeout=15)
    if not r.ok:
        print(f"[알림] 텔레그램 실패 {r.status_code}: {r.text[:200]}")
    return r.ok


def fmt(v: float, market: str) -> str:
    return f"{v:,.0f}원" if market == "KR" else f"${v:,.2f}"


def collect(test: bool = False) -> None:
    items = db.select("watchlist", "select=ticker,market,name,target_price,upside_alert_at&target_price=not.is.null")
    prices = kr_prices([w["ticker"] for w in items if w["market"] == "KR"])
    for w in items:
        if w["market"] == "US":
            p = us_price(w["ticker"])
            if p:
                prices[w["ticker"]] = p
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    sent = 0
    for w in items:
        price, target = prices.get(w["ticker"]), w["target_price"]
        if not price or not target:
            continue
        upside = (target / price - 1) * 100
        limit = THRESHOLD[w["market"]]
        if upside >= limit and not w["upside_alert_at"]:
            text = (
                f"📉 <b>{w['name']}</b> ({w['ticker']}) 상승여력 <b>{upside:.1f}%</b> (기준 {limit:.0f}%)\n"
                f"현재가 {fmt(price, w['market'])} · 목표주가 {fmt(target, w['market'])}\n"
                f"{SITE}/stocks/{w['ticker']}"
            )
            if send(text):
                db.update("watchlist", f"ticker=eq.{w['ticker']}", {"upside_alert_at": now})
                sent += 1
        elif upside < limit - RESET_GAP and w["upside_alert_at"]:
            db.update("watchlist", f"ticker=eq.{w['ticker']}", {"upside_alert_at": None})
    print(f"[알림] {len(items)}종목 확인, {sent}건 발송")
    if test:  # 설정 확인용: 상승여력 상위 종목을 한 번 보냄 (기록은 남기지 않음)
        ups = sorted(((w, (w["target_price"] / prices[w["ticker"]] - 1) * 100) for w in items if prices.get(w["ticker"])), key=lambda x: -x[1])[:5]
        lines = [f"{w['name']} {u:.1f}% (기준 {THRESHOLD[w['market']]:.0f}%)" for w, u in ups]
        send("✅ 삐딱인베스팅 상승여력 알림 연결 확인\n상승여력 상위:\n" + "\n".join(lines))


if __name__ == "__main__":
    import sys

    collect(test="--test" in sys.argv)
