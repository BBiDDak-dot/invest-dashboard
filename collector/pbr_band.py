"""12M Fwd PBR 밴드용 연간 BPS(실적 + 컨센서스 추정치) 수집. 국내 종목만.

출처: 네이버 증권 모바일 연간 재무(1순위) → FnGuide Financial Highlight(대체).
화면은 이 연간 BPS를 결산월 기준으로 이어 붙여 '오늘부터 12개월 뒤 BPS'를 날짜별로 구함.
지난 기간은 실제 BPS(사후 값)를 씀. 그때그때의 컨센서스 이력은 무료 출처가 없음.
"""

import calendar
import datetime as dt
import re

import requests
from bs4 import BeautifulSoup

import db
import prices

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36"}
BAND_DAYS = 365 * 5 + 30  # 밴드 차트에 쓸 주가 기간(5년)


def _num(s) -> float | None:
    s = re.sub(r"[^\d.\-]", "", str(s or ""))
    try:
        return float(s)
    except ValueError:
        return None


def _fy_end(year: int, month: int) -> str:
    return dt.date(year, month, calendar.monthrange(year, month)[1]).isoformat()


def _naver(code: str, verbose: bool) -> list[dict]:
    r = requests.get(f"https://m.stock.naver.com/api/stock/{code}/finance/annual", headers=UA, timeout=20)
    if verbose:
        print(f"[naver] {code} HTTP {r.status_code} {r.text[:600]}")
    r.raise_for_status()
    info = r.json().get("financeInfo") or {}
    titles = info.get("trTitleList") or []
    row = next((x for x in info.get("rowList") or [] if str(x.get("title", "")).strip().upper().startswith("BPS")), None)
    if not row:
        return []
    out = []
    for t in titles:
        key = str(t.get("key", ""))  # 예: 202512
        m = re.match(r"(\d{4})(\d{2})", key)
        v = _num(((row.get("columns") or {}).get(key) or {}).get("value"))
        if m and v:
            out.append({"fy_end": _fy_end(int(m[1]), int(m[2])), "bps": v, "estimate": t.get("isConsensus") == "Y"})
    return out


def _fnguide(code: str, verbose: bool) -> list[dict]:
    r = requests.get(f"https://comp.fnguide.com/SVO2/ASP/SVD_Main.asp?pGB=1&gicode=A{code}", headers=UA, timeout=20)
    r.encoding = "utf-8"
    if verbose:
        print(f"[fnguide] {code} HTTP {r.status_code} 길이 {len(r.text)}")
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")
    for box in ("highlight_D_Y", "highlight_B_Y"):  # 연결 → 별도
        div = soup.find(id=box)
        table = div and div.find("table")
        if not table:
            continue
        heads = [th.get_text(" ", strip=True) for th in table.select("thead tr")[-1].find_all("th")]
        for tr in table.select("tbody tr"):
            th = tr.find("th")
            if not th or not th.get_text(strip=True).upper().startswith("BPS"):
                continue
            vals = [td.get_text(strip=True) for td in tr.find_all("td")]
            out = []
            for h, v in zip(heads[-len(vals):], vals):
                m = re.search(r"(\d{4})/(\d{2})", h)
                b = _num(v)
                if m and b:
                    out.append({"fy_end": _fy_end(int(m[1]), int(m[2])), "bps": b, "estimate": "(E)" in h or "(P)" in h})
            if verbose:
                print(f"[fnguide] {code} {box} 머리글 {heads} BPS {vals}")
            if out:
                return out
    return []


def _backfill_prices(item: dict) -> None:
    """밴드는 5년치 주가가 필요함. 저장된 주가가 짧으면 한 번 더 받아 둠."""
    first = db.select("prices", f"select=date&ticker=eq.{item['ticker']}&order=date.asc&limit=1") if db.URL else []
    want = dt.date.today() - dt.timedelta(days=BAND_DAYS)
    if first and first[0]["date"] <= (want + dt.timedelta(days=30)).isoformat():
        return
    prices.collect(want, [item], force_start=True)


def collect(verbose_first: bool = True) -> None:
    items = db.select("watchlist", "select=ticker,market,name&market=eq.KR") if db.URL else [{"ticker": "005930", "market": "KR", "name": "삼성전자"}]
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    ok = 0
    for n, w in enumerate(items):
        verbose = verbose_first and n < 2
        rows, src = [], None
        for name, fn in (("naver", _naver), ("fnguide", _fnguide)):
            try:
                got = fn(w["ticker"], verbose)
            except Exception as e:
                print(f"{w['ticker']} {name} 실패: {e}")
                continue
            # 추정치가 더 많은 쪽을 씀(네이버에 컨센서스가 없으면 FnGuide 시도)
            if got and (not rows or sum(r["estimate"] for r in got) > sum(r["estimate"] for r in rows)):
                rows, src = got, name
            if rows and sum(r["estimate"] for r in rows) >= 2:
                break
        if not rows:
            print(f"{w['ticker']} {w['name']} BPS 없음")
            continue
        est = [r["fy_end"][:4] for r in rows if r["estimate"]]
        print(f"{w['ticker']} {w['name']} {src}: {len(rows)}개년, 추정 {est or '없음'}")
        db.upsert("bps_annual", [{"ticker": w["ticker"], **r, "source": src, "updated_at": now} for r in rows])
        try:
            _backfill_prices(w)
        except Exception as e:
            print(f"{w['ticker']} 주가 보충 실패: {e}")
        ok += 1
    print(f"BPS 저장 {ok}/{len(items)}종목")
    if items and ok == 0:
        raise RuntimeError("모든 종목 BPS 수집 실패")


if __name__ == "__main__":
    collect()
