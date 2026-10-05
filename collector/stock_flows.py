"""종목별 외국인·기관 순매수 수집 → 수급 탭의 "외국인 순매수 상위".
네이버 증권의 순매수 상위 페이지가 없어져서, 시가총액 상위 종목(코스피 200·코스닥 150)의
일별 투자자 동향을 받아 순매수 금액(수량 × 종가, 억원 추정)을 저장함."""

import datetime as dt
from concurrent.futures import ThreadPoolExecutor

import requests

import db

HEADERS = {"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"}
UNIVERSE = {"KOSPI": 200, "KOSDAQ": 150}
KEEP_DAYS = 40


def _int(s) -> int | None:
    try:
        return int(str(s).replace(",", "").replace("+", ""))
    except (TypeError, ValueError):
        return None


def _universe(market: str, n: int) -> list[dict]:
    out = []
    page = 1
    while len(out) < n:
        r = requests.get(
            f"https://m.stock.naver.com/api/stocks/marketValue/{market}",
            params={"page": page, "pageSize": 100},
            headers=HEADERS,
            timeout=15,
        )
        r.raise_for_status()
        stocks = r.json().get("stocks") or []
        if not stocks:
            break
        out += [s for s in stocks if s.get("stockEndType") == "stock"]
        page += 1
    return out[:n]


def _trend(code: str, days: int) -> list[dict]:
    r = requests.get(f"https://m.stock.naver.com/api/stock/{code}/trend", params={"pageSize": days}, headers=HEADERS, timeout=15)
    r.raise_for_status()
    return r.json() or []


def collect() -> None:
    # 처음엔 20영업일을 채우고, 그 뒤로는 최근 5영업일만 다시 받음 (정정 반영)
    days = 5 if db.URL and db.select("stock_flows", "select=date&limit=1") else 20
    stocks = [(market, s) for market, n in UNIVERSE.items() for s in _universe(market, n)]

    def rows_of(item: tuple[str, dict]) -> list[dict]:
        market, s = item
        try:
            trend = _trend(s["itemCode"], days)
        except requests.RequestException as e:
            print(f"[종목 수급] {s['stockName']} 실패: {e}")
            return []
        out = []
        for t in trend:
            b, close = t.get("bizdate"), _int(t.get("closePrice"))
            if not b or not close:
                continue
            f, o = _int(t.get("foreignerPureBuyQuant")), _int(t.get("organPureBuyQuant"))
            out.append(
                {
                    "code": s["itemCode"],
                    "date": f"{b[:4]}-{b[4:6]}-{b[6:8]}",
                    "name": s["stockName"],
                    "market": market,
                    "close": close,
                    "foreigner": round(f * close / 1e8, 1) if f is not None else None,
                    "institution": round(o * close / 1e8, 1) if o is not None else None,
                }
            )
        return out

    # 종목마다 요청 1번 → 4개씩 동시에 받음
    with ThreadPoolExecutor(4) as pool:
        rows = [r for rs in pool.map(rows_of, stocks) for r in rs]
    db.upsert("stock_flows", rows)
    db.delete("stock_flows", f"date=lt.{dt.date.today() - dt.timedelta(days=KEEP_DAYS)}")
