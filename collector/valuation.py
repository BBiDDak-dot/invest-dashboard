"""지수 12M Fwd PER·PBR 수집 → macro 테이블(series_id 접두어 VAL).

- KOSPI·KOSDAQ: 공개된 지수 값이 없어(FnGuide는 Actions에서 막힘) 종목 컨센서스를 모아 직접 계산함.
  시총 상위 KOSPI 200·KOSDAQ 150 종목(보통주)의 와이즈리포트 연간 EPS·BPS 추정치로 종목별 12M Fwd EPS·BPS를 구하고
  (올해 추정치와 내년 추정치를 남은 기간 비율로 섞음), 지수 PER = 시총 합 / 예상 순이익 합, PBR = 시총 합 / 예상 자본 합.
  컨센서스가 없는 종목은 빠짐. 과거 값은 와이즈리포트 '컨센서스 추이'(지난 1년 월말)로 한 번 채움, 그 이전은 출처 없음.
- S&P 500: FactSet Earnings Insight 주간 보고서(PDF)의 forward 12-month P/E. 지난 3년 보고서로 이력도 채움.
- NASDAQ 100: WSJ P/E & Yields 표의 Estimate(Birinyi Associates, 12개월 선행, 금요일마다 갱신). 이력 없음.
- 미국 지수 12M Fwd PBR은 무료 출처가 없어 안 넣음.

Trailing(직전 실적 기준) PER·PBR:
- KOSPI·KOSDAQ: KRX 지수 PER은 로그인이 필요해 같은 종목들로 직접 계산함(KRX 방식처럼 직전 사업연도 확정 실적 기준).
  지수 PER = 시총 합 / 직전 결산 지배순이익 합(적자 기업 제외), PBR = 시총 합 / 직전 결산 자본 합(자본잠식 제외). 결산 실적은 결산일 90일 뒤(12월 결산이면 4월)부터 반영.
  처음 한 번은 네이버 주간 종가로 지난 3년을 채움(지금 종목 구성·주식 수로 거꾸로 계산하므로 근사치).
- S&P 500: multpl(S&P·Shiller 자료) 월별 Trailing PER(발표 기준 TTM 이익)·분기별 PBR + 현재 추정치.
- NASDAQ 100: worldperatio 월별 Trailing PER. NASDAQ 100 PBR은 무료 출처가 없어 안 넣음.
"""

import datetime as dt
import io
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor

import requests
from bs4 import BeautifulSoup

import db

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9,ko;q=0.8"}
KR_UNIVERSE = {"KOSPI": 200, "KOSDAQ": 150}
SPX_ID, NDX_ID = "VAL:SPX_FPER", "VAL:NDX_FPER"
SPX_TPER, SPX_TPBR, NDX_TPER = "VAL:SPX_TPER", "VAL:SPX_TPBR", "VAL:NDX_TPER"
SERIES_IDS = ([f"VAL:{m}_{k}" for m in KR_UNIVERSE for k in ("FPER", "FPBR", "TPER", "TPBR")]
              + [SPX_ID, NDX_ID, SPX_TPER, SPX_TPBR, NDX_TPER])
REPORT_LAG = 90  # 결산일 뒤 이만큼 지나야 확정 실적(사업보고서)이 나온 것으로 봄
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


def trailing(annual: dict[str, dict], key: str, day: dt.date) -> float | None:
    """그날 기준 가장 최근에 확정된(결산일 + 90일 지난) 실적 값."""
    done = [e for e in sorted(annual) if not annual[e]["est"] and dt.date.fromisoformat(e) + dt.timedelta(days=REPORT_LAG) <= day]
    return annual[done[-1]].get(key) if done else None


def _weekly_close(code: str, weeks: int) -> dict[str, float]:
    """네이버 주간 종가 {날짜: 종가}"""
    r = requests.get("https://fchart.stock.naver.com/sise.nhn", params={"symbol": code, "timeframe": "week", "count": weeks, "requestType": 0}, headers=UA, timeout=20)
    out = {}
    for d, *_, close, _vol in (x.split("|") for x in re.findall(r'data="([^"]+)"', r.text)):
        out[f"{d[:4]}-{d[4:6]}-{d[6:]}"] = float(close)
    return out


def _has(series_id: str) -> bool:
    if not db.URL:
        return False
    sid = requests.utils.quote(series_id, safe="")
    return len(db.select("macro_observations", f"select=date&series_id=eq.{sid}&limit=30")) >= 30


def _oldest(series_id: str) -> str | None:
    if not db.URL:
        return None
    sid = requests.utils.quote(series_id, safe="")
    got = db.select("macro_observations", f"select=date&series_id=eq.{sid}&order=date.asc&limit=1")
    return got[0]["date"] if got else None


def _consensus_hist(code: str, yymm: str, acc: str, today: dt.date) -> dict[str, float]:
    """와이즈리포트 '컨센서스 추이'(cF5002): 결산 yymm 추정치의 지난 1년 월말 평균 {날짜: 값}. acc 312000=EPS, 314000=BPS."""
    r = requests.get(
        "https://navercomp.wisereport.co.kr/v2/company/ajax/cF5002.aspx",
        params={"cmp_cd": code, "dt": today.strftime("%Y%m%d"), "yymm": yymm, "frq": "Y", "acc_cd": acc, "fingubun": "MAIN", "chartType": "svg"},
        headers={**UA, "Referer": f"https://navercomp.wisereport.co.kr/v2/company/c1050001.aspx?cmp_cd={code}"},
        timeout=20,
    )
    try:
        c = json.loads(json.loads(r.text)["chart1"])
    except (ValueError, KeyError, TypeError):
        return {}
    return {d.replace("/", "-"): float(v) for d, v in zip(c.get("categories") or [], c.get("avg") or []) if v is not None}


def _daily_close(code: str, days: int) -> dict[str, float]:
    r = requests.get("https://fchart.stock.naver.com/sise.nhn", params={"symbol": code, "timeframe": "day", "count": days, "requestType": 0}, headers=UA, timeout=20)
    return {f"{d[:4]}-{d[4:6]}-{d[6:]}": float(close) for d, *_, close, _vol in (x.split("|") for x in re.findall(r'data="([^"]+)"', r.text))}


def backfill_fwd(market: str, got: list, today: dt.date, d: str) -> tuple[dict[str, float], dict[str, float]]:
    """지난 1년 월말 12M Fwd PER·PBR을 그때의 컨센서스(와이즈리포트 컨센서스 추이)로 다시 계산.
    주식 수는 지금 시총/주가로 근사(Trailing 백필과 같은 방식). 컨센서스 이력이 1년치만 공개돼 그 이전은 못 채움."""

    def hist(item):
        s, a, price, mcap, _w = item
        # 지난 1년 동안 FY1·FY2가 될 수 있는 결산 3개 (예: 2025·2026·2027년 12월)
        ends = [e for e in sorted(a) if e >= (today - dt.timedelta(days=370)).isoformat()][:3]
        try:
            eps = {e: _consensus_hist(s["itemCode"], e[:4] + e[5:7], "312000", today) for e in ends}
            bps = {e: _consensus_hist(s["itemCode"], e[:4] + e[5:7], "314000", today) for e in ends}
            closes = _daily_close(s["itemCode"], 300)
        except requests.RequestException:
            return None
        return mcap / price, eps, bps, closes

    with ThreadPoolExecutor(6) as ex:
        hs = [h for h in ex.map(hist, got) if h]
    months = sorted({m for _sh, eps, _b, _c in hs for e in eps.values() for m in e if m < d})
    per, pbr = {}, {}
    for m in months:
        day = dt.date.fromisoformat(m)
        total = cap = earn = book = 0.0
        for shares, eps, bps, closes in hs:
            p = next((closes[k] for k in sorted(closes, reverse=True) if k <= m), None)
            if not p:
                continue
            total += shares * p
            annual = {e: {"eps": eps[e].get(m), "bps": bps.get(e, {}).get(m), "est": True} for e in eps}
            fe, fb = fwd_12m(annual, "eps", day), fwd_12m(annual, "bps", day)
            if fe is None or fb is None:
                continue
            cap, earn, book = cap + shares * p, earn + shares * fe, book + shares * fb
        if total and cap >= total / 3 and earn > 0 and book > 0:
            per[m], pbr[m] = round(cap / earn, 2), round(cap / book, 2)
    print(f"[밸류에이션] {market} Fwd 과거 {len(per)}개월 채움 (종목 {len(hs)}개) {dict(sorted(per.items())[:2])}")
    return per, pbr


def collect_kr() -> None:
    today = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=9)).date()
    for market, n in KR_UNIVERSE.items():
        stocks = _universe(market, n)
        backfill = not _has(f"VAL:{market}_TPER")

        def one(s: dict):
            try:
                a = _annual(s["itemCode"])
                weekly = _weekly_close(s["itemCode"], HISTORY_DAYS // 7 + 2) if backfill else {}
            except requests.RequestException as e:
                print(f"[밸류에이션] {s['stockName']} 실패: {e}")
                return None
            price, mcap = _num(s["closePrice"]), _num(s["marketValue"])  # 시총 백만원
            if not price or not mcap or not a:
                return None
            return s, a, price, mcap, weekly

        with ThreadPoolExecutor(6) as ex:
            got = [g for g in ex.map(one, stocks) if g]
        total = sum(_num(s["marketValue"]) or 0 for s in stocks)
        d = stocks[0].get("localTradedAt", "")[:10] or today.isoformat()  # 마지막 거래일 (새벽 수집이 다음 날짜로 찍히지 않게)

        # 12M Fwd: 컨센서스 있는 종목만
        cap = earn = book = 0.0
        for _s, a, price, mcap, _w in got:
            eps, bps = fwd_12m(a, "eps", today), fwd_12m(a, "bps", today)
            if eps is None or bps is None:
                continue
            cap, earn, book = cap + mcap, earn + mcap * eps / price, book + mcap * bps / price
        print(f"[밸류에이션] {market} Fwd: 시총 비중 {cap / total * 100:.0f}%, PER {cap / max(earn, 1):.2f} PBR {cap / max(book, 1):.2f}")
        if cap < total / 3 or earn <= 0 or book <= 0:
            raise RuntimeError(f"{market} 컨센서스 종목이 너무 적음")
        fper, fpbr = {d: round(cap / earn, 2)}, {d: round(cap / book, 2)}
        # 이력이 반년이 안 되면 지난 1년 월말 값을 컨센서스 추이로 채움 (한 번만)
        oldest = _oldest(f"VAL:{market}_FPER")
        if not oldest or oldest > (today - dt.timedelta(days=180)).isoformat():
            hp, hb = backfill_fwd(market, got, today, d)
            fper, fpbr = {**hp, **fper}, {**hb, **fpbr}
        _save(f"VAL:{market}_FPER", f"{market} 12M Fwd PER", "KR", fper)
        _save(f"VAL:{market}_FPBR", f"{market} 12M Fwd PBR", "KR", fpbr)

        # Trailing: 직전 확정 실적. 주식 수 = 지금 시총 / 지금 주가 (과거 날짜도 같은 주식 수로 근사)
        def agg(day: dt.date, price_of) -> tuple[float, float, float, float] | None:
            cap = earn = bcap = book = 0.0
            for _s, a, price, mcap, weekly in got:
                p = price_of(price, weekly)
                if not p:
                    continue
                shares = mcap / price
                eps, bps = trailing(a, "eps", day), trailing(a, "bps", day)
                # KRX처럼 적자 기업은 PER에서, 자본잠식 기업은 PBR에서 뺌
                if eps is not None and eps > 0:
                    cap, earn = cap + shares * p, earn + shares * eps
                if bps is not None and bps > 0:
                    bcap, book = bcap + shares * p, book + shares * bps
            if earn <= 0 or book <= 0 or cap < total / 3:
                return None
            return cap / earn, bcap / book, cap, bcap

        now = agg(today, lambda price, _w: price)
        if not now:
            raise RuntimeError(f"{market} Trailing 계산 실패")
        per, pbr = {d: round(now[0], 2)}, {d: round(now[1], 2)}
        print(f"[밸류에이션] {market} Trailing: 시총 비중 {now[2] / total * 100:.0f}%, PER {now[0]:.2f} PBR {now[1]:.2f}")
        if backfill:
            days = sorted({w for g in got for w in g[4] if w < d and w >= (today - dt.timedelta(days=HISTORY_DAYS)).isoformat()})
            for w in days:
                r = agg(dt.date.fromisoformat(w), lambda _p, weekly, w=w: weekly.get(w))
                if r:
                    per[w], pbr[w] = round(r[0], 2), round(r[1], 2)
            print(f"[밸류에이션] {market} Trailing 과거 {len(per) - 1}주 채움 {dict(sorted(per.items())[:2])}")
        _save(f"VAL:{market}_TPER", f"{market} Trailing PER", "KR", per)
        _save(f"VAL:{market}_TPBR", f"{market} Trailing PBR", "KR", pbr)


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


def _multpl(path: str) -> dict[str, float]:
    """multpl 표 {날짜: 값}. 맨 위 행은 오늘 추정치(†)."""
    for attempt in range(3):  # multpl은 가끔 접속을 거부함(Connection refused) → 잠깐 쉬고 다시
        try:
            t = requests.get(f"https://www.multpl.com/{path}", headers=UA, timeout=30).text
            break
        except requests.ConnectionError:
            if attempt == 2:
                raise
            time.sleep(20 * (attempt + 1))
    since = (dt.date.today() - dt.timedelta(days=HISTORY_DAYS)).isoformat()
    out = {}
    for day, v in re.findall(r"<td>\s*([A-Z][a-z]{2} \d{1,2}, \d{4})\s*</td>\s*<td>\s*(?:<abbr[^>]*>[^<]*</abbr>|&#x2002;)?\s*([\d.]+)", t):
        d = dt.datetime.strptime(day, "%b %d, %Y").date().isoformat()
        if d >= since:
            out[d] = float(v)
    if not out:
        raise RuntimeError(f"multpl {path} 표를 못 읽음")
    return out


def collect_us_trailing() -> None:
    per = _multpl("s-p-500-pe-ratio/table/by-month")
    pbr = _multpl("s-p-500-price-to-book/table/by-quarter")
    print(f"[밸류에이션] S&P 500 Trailing PER {len(per)}개 {max(per)}={per[max(per)]}, PBR {len(pbr)}개 {max(pbr)}={pbr[max(pbr)]}")
    _save(SPX_TPER, "S&P 500 Trailing PER (multpl)", "US", per)
    _save(SPX_TPBR, "S&P 500 Trailing PBR (multpl)", "US", pbr)

    t = requests.get("https://worldperatio.com/index/nasdaq-100/", headers=UA, timeout=30).text
    m = re.search(r"detailPE_data\s*=\s*\[(.*?)\];", t, re.S)
    since = (dt.date.today() - dt.timedelta(days=HISTORY_DAYS)).isoformat()
    ndx = {}
    for y, mo, day, v in re.findall(r"Date\.UTC\((\d{4}),\s*(\d+),\s*(\d+)\),([\d.]+)", m[1] if m else ""):
        d = dt.date(int(y), int(mo) + 1, int(day)).isoformat()  # JS 월은 0부터
        if d >= since:
            ndx[d] = round(float(v), 2)
    if not ndx:
        raise RuntimeError("worldperatio NASDAQ 100 PER을 못 읽음")
    print(f"[밸류에이션] NASDAQ 100 Trailing PER {len(ndx)}개 {max(ndx)}={ndx[max(ndx)]}")
    _save(NDX_TPER, "NASDAQ 100 Trailing PER (worldperatio)", "US", ndx)


def _fresh(series_id: str, days: int) -> bool:
    """최근 days일 안에 저장된 값이 있으면 True (월별 출처가 하루 막혀도 화면엔 지장 없음)."""
    if not db.URL:
        return False
    since = (dt.date.today() - dt.timedelta(days=days)).isoformat()
    return bool(db.select("macro_observations", f"select=date&series_id=eq.{series_id}&date=gte.{since}&limit=1"))


def collect() -> None:
    failed = []
    for name, job in [("국내", collect_kr), ("S&P 500", collect_spx), ("NASDAQ 100", collect_ndx), ("미국 Trailing", collect_us_trailing)]:
        try:
            job()
        except Exception as e:
            print(f"[밸류에이션 {name}] 실패: {e}")
            # 미국 Trailing은 월별 자료라 최근 45일 안 값이 있으면 일시 장애로 보고 실패 처리 안 함
            if name == "미국 Trailing" and isinstance(e, requests.ConnectionError) and _fresh(SPX_TPER, 45):
                print("[밸류에이션 미국 Trailing] 접속 장애로 이번엔 건너뜀 (최근 값 있음)")
                continue
            failed.append(name)
    if failed:
        raise RuntimeError(f"실패: {', '.join(failed)}")


if __name__ == "__main__":
    collect()
