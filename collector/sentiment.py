"""심리 지표 수집: 공포탐욕지수(미국 CNN·자체 계산)와 신용융자 잔고(금융투자협회).

- 미국(S&P 500): CNN Fear & Greed 지수를 그대로 받음.
- NASDAQ·KOSPI·KOSDAQ: 공개된 지수가 없어 CNN 방식을 따라 직접 계산함 (fear_greed 참고).
  공통: 모멘텀(125일선 괴리), 강도(52주 범위 위치), 변동성(VXN·실현 변동성의 50일 평균 대비), 안전자산 선호(20일 주식−국채 수익률)
  NASDAQ: + 정크본드 수요(하이일드 스프레드). KOSPI·KOSDAQ: + 신용융자 20일 증가율, 외국인+기관 20일 순매수.
- 신용융자 잔고: 금융투자협회 종합통계(freesis) 유가증권·코스닥 신용거래융자, 조원.
- 4대 지수 MDD: S&P 500·NASDAQ·KOSPI·KOSDAQ 종가가 그때까지의 사상 최고 종가보다 몇 % 아래인지 (0이면 신고가).
"""

import datetime as dt
import math
import os

import pandas as pd
import requests
import yfinance as yf

import db

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36"}

CNN_ID = "CNN:FEAR_GREED"
# (시리즈 id, 이름, Yahoo 지수, 변동성 지수 또는 None=실현 변동성)
OWN_INDEXES = [
    ("FG:NASDAQ", "NASDAQ 공포탐욕지수 (자체 계산)", "^IXIC", "^VXN"),
    ("FG:KOSPI", "KOSPI 공포탐욕지수 (자체 계산)", "^KS11", None),
    ("FG:KOSDAQ", "KOSDAQ 공포탐욕지수 (자체 계산)", "^KQ11", None),
]
CREDIT = [("KOFIA:CREDIT_KOSPI", "KOSPI 신용융자 잔고", "TMPV3"), ("KOFIA:CREDIT_KOSDAQ", "KOSDAQ 신용융자 잔고", "TMPV4")]
# 고점 대비 하락률(MDD). 공포탐욕에 쓰는 4대 지수
MDD_INDEXES = [
    ("MDD:SPX", "S&P 500", "^GSPC", "US"),
    ("MDD:NASDAQ", "NASDAQ", "^IXIC", "US"),
    ("MDD:KOSPI", "KOSPI", "^KS11", "KR"),
    ("MDD:KOSDAQ", "KOSDAQ", "^KQ11", "KR"),
]
SERIES_IDS = [CNN_ID] + [s[0] for s in OWN_INDEXES] + [s[0] for s in CREDIT] + [s[0] for s in MDD_INDEXES]


def _save(series_id: str, name: str, unit: str, country: str, points: dict[str, float]) -> None:
    db.upsert("macro_series", [{"series_id": series_id, "source": series_id.split(":")[0], "name": name, "unit": unit, "country": country}])
    db.upsert("macro_observations", [{"series_id": series_id, "date": d, "value": v} for d, v in sorted(points.items())])


def collect_cnn(start: dt.date) -> None:
    r = requests.get(
        f"https://production.dataviz.cnn.io/index/fearandgreed/graphdata/{start.isoformat()}",
        headers={**UA, "Referer": "https://edition.cnn.com/", "Origin": "https://edition.cnn.com"},
        timeout=30,
    )
    r.raise_for_status()
    d = r.json()
    points = {
        dt.datetime.fromtimestamp(p["x"] / 1000, dt.timezone.utc).date().isoformat(): round(p["y"], 1)
        for p in d["fear_and_greed_historical"]["data"]
    }
    now = d["fear_and_greed"]
    points[now["timestamp"][:10]] = round(now["score"], 1)
    _save(CNN_ID, "미국 공포탐욕지수 (CNN, S&P 500 기준)", "점", "US", points)


Z_WINDOW, Z_MIN = 756, 252  # 각 항목을 최근 3년과 비교 (이력이 짧으면 1년부터)


def _rank(x: pd.Series, window: int = Z_WINDOW) -> pd.Series:
    # 오늘 값이 최근 기간 값 중 몇 %보다 큰지 (0~100)
    return x.rolling(window, min(Z_MIN, window)).apply(lambda v: (v[:-1] < v[-1]).mean() * 100, raw=True)


def _z(x: pd.Series) -> pd.Series:
    # 평소(최근 3년 중앙값)보다 표준편차 몇 배 벗어났는지. 극단값 하나가 전체를 끌지 않게 ±3에서 자름
    m, sd = x.rolling(Z_WINDOW, Z_MIN).median(), x.rolling(Z_WINDOW, Z_MIN).std()
    return ((x - m) / sd).clip(-3, 3)


def _norm_cdf(z: pd.Series) -> pd.Series:
    return 0.5 * (1 + (z / math.sqrt(2)).map(math.erf))


def price_parts(close: pd.Series, vol: pd.Series, bond: pd.Series | None) -> dict[str, pd.Series]:
    """가격으로 만드는 항목. 값이 클수록 탐욕 쪽."""
    hi, lo = close.rolling(252).max(), close.rolling(252).min()
    parts = {
        "모멘텀": close / close.rolling(125).mean() - 1,  # CNN: S&P 500의 125일선 괴리
        "강도": (close - lo) / (hi - lo),  # CNN: 52주 신고가·신저가 종목 수 → 지수의 52주 범위 위치로 대신
        "변동성": -(vol / vol.rolling(50).mean() - 1),  # CNN: VIX의 50일 평균 대비. 높을수록 공포
    }
    if bond is not None and len(bond.dropna()) > 300:
        b = bond.reindex(close.index).ffill()
        parts["안전자산"] = close.pct_change(20) - b.pct_change(20)  # CNN: 20일 주식−국채 수익률 차
    return parts


def _combine(scores: pd.DataFrame, min_parts: int) -> pd.Series:
    return scores.mean(axis=1).where(scores.notna().sum(axis=1) >= min_parts).dropna()


def fear_greed(parts: dict[str, pd.Series], method: str = "rank3y", min_parts: int = 3) -> pd.Series:
    """항목마다 0~100 점수로 바꿔 평균 (CNN도 항목별 점수를 같은 비중으로 평균함).

    rank3y(채택): 최근 3년 중 오늘 값의 백분위. 분포가 한쪽으로 치우친 항목(급락은 짧고 상승은 긴 모멘텀 등)도 고르게 펴짐.
    rank1y: 최근 1년 백분위(예전 기간). z: 3년 중앙값 대비 표준편차 배수를 정규분포 백분위로.
    """
    if method == "z":
        scores = pd.concat({k: _norm_cdf(_z(v)) * 100 for k, v in parts.items()}, axis=1)
    else:
        w = 252 if method == "rank1y" else Z_WINDOW
        scores = pd.concat({k: _rank(v, w) for k, v in parts.items()}, axis=1)
    return _combine(scores, min_parts)


def fear_greed_v1(close: pd.Series, vol: pd.Series) -> pd.Series:
    """예전 방식(2026-11 이전, 비교용): 125일선 괴리·52주 위치·RSI14·변동성 수준을 1년 백분위로 바꿔 평균."""
    def rank(s: pd.Series) -> pd.Series:
        return s.rolling(252).apply(lambda x: (x[:-1] < x[-1]).mean() * 100, raw=True)
    ma = close.rolling(125).mean()
    hi, lo = close.rolling(252).max(), close.rolling(252).min()
    diff = close.diff()
    up = diff.clip(lower=0).ewm(alpha=1 / 14, adjust=False).mean()
    down = (-diff.clip(upper=0)).ewm(alpha=1 / 14, adjust=False).mean()
    parts = [rank(close / ma - 1), rank((close - lo) / (hi - lo)), rank(100 - 100 / (1 + up / down)), 100 - rank(vol)]
    return pd.concat(parts, axis=1).mean(axis=1, skipna=False).dropna()


def _closes(symbol: str, start: dt.date) -> pd.Series:
    df = yf.Ticker(symbol).history(start=start.isoformat(), auto_adjust=False)
    if df.empty:
        raise RuntimeError(f"Yahoo {symbol} 데이터 없음")
    s = df["Close"].dropna()
    s = s[~s.index.duplicated(keep="last")]
    s.index = s.index.date
    return s


def _try(name: str, fn):
    # 보조 항목은 출처가 막혀도 나머지 항목으로 계산
    try:
        s = fn()
        return s if s is not None and len(s.dropna()) else None
    except Exception as e:
        print(f"[공포탐욕] {name} 건너뜀: {e}")
        return None


def _fred(series: str, start: dt.date) -> pd.Series:
    key = os.environ.get("FRED_API_KEY")
    if not key:
        raise RuntimeError("FRED_API_KEY 없음")
    r = requests.get(
        "https://api.stlouisfed.org/fred/series/observations",
        params={"series_id": series, "api_key": key, "file_type": "json", "observation_start": start.isoformat()},
        timeout=30,
    )
    r.raise_for_status()
    obs = [(dt.date.fromisoformat(o["date"]), float(o["value"])) for o in r.json()["observations"] if o["value"] != "."]
    return pd.Series(dict(obs)).sort_index()


_CREDIT_CACHE: dict[dt.date, list[dict]] = {}


def _credit_series(market: str, start: dt.date) -> pd.Series:
    col = {"KOSPI": "TMPV3", "KOSDAQ": "TMPV4"}[market]
    if start not in _CREDIT_CACHE:  # KOSPI·KOSDAQ이 같은 응답을 씀
        _CREDIT_CACHE[start] = _credit_rows(start)
    rows = _CREDIT_CACHE[start]
    s = pd.Series({dt.date(int(x["TMPV1"][:4]), int(x["TMPV1"][4:6]), int(x["TMPV1"][6:])): float(x[col]) for x in rows if x.get(col)})
    return s.sort_index()


def _flows_series(market: str) -> pd.Series:
    rows = db.select("market_flows", f"select=date,foreigner,institution&market=eq.{market}&order=date.desc&limit=2000")
    s = pd.Series({dt.date.fromisoformat(r["date"]): (r["foreigner"] or 0) + (r["institution"] or 0) for r in rows})
    return s.sort_index()


def own_inputs(symbol: str, vol_symbol: str | None, start: dt.date) -> dict[str, pd.Series]:
    """지수 하나의 공포탐욕 항목 전부. start는 계산용으로 충분히 앞(5년 이상)."""
    close = _closes(symbol, start)
    if vol_symbol:
        vol = _closes(vol_symbol, start).reindex(close.index).ffill()
    else:  # 한국은 공개 변동성 지수(VKOSPI)를 받을 곳이 없어 20일 실현 변동성
        vol = close.pct_change().rolling(20).std()
    korea = symbol.startswith("^K")
    # 국채: 미국은 IEF(7~10년물 ETF), 한국은 KOSEF 국고채10년 ETF
    bond = _try("국채 ETF", lambda: _closes("148070.KS" if korea else "IEF", start))
    parts = price_parts(close, vol, bond)
    if korea:
        market = "KOSPI" if symbol == "^KS11" else "KOSDAQ"
        credit = _try("신용융자", lambda: _credit_series(market, start))
        if credit is not None:
            parts["신용융자"] = credit.reindex(close.index).ffill().pct_change(20)  # 빚내서 사는 돈이 빨리 늘면 탐욕
        flows = _try("수급", lambda: _flows_series(market))
        if flows is not None:
            parts["수급"] = flows.reindex(close.index).rolling(20, min_periods=15).sum()  # 외국인+기관 20일 순매수(억원)
    else:
        hy = _try("하이일드 스프레드", lambda: _fred("BAMLH0A0HYM2", start))
        if hy is not None:
            parts["정크본드"] = -hy.reindex(close.index).ffill()  # CNN: 정크본드 수요. 스프레드가 좁을수록 탐욕
    return {k: v.reindex(close.index) for k, v in parts.items()} | {"_close": close, "_vol": vol}


OWN_DAYS = 1100  # 계산 방식이 바뀌어도 화면 3년치가 같은 방식이 되게 매번 3년치를 다시 저장
FETCH_DAYS = 365 * 6  # 3년 기준 z + 3년 기준 크기 조정 + 125일선


def collect_own(start: dt.date) -> None:
    start = min(start, dt.date.today() - dt.timedelta(days=OWN_DAYS))
    fetch_from = dt.date.today() - dt.timedelta(days=FETCH_DAYS)
    for series_id, name, symbol, vol_symbol in OWN_INDEXES:
        inp = own_inputs(symbol, vol_symbol, fetch_from)
        parts = {k: v for k, v in inp.items() if not k.startswith("_")}
        score = fear_greed(parts)
        print(f"[공포탐욕] {name}: 항목 {', '.join(parts)} / 현재 {score.iloc[-1]:.1f}")
        score = score[score.index >= start]
        _save(series_id, name, "점", "KR" if "KOS" in series_id else "US", {d.isoformat(): round(float(v), 1) for d, v in score.items()})


def _cnn_history() -> pd.Series:
    start = dt.date.today() - dt.timedelta(days=OWN_DAYS)
    r = requests.get(
        f"https://production.dataviz.cnn.io/index/fearandgreed/graphdata/{start.isoformat()}",
        headers={**UA, "Referer": "https://edition.cnn.com/", "Origin": "https://edition.cnn.com"},
        timeout=30,
    )
    r.raise_for_status()
    return pd.Series({dt.datetime.fromtimestamp(p["x"] / 1000, dt.timezone.utc).date(): p["y"] for p in r.json()["fear_and_greed_historical"]["data"]}).sort_index()


def _stats(s: pd.Series) -> str:
    return f"현재 {s.iloc[-1]:5.1f} | 평균 {s.mean():4.1f} 표준편차 {s.std():4.1f} | 25↓ {(s <= 25).mean() * 100:3.0f}% 75↑ {(s >= 75).mean() * 100:3.0f}%"


def compare(_start: dt.date | None = None) -> None:
    """시험용(only="공포탐욕 비교"): 예전·새 방식 값을 출력만 하고 저장하지 않음.

    S&P 500에 같은 계산을 해 CNN 지수와 얼마나 비슷한지(상관계수·평균 차이)로 방식을 검증함.
    """
    fetch_from = dt.date.today() - dt.timedelta(days=FETCH_DAYS)
    since = dt.date.today() - dt.timedelta(days=OWN_DAYS)
    cnn = _try("CNN", _cnn_history)
    for name, symbol, vol_symbol in [("S&P 500", "^GSPC", "^VIX")] + [(n.split()[0], s, v) for _, n, s, v in OWN_INDEXES]:
        inp = own_inputs(symbol, vol_symbol, fetch_from)
        parts = {k: v for k, v in inp.items() if not k.startswith("_")}
        old = fear_greed_v1(inp["_close"], inp["_vol"])
        old = old[old.index >= since]
        variants = {"예전": old}
        for m in ["rank3y", "rank1y", "z"]:
            v = fear_greed(parts, m)
            variants[m] = v[v.index >= since]
        new = variants["rank3y"]
        print(f"\n== {name} (항목: {', '.join(parts)}) ==")
        for label, sr in variants.items():
            line = f"  {label:6s}: {_stats(sr)}"
            if name == "S&P 500" and cnn is not None:
                j = pd.concat([sr, cnn[cnn.index >= since]], axis=1, join="inner").dropna()
                line += f" | CNN 대비 상관 {j.iloc[:, 0].corr(j.iloc[:, 1]):.2f}, 평균 차이 {(j.iloc[:, 0] - j.iloc[:, 1]).abs().mean():.1f}점"
            print(line)
        if name == "S&P 500" and cnn is not None:
            print(f"  CNN   : {_stats(cnn[cnn.index >= since])}")
        # 항목별 현재 z (어떤 요인이 점수를 움직이는지)
        print("  항목 점수(3년 백분위): " + ", ".join(f"{k} {_rank(v).dropna().iloc[-1]:.0f}" for k, v in parts.items() if len(_rank(v).dropna())))
        # 최근 월말 값 비교
        for d in sorted({x.replace(day=1) for x in new.index})[-12:]:
            m_old, m_new = old[old.index >= d], new[new.index >= d]
            print(f"    {d:%Y-%m} 첫날  예전 {m_old.iloc[0]:5.1f}  새 {m_new.iloc[0]:5.1f}")


def _credit_rows(start: dt.date) -> list[dict]:
    rows = []
    # 한 번에 1년씩 나눠 요청
    s = start
    while s <= dt.date.today():
        e = min(s + dt.timedelta(days=365), dt.date.today())
        r = requests.post(
            "https://freesis.kofia.or.kr/meta/getMetaDataList.do",
            headers={**UA, "Content-Type": "application/json", "Referer": "https://freesis.kofia.or.kr/"},
            json={"dmSearch": {"tmpV40": "1000000", "tmpV41": "1", "tmpV1": "D", "tmpV45": s.strftime("%Y%m%d"), "tmpV46": e.strftime("%Y%m%d"), "OBJ_NM": "STATSCU0100000070BO"}},
            timeout=30,
        )
        r.raise_for_status()
        rows += r.json().get("ds1") or []
        s = e + dt.timedelta(days=1)
    return rows


def collect_credit(start: dt.date) -> None:
    rows = _credit_rows(start)
    if not rows:
        raise RuntimeError("금융투자협회 신용융자 데이터 없음")
    for series_id, name, col in CREDIT:
        # 원 자료 단위는 백만원 → 조원
        points = {f"{x['TMPV1'][:4]}-{x['TMPV1'][4:6]}-{x['TMPV1'][6:]}": round(x[col] / 1e6, 2) for x in rows if x.get(col)}
        _save(series_id, name, "조원", "KR", points)


# Yahoo 이력 시작 전의 사상 최고 종가. KOSDAQ은 Yahoo가 2000-10부터라 닷컴 고점(2000-03-10)이 빠져 있음
PRIOR_PEAK = {"^KQ11": 2834.40}


def drawdown(close: pd.Series, prior_peak: float = 0) -> pd.Series:
    """사상 최고 종가 대비 하락률(%). 0 = 신고가."""
    return (close / close.cummax().clip(lower=prior_peak) - 1) * 100


MDD_YEARS = 20  # 장기 흐름을 보려고 20년치 저장 (최근 3년은 일별, 그 전은 주별 마지막 날)


def collect_mdd(start: dt.date) -> None:
    today = dt.date.today()
    since, daily_since = today - dt.timedelta(days=365 * MDD_YEARS + 5), today - dt.timedelta(days=1100)
    for series_id, name, symbol, country in MDD_INDEXES:
        # 고점은 전체 이력에서 찾아야 해서 상장 이후 전부 받음
        df = yf.Ticker(symbol).history(period="max", auto_adjust=False)
        if df.empty:
            raise RuntimeError(f"Yahoo {symbol} 데이터 없음")
        close = df["Close"].dropna()
        close = close[close > 0]
        close.index = close.index.date
        dd = drawdown(close, PRIOR_PEAK.get(symbol, 0))
        dd = dd[dd.index >= since]
        old = dd[dd.index < daily_since]
        week = pd.Series(["%d-%02d" % d.isocalendar()[:2] for d in old.index], index=old.index)
        old = old[~week.duplicated(keep="last")]  # 주마다 마지막 거래일
        dd = pd.concat([old, dd[dd.index >= daily_since]])
        print(f"[MDD] {name}: Yahoo 이력 {close.index[0]}~, 최고 {max(close.max(), PRIOR_PEAK.get(symbol, 0)):.2f}, 현재 {dd.iloc[-1]:.1f}%, 20년 최저 {dd.min():.1f}%({dd.idxmin()}), {len(dd)}개")
        _save(series_id, f"{name} 고점 대비 하락률(MDD)", "%", country, {d.isoformat(): round(float(v), 2) for d, v in dd.items()})


def collect(start: dt.date) -> None:
    failed = []
    for name, job in [("CNN", collect_cnn), ("자체 공포탐욕", collect_own), ("신용융자", collect_credit), ("MDD", collect_mdd)]:
        try:
            job(start)
        except Exception as e:  # 한 출처가 막혀도 나머지는 저장
            print(f"[심리 지표 {name}] 실패: {e}")
            failed.append(name)
    if failed:
        raise RuntimeError(f"심리 지표 실패: {', '.join(failed)}")
