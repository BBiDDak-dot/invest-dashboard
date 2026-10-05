"""심리 지표 수집: 공포탐욕지수(미국 CNN·자체 계산)와 신용융자 잔고(금융투자협회).

- 미국(S&P 500): CNN Fear & Greed 지수를 그대로 받음.
- NASDAQ·KOSPI·KOSDAQ: 공개된 지수가 없어 CNN 방식을 줄여 직접 계산함.
  (1) 125일 이동평균 대비 괴리, (2) 52주 고저 범위 안의 위치, (3) RSI(14), (4) 변동성(낮을수록 탐욕)
  각 항목을 최근 1년(252영업일) 안의 백분위(0~100)로 바꾼 뒤 평균함.
- 신용융자 잔고: 금융투자협회 종합통계(freesis) 유가증권·코스닥 신용거래융자, 조원.
"""

import datetime as dt

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
SERIES_IDS = [CNN_ID] + [s[0] for s in OWN_INDEXES] + [s[0] for s in CREDIT]


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


def _pct_rank(s: pd.Series, window: int = 252) -> pd.Series:
    # 오늘 값이 최근 1년 값 중 몇 %보다 큰지 (0~100)
    return s.rolling(window).apply(lambda x: (x[:-1] < x[-1]).mean() * 100, raw=True)


def fear_greed(close: pd.Series, vol: pd.Series) -> pd.Series:
    ma = close.rolling(125).mean()
    hi, lo = close.rolling(252).max(), close.rolling(252).min()
    diff = close.diff()
    up = diff.clip(lower=0).ewm(alpha=1 / 14, adjust=False).mean()
    down = (-diff.clip(upper=0)).ewm(alpha=1 / 14, adjust=False).mean()
    parts = [
        _pct_rank(close / ma - 1),
        _pct_rank((close - lo) / (hi - lo)),
        _pct_rank(100 - 100 / (1 + up / down)),
        100 - _pct_rank(vol),
    ]
    return pd.concat(parts, axis=1).mean(axis=1, skipna=False).dropna()


def _closes(symbol: str, start: dt.date) -> pd.Series:
    df = yf.Ticker(symbol).history(start=start.isoformat(), auto_adjust=False)
    if df.empty:
        raise RuntimeError(f"Yahoo {symbol} 데이터 없음")
    s = df["Close"].dropna()
    s.index = s.index.date
    return s


def collect_own(start: dt.date) -> None:
    # 125일 평균·1년 백분위를 내려면 앞쪽으로 2년 더 받아야 함
    fetch_from = start - dt.timedelta(days=730)
    for series_id, name, symbol, vol_symbol in OWN_INDEXES:
        close = _closes(symbol, fetch_from)
        if vol_symbol:
            vol = _closes(vol_symbol, fetch_from).reindex(close.index).ffill()
        else:
            vol = close.pct_change().rolling(20).std()
        score = fear_greed(close, vol)
        score = score[score.index >= start]
        _save(series_id, name, "점", "KR" if "KOS" in series_id else "US", {d.isoformat(): round(float(v), 1) for d, v in score.items()})


def collect_credit(start: dt.date) -> None:
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
    if not rows:
        raise RuntimeError("금융투자협회 신용융자 데이터 없음")
    for series_id, name, col in CREDIT:
        # 원 자료 단위는 백만원 → 조원
        points = {f"{x['TMPV1'][:4]}-{x['TMPV1'][4:6]}-{x['TMPV1'][6:]}": round(x[col] / 1e6, 2) for x in rows if x.get(col)}
        _save(series_id, name, "조원", "KR", points)


def collect(start: dt.date) -> None:
    failed = []
    for name, job in [("CNN", collect_cnn), ("자체 공포탐욕", collect_own), ("신용융자", collect_credit)]:
        try:
            job(start)
        except Exception as e:  # 한 출처가 막혀도 나머지는 저장
            print(f"[심리 지표 {name}] 실패: {e}")
            failed.append(name)
    if failed:
        raise RuntimeError(f"심리 지표 실패: {', '.join(failed)}")
