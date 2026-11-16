"""지수 12M Fwd PER·PBR 수집 → macro 테이블(series_id 접두어 VAL).

- KOSPI·KOSDAQ: 공개된 지수 값이 없어(FnGuide는 Actions에서 막힘) 종목 컨센서스를 모아 직접 계산함.
  시총 상위 KOSPI 200·KOSDAQ 150 종목(보통주)의 와이즈리포트 연간 EPS·BPS 추정치로 종목별 12M Fwd EPS·BPS를 구하고
  (올해 추정치와 내년 추정치를 남은 기간 비율로 섞음), 지수 PER = 시총 합 / 예상 순이익 합, PBR = 시총 합 / 예상 자본 합.
  컨센서스가 없는 종목은 빠짐. 그때그때의 컨센서스 이력은 무료 출처가 없어 오늘부터 쌓임.
- S&P 500: FactSet Earnings Insight 주간 보고서(PDF)의 forward 12-month P/E. 지난 3년 보고서로 이력도 채움.
- NASDAQ 100: WSJ P/E & Yields 표의 Estimate(Birinyi Associates, 12개월 선행, 금요일마다 갱신). 이력 없음.
- 미국 지수 12M Fwd PBR은 무료 출처가 없어 안 넣음.
"""

import datetime as dt
import io
import re
from concurrent.futures import ThreadPoolExecutor

import requests
from bs4 import BeautifulSoup

import db

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9,ko;q=0.8"}
KR_UNIVERSE = {"KOSPI": 200, "KOSDAQ": 150}
SPX_ID, NDX_ID = "VAL:SPX_FPER", "VAL:NDX_FPER"
SERIES_IDS = [f"VAL:{m}_{k}" for m in KR_UNIVERSE for k in ("FPER", "FPBR")] + [SPX_ID, NDX_ID]
FACTSET = "https://advantage.factset.com/hubfs/Website/Resources%20Section/Research%20Desk/Earnings%20Insight/EarningsInsight_{:%m%d%y}.pdf"
HISTORY_DAYS = 1100


def _num(s) -> float | None:
    s = re.sub(r"[^\d.\-]", "", str(s or ""))
    try:
        return float(s)
    except ValueError:
        return None


def _save(series_id: str, name: str, country: str, points: dict[str, float]) -> None:
    db.upsert("macro_series", [{"series_id": series_id, "source": "VAL", "name": name, "unit": "배", "country": country}])
    db.upsert("macro_observations", [{"series_id": series_id, "date": d, "value": v} for d, v in sorted(points.items())])


# ---------- 국내: 종목 컨센서스 합산 ----------

def _universe(market: str, n: int) -> list[dict]:
    out, page = [], 1
    while len(out) < n:
        r = requests.get(f"https://m.stock.naver.com/api/stocks/marketValue/{market}", params={"page": page, "pageSize": 100}, headers=UA, timeout=15)
        r.raise_for_status()
        stocks = r.json().get("stocks") or []
        if not stocks:
            break
        # 보통주만 (우선주는 코드 끝자리가 0이 아님)
        out += [s for s in stocks if s.get("stockEndType") == "stock" and s["itemCode"].endswith("0")]
        page += 1
    return out[:n]


def _annual(code: str) -> dict[str, dict]:
    """와이즈리포트 Financial Summary 연간 → {결산일: {"eps", "bps", "est"}}"""
    page_url = f"https://navercomp.wisereport.co.kr/v2/company/c1010001.aspx?cmp_cd={code}"
    page = requests.get(page_url, headers=UA, timeout=20)
    enc = re.search(r"encparam\s*:\s*'([^']+)'", page.text)
    cid = re.search(r"\bid\s*:\s*'([^']+)'", page.text)
    if not enc:
        return {}
    r = requests.get(
        "https://navercomp.wisereport.co.kr/v2/company/ajax/cF1001.aspx",
        params={"cmp_cd": code, "fin_typ": "0", "freq_typ": "Y", "encparam": enc[1], "id": cid[1] if cid else ""},
        headers={**UA, "Referer": page_url},
        timeout=20,
    )
    soup = BeautifulSoup(r.text, "html.parser")
    for table in soup.find_all("table"):
        heads = [th.get_text(" ", strip=True) for th in table.find_all("th")]
        years = [h for h in heads if re.search(r"\d{4}/\d{2}", h)]
        if not years:
            continue
        rows = {}
        for tr in table.find_all("tr"):
            th = tr.find("th")
            key = th.get_text(strip=True).upper()[:3] if th else ""
            if key in ("EPS", "BPS") and key.lower() not in rows:
                rows[key.lower()] = [_num(td.get_text(strip=True)) for td in tr.find_all("td")]
        out = {}
        for i, h in enumerate(years):
            m = re.search(r"(\d{4})/(\d{2})", h)
            y, mo = int(m[1]), int(m[2])
            end = (dt.date(y + (mo == 12), mo % 12 + 1, 1) - dt.timedelta(days=1))
            vals = {k: (v[i] if i < len(v) else None) for k, v in rows.items()}
            out[end.isoformat()] = {**vals, "est": "(E)" in h}
        return out
    return {}


def fwd_12m(annual: dict[str, dict], key: str, today: dt.date) -> float | None:
    """오늘부터 12개월 선행 값: 이번 회계연도 추정치와 다음 회계연도 추정치를 남은 기간 비율로 섞음."""
    ends = sorted(e for e in annual if dt.date.fromisoformat(e) >= today)
    if len(ends) < 2:
        return None
    fy1, fy2 = annual[ends[0]], annual[ends[1]]
    if not fy2["est"] or fy1.get(key) is None or fy2.get(key) is None:
        return None
    w = min(1.0, (dt.date.fromisoformat(ends[0]) - today).days / 365)
    return w * fy1[key] + (1 - w) * fy2[key]


def collect_kr() -> None:
    today = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=9)).date()
    for market, n in KR_UNIVERSE.items():
        stocks = _universe(market, n)

        def one(s: dict):
            try:
                a = _annual(s["itemCode"])
            except requests.RequestException as e:
                print(f"[밸류에이션] {s['stockName']} 실패: {e}")
                return None
            price, mcap = _num(s["closePrice"]), _num(s["marketValue"])  # 시총 백만원
            eps, bps = fwd_12m(a, "eps", today), fwd_12m(a, "bps", today)
            if not price or not mcap or eps is None or bps is None:
                return None
            return mcap, mcap * eps / price, mcap * bps / price

        with ThreadPoolExecutor(6) as ex:
            got = [g for g in ex.map(one, stocks) if g]
        total = sum(_num(s["marketValue"]) or 0 for s in stocks)
        cap, earn, book = (sum(g[i] for g in got) for i in range(3))
        print(f"[밸류에이션] {market}: 컨센서스 {len(got)}/{len(stocks)}종목, 시총 비중 {cap / total * 100:.0f}%, PER {cap / earn:.2f} PBR {cap / book:.2f}")
        if len(got) < n // 3 or earn <= 0 or book <= 0:
            raise RuntimeError(f"{market} 컨센서스 종목이 너무 적음 ({len(got)})")
        d = stocks[0].get("localTradedAt", "")[:10] or today.isoformat()  # 마지막 거래일 (새벽 수집이 다음 날짜로 찍히지 않게)
        _save(f"VAL:{market}_FPER", f"{market} 12M Fwd PER", "KR", {d: round(cap / earn, 2)})
        _save(f"VAL:{market}_FPBR", f"{market} 12M Fwd PBR", "KR", {d: round(cap / book, 2)})


# ---------- 미국 ----------

def _factset(d: dt.date) -> float | None:
    r = requests.get(FACTSET.format(d), headers=UA, timeout=60)
    if r.status_code != 200 or r.content[:4] != b"%PDF":
        return None
    import pypdf

    pages = pypdf.PdfReader(io.BytesIO(r.content)).pages
    text = " ".join((p.extract_text() or "") for p in pages[:2])
    m = re.search(r"forward 12-month P/E ratio (?:for the S&P 500 )?is (\d+\.\d)", re.sub(r"\s+", " ", text))
    return float(m[1]) if m else None


def collect_spx() -> None:
    """FactSet 주간 보고서는 보통 금요일 날짜(휴일이면 앞당김). 주마다 금→월 순으로 찾음."""
    today = dt.date.today()
    have = db.select("macro_observations", f"select=date&series_id=eq.{SPX_ID}&order=date.desc&limit=1") if db.URL else []
    since = dt.date.fromisoformat(have[0]["date"]) + dt.timedelta(days=1) if have else today - dt.timedelta(days=HISTORY_DAYS)
    friday = today - dt.timedelta(days=(today.weekday() - 4) % 7)
    points = {}
    while friday >= since - dt.timedelta(days=4):
        for back in range(5):
            d = friday - dt.timedelta(days=back)
            if d < since or d > today:
                continue
            v = _factset(d)
            if v is not None:
                points[d.isoformat()] = v
                break
        friday -= dt.timedelta(days=7)
    print(f"[밸류에이션] S&P 500 FactSet {len(points)}주 추가 {dict(sorted(points.items())[-3:])}")
    if points:
        _save(SPX_ID, "S&P 500 12M Fwd PER (FactSet)", "US", points)
    elif not have:
        raise RuntimeError("FactSet 보고서를 하나도 못 읽음")


def collect_ndx() -> None:
    t = requests.get("https://www.wsj.com/market-data/stocks/peyields", headers=UA, timeout=30).text
    m = re.search(r'"tradeDate":"(\d{4}-\d{2}-\d{2})[^"]*","instruments":\[[^\]]*?"name":"NASDAQ 100 Index","priceEarningsRatio":"[^"]*","priceEarningsRatioEstimate":"([\d.]+)"', t)
    if not m:
        raise RuntimeError("WSJ 표에서 NASDAQ 100 추정 PER을 못 찾음")
    print(f"[밸류에이션] NASDAQ 100 {m[1]} {m[2]}")
    _save(NDX_ID, "NASDAQ 100 12M Fwd PER (WSJ·Birinyi)", "US", {m[1]: round(float(m[2]), 2)})


def collect() -> None:
    failed = []
    for name, job in [("국내", collect_kr), ("S&P 500", collect_spx), ("NASDAQ 100", collect_ndx)]:
        try:
            job()
        except Exception as e:
            print(f"[밸류에이션 {name}] 실패: {e}")
            failed.append(name)
    if failed:
        raise RuntimeError(f"실패: {', '.join(failed)}")


if __name__ == "__main__":
    collect()
