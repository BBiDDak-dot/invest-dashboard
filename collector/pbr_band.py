"""12M Fwd PBR 밴드용 연간 BPS(실적 + 컨센서스 추정치) 수집. 국내 종목만.

출처: 네이버 증권 기업정보(와이즈리포트) Financial Summary 연간(실적 5년 + 추정 3개년) → 네이버 모바일 연간 재무(대체).
그보다 오래된 해(2015년~)는 DART 사업보고서 지배주주 자본 ÷ 유통주식수(분할 수정)로 계산해 이어 붙임(종목당 한 번).
(FnGuide 메인 페이지는 Actions에서 '페이지 없음'으로 막혀 안 씀.)
화면은 이 연간 BPS를 결산월 기준으로 이어 붙여 '오늘부터 12개월 뒤 BPS'를 날짜별로 구함.
지난 기간은 실제 BPS(사후 값)를 씀. 그때그때의 컨센서스 이력은 무료 출처가 없음.
"""

import calendar
import datetime as dt
import os
import re
import math

import requests
from bs4 import BeautifulSoup

import db
import prices

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36"}
HIST_FROM = 2015  # DART로 채우는 가장 오래된 결산 연도(주식총수 공시가 2015년부터)
BAND_START = dt.date(HIST_FROM - 1, 1, 1)  # 밴드 차트 주가 시작(12M Fwd라 첫 결산 1년 전부터 그림)
DART = "https://opendart.fss.or.kr/api"


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


def _bps_from_tables(html: str) -> list[dict]:
    """재무 요약 표(머리글에 2025/12, 2026/12(E) 같은 열)에서 BPS 행을 뽑음. 첫 번째로 찾은 표를 씀."""
    soup = BeautifulSoup(html, "html.parser")
    for table in soup.find_all("table"):
        heads = [th.get_text(" ", strip=True) for th in table.find_all("th")]
        years = [h for h in heads if re.search(r"\d{4}/\d{2}", h)]
        if not years:
            continue
        for tr in table.find_all("tr"):
            th = tr.find("th")
            if not th or not th.get_text(strip=True).upper().startswith("BPS"):
                continue
            vals = [td.get_text(strip=True) for td in tr.find_all("td")]
            out = []
            n = min(len(years), len(vals))  # 오른쪽 끝을 맞춰 짝지음
            for h, v in zip(years[-n:], vals[-n:]):
                m = re.search(r"(\d{4})/(\d{2})", h)
                b = _num(v)
                if m and b:
                    out.append({"fy_end": _fy_end(int(m[1]), int(m[2])), "bps": b, "estimate": "(E)" in h or "(P)" in h})
            if out:
                return out
    return []


def _wisereport(code: str, verbose: bool) -> list[dict]:
    """네이버 증권 '기업정보'(와이즈리포트) Financial Summary 연간. 보통 추정 3개년까지 있음."""
    page_url = f"https://navercomp.wisereport.co.kr/v2/company/c1010001.aspx?cmp_cd={code}"
    page = requests.get(page_url, headers=UA, timeout=20)
    enc = re.search(r"encparam\s*:\s*'([^']+)'", page.text)
    cid = re.search(r"\bid\s*:\s*'([^']+)'", page.text)
    if verbose:
        print(f"[wisereport] {code} HTTP {page.status_code} encparam {bool(enc)} id {bool(cid)}")
    if not enc:
        return []
    r = requests.get(
        "https://navercomp.wisereport.co.kr/v2/company/ajax/cF1001.aspx",
        params={"cmp_cd": code, "fin_typ": "0", "freq_typ": "Y", "encparam": enc[1], "id": cid[1] if cid else ""},
        headers={**UA, "Referer": page_url},
        timeout=20,
    )
    out = _bps_from_tables(r.text)
    if verbose:
        print(f"[wisereport] {code} ajax HTTP {r.status_code} 길이 {len(r.text)} → {out}")
        if not out:
            print(r.text[:800])
    return out


def _dart_rows(key: str, corp: str, path: str, **params) -> list[dict]:
    r = requests.get(f"{DART}/{path}.json", params={"crtfc_key": key, "corp_code": corp, **params}, timeout=30)
    j = r.json()
    return j.get("list") or [] if j.get("status") == "000" else []


def _dart_equity(key: str, corp: str, year: int) -> tuple[str, float] | None:
    """사업보고서 재무상태표의 지배주주 자본(연결, 없으면 별도 자본총계)과 결산일."""
    for fs in ("CFS", "OFS"):
        rows = [x for x in _dart_rows(key, corp, "fnlttSinglAcntAll", bsns_year=year, reprt_code="11011", fs_div=fs) if x.get("sj_div") == "BS"]
        if not rows:
            continue
        pick = None
        if fs == "CFS":
            pick = next((x for x in rows if x.get("account_id") == "ifrs-full_EquityAttributableToOwnersOfParent"), None) or next(
                (x for x in rows if re.search(r"지배기업.*(소유주|지분)|지배주주", x.get("account_nm", "")) and "비지배" not in x.get("account_nm", "")), None
            )
        if not pick:
            pick = next((x for x in rows if x.get("account_id") == "ifrs-full_Equity"), None) or next(
                (x for x in rows if re.sub(r"\s", "", x.get("account_nm", "")) == "자본총계"), None
            )
        v = _num(pick and pick.get("thstrm_amount"))
        if not v:
            continue
        m = re.search(r"(\d{4})\.(\d{2})\.(\d{2})", pick.get("thstrm_dt") or "")
        fy_end = f"{m[1]}-{m[2]}-{m[3]}" if m else f"{year}-12-31"
        return fy_end, v
    return None


def _dart_shares(key: str, corp: str, year: int) -> float | None:
    """사업보고서 주식총수 현황: 유통주식수(발행−자기주식), 보통+우선 합계."""
    rows = _dart_rows(key, corp, "stockTotqySttus", bsns_year=year, reprt_code="11011")
    row = next((x for x in rows if "합계" in (x.get("se") or "")), None) or next((x for x in rows if "보통" in (x.get("se") or "")), None)
    if not row:
        return None
    v = _num(row.get("distb_stock_co"))
    if not v:
        a, b = _num(row.get("istc_totqy")), _num(row.get("tesstk_co")) or 0
        v = a - b if a else None
    return v


_splits: dict[str, list[tuple[str, float]]] = {}


def _split_factor(ticker: str, fy_end: str) -> float:
    """결산일 이후 액면분할·무상증자 배수. 야후 주가가 분할 수정돼 있어 과거 BPS도 같은 기준으로 맞춤."""
    if ticker not in _splits:
        import yfinance as yf

        _splits[ticker] = []
        for sym in (f"{ticker}.KS", f"{ticker}.KQ"):
            try:
                sp = yf.Ticker(sym).splits
            except Exception:
                continue
            if sp is not None and len(sp):
                _splits[ticker] = [(d.date().isoformat(), float(r)) for d, r in sp.items() if r > 0]
                print(f"{ticker} 야후 분할 이력 {_splits[ticker]}")
                break
    f = 1.0
    for d, ratio in _splits[ticker]:
        if d > fy_end:
            f *= ratio
    return f


def _dart_history(w: dict, recent: list[dict], verbose: bool) -> list[dict]:
    """2015년~와이즈리포트 첫 실적 연도까지 DART로 BPS를 계산. 와이즈리포트와 겹치는 해의 비율로 맞춰 이어 붙임."""
    key = os.environ.get("DART_API_KEY")
    if not key or not w.get("corp_code"):
        return []
    actual = {r["fy_end"][:4]: r["bps"] for r in recent if not r["estimate"]}
    if not actual:
        return []
    last = min(int(y) for y in actual) + 1  # 겹치는 해 2개로 비율 확인
    out = []
    for year in range(HIST_FROM, last + 1):
        try:
            eq, sh = _dart_equity(key, w["corp_code"], year), _dart_shares(key, w["corp_code"], year)
        except Exception as e:
            print(f"{w['ticker']} DART {year} 실패: {e}")
            continue
        if not eq or not sh:
            continue
        fy_end, equity = eq
        out.append({"fy_end": fy_end, "bps": equity / (sh * _split_factor(w["ticker"], fy_end)), "estimate": False})
    ratios = [actual[r["fy_end"][:4]] / r["bps"] for r in out if r["fy_end"][:4] in actual and r["bps"] > 0]
    if verbose:
        print(f"{w['ticker']} DART BPS {[(r['fy_end'][:4], round(r['bps'])) for r in out]} 와이즈 대비 {[round(x, 3) for x in ratios]}")
    if not ratios:
        return []
    # 겹치는 해 중 1에 가장 가까운 비율을 씀(DART 한 해가 단위 오기로 1000배 튀는 경우가 있음)
    k = min(ratios, key=lambda x: abs(math.log(x)) if x > 0 else 99)
    # 겹치지 않는 해도 단위 오기(앞뒤 해의 50배 이상 차이)면 뺌
    out = [r for i, r in enumerate(out) if all(0.02 < r["bps"] / n["bps"] < 50 for n in out[max(0, i - 1):i + 2] if n is not r and n["bps"] > 0)]
    if not 0.7 <= k <= 1.4:  # 정의 차이로 보기엔 너무 큼(분할 반영 누락 등) → 안 씀
        print(f"{w['ticker']} {w['name']} DART BPS가 와이즈리포트와 {k:.2f}배 차이 → 과거 BPS 안 씀")
        return []
    return [{**r, "bps": round(r["bps"] * k, 1)} for r in out if r["fy_end"][:4] not in actual]


def _backfill_prices(item: dict, since: dt.date) -> None:
    """밴드는 긴 주가가 필요함. 저장된 주가가 since보다 늦게 시작하면 한 번 더 받아 둠."""
    first = db.select("prices", f"select=date&ticker=eq.{item['ticker']}&order=date.asc&limit=1") if db.URL else []
    if first and first[0]["date"] <= (since + dt.timedelta(days=30)).isoformat():
        return
    prices.collect(since, [item], force_start=True)


def collect(verbose_first: bool = True) -> None:
    items = db.select("watchlist", "select=ticker,market,name,corp_code&market=eq.KR") if db.URL else [{"ticker": "005930", "market": "KR", "name": "삼성전자"}]
    # 과거 BPS(DART)는 종목당 한 번만 채움: 이미 오래된 결산이 있으면 건너뜀
    oldest: dict[str, str] = {}
    has_dart: set[str] = set()
    for r in db.select("bps_annual", "select=ticker,fy_end,source&order=fy_end.asc") if db.URL else []:
        oldest.setdefault(r["ticker"], r["fy_end"])
        if r.get("source") == "dart":
            has_dart.add(r["ticker"])
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    ok = 0
    for n, w in enumerate(items):
        verbose = verbose_first and n < 3
        rows, src = [], None
        for name, fn in (("wisereport", _wisereport), ("naver", _naver)):
            try:
                got = fn(w["ticker"], verbose)
            except Exception as e:
                print(f"{w['ticker']} {name} 실패: {e}")
                continue
            # 추정치가 더 많은 쪽을 씀(와이즈리포트가 막히면 네이버 모바일: 추정 1년치뿐)
            if got and (not rows or sum(r["estimate"] for r in got) > sum(r["estimate"] for r in rows)):
                rows, src = got, name
            if rows and sum(r["estimate"] for r in rows) >= 2:
                break
        if not rows:
            print(f"{w['ticker']} {w['name']} BPS 없음")
            continue
        est = [r["fy_end"][:4] for r in rows if r["estimate"]]
        print(f"{w['ticker']} {w['name']} {src}: {len(rows)}개년, 추정 {est or '없음'}")
        hist = []
        if w["ticker"] not in has_dart and oldest.get(w["ticker"], "9999") > f"{HIST_FROM + 1}-12-31":
            hist = _dart_history(w, rows, verbose=True)
            if hist:
                print(f"{w['ticker']} 과거 BPS(DART) {len(hist)}개년 {hist[0]['fy_end'][:4]}~{hist[-1]['fy_end'][:4]}")
        try:
            db.upsert("bps_annual", [{"ticker": w["ticker"], **r, "source": src, "updated_at": now} for r in rows]
                      + [{"ticker": w["ticker"], **r, "source": "dart", "updated_at": now} for r in hist])
        except Exception as e:
            print(f"{w['ticker']} 저장 실패: {e}")
            continue
        try:
            # 과거 BPS를 새로 채웠을 때만 긴 주가를 받음(상장이 늦은 종목이 매번 다시 받지 않게). 아니면 최근 6년만 확인.
            start = min([r["fy_end"] for r in rows + hist] + [oldest.get(w["ticker"], "9999")])
            since = max(BAND_START, dt.date.fromisoformat(start) - dt.timedelta(days=366))
            _backfill_prices(w, since if hist else max(since, dt.date.today() - dt.timedelta(days=365 * 6)))
        except Exception as e:
            print(f"{w['ticker']} 주가 보충 실패: {e}")
        ok += 1
    print(f"BPS 저장 {ok}/{len(items)}종목")
    if items and ok == 0:
        raise RuntimeError("모든 종목 BPS 수집 실패")


if __name__ == "__main__":
    collect()
