"""유가 선물 곡선(콘탱고·백워데이션) 수집 → macro 테이블(series_id 접두어 CURVE).

Yahoo 개별 월물 시세(예: CLF27.NYM)로 WTI·브렌트·휘발유(RBOB)·경유(ULSD)의 근월물~12개월 곡선을 만듦.
- CURVE:{root}       오늘 곡선. date=인도월(YYYY-MM-01), value=가격. 매번 통째로 바꿈.
- CURVE:{root}:M1M2  (근월물 ÷ 차월물 − 1) × 100, 일별 이력 (+면 백워데이션, −면 콘탱고)
- CURVE:{root}:M1M6  (근월물 ÷ 6번째 월물 − 1) × 100, 일별 이력
만기 지난 월물도 Yahoo에 남아 있으면 그걸로 과거 이력을 채우고, 없으면 오늘부터 쌓임.
"""

import datetime as dt

import pandas as pd
import yfinance as yf

import db

PRODUCTS = [  # (루트, 이름, 단위)
    ("CL", "WTI", "달러/배럴"),
    ("BZ", "브렌트유", "달러/배럴"),
    ("RB", "휘발유 RBOB", "달러/갤런"),
    ("HO", "경유 ULSD", "달러/갤런"),
]
MONTH_CODES = "FGHJKMNQUVXZ"
SERIES_IDS = [f"CURVE:{r}{s}" for r, *_ in PRODUCTS for s in ("", ":M1M2", ":M1M6")]
STRIP_LEN = 12
ROLL_DAYS = 3  # 만기 직전 며칠은 거래가 얇아서 다음 월물을 근월물로 봄


def _months(first: dt.date, n: int) -> list[dt.date]:
    out, y, m = [], first.year, first.month
    for _ in range(n):
        out.append(dt.date(y, m, 1))
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def _ticker(root: str, month: dt.date) -> str:
    return f"{root}{MONTH_CODES[month.month - 1]}{month.year % 100:02d}.NYM"


def _download(tickers: list[str], start: dt.date) -> pd.DataFrame:
    df = yf.download(tickers, start=start.isoformat(), auto_adjust=False, progress=False, threads=True)
    if df.empty:
        return pd.DataFrame()
    close = df["Close"] if isinstance(df.columns, pd.MultiIndex) else df[["Close"]].rename(columns={"Close": tickers[0]})
    close.index = pd.to_datetime(close.index).date
    return close.dropna(how="all", axis=1)


def _save(series_id: str, name: str, unit: str, points: list[tuple[str, float]], replace=False) -> None:
    db.upsert("macro_series", [{"series_id": series_id, "source": "Yahoo", "name": name, "unit": unit, "country": "US"}])
    if replace:
        db.delete("macro_observations", f"series_id=eq.{series_id}")
    elif points:  # 이번에 계산한 기간은 새로 씀 (빠진 날·주말 줄이 남지 않게)
        db.delete("macro_observations", f"series_id=eq.{series_id}&date=gte.{points[0][0]}")
    db.upsert("macro_observations", [{"series_id": series_id, "date": d, "value": round(v, 4)} for d, v in points])


def collect_one(root: str, name: str, unit: str, start: dt.date) -> None:
    today = dt.date.today()
    first = dt.date(start.year, start.month, 1)
    months = _months(first, (today.year - first.year) * 12 + today.month - first.month + 18)
    tickers = {_ticker(root, m): m for m in months}
    close = _download(list(tickers), start)
    if close.empty:
        raise RuntimeError(f"{name} 월물 시세 없음")
    # Yahoo는 일요일 저녁 장을 따로 한 줄로 줘서(대부분 빈 값) 주말 줄은 버림
    close = close[[d.weekday() < 5 for d in close.index]]
    last_day = max(close.index)
    last_seen = {t: close[t].last_valid_index() for t in close.columns}
    # 먼 월물은 거래가 없는 날이 있어 3일까지는 직전 값으로 채움 (만기 뒤로는 안 채움)
    filled = close.ffill(limit=3)
    for t, d in last_seen.items():
        filled.loc[[i for i in filled.index if i > d], t] = float("nan")
    close = filled
    expired = [t for t, d in last_seen.items() if d < last_day - dt.timedelta(days=5)]
    print(f"{name}: 월물 {len(close.columns)}개 받음 (만기 지난 월물 {len(expired)}개), 마지막 {last_day}")

    def strip_on(day) -> list[tuple[dt.date, float]]:
        out = []
        for t in sorted(close.columns, key=lambda t: tickers[t]):
            v = close.at[day, t]
            if v != v or v <= 0:  # NaN·이상치
                continue
            if t in expired and (last_seen[t] - day).days <= ROLL_DAYS:
                continue
            out.append((tickers[t], float(v)))
        return out[:STRIP_LEN]

    # 오늘 곡선
    strip = strip_on(last_day)
    if len(strip) < 6:
        raise RuntimeError(f"{name} 곡선 월물 부족({len(strip)}개)")
    _save(f"CURVE:{root}", f"{name} 선물 곡선 ({last_day})", unit, [(m.isoformat(), v) for m, v in strip], replace=True)

    # 스프레드 이력. 만기 지난 월물이 없으면 과거 날짜의 근월물을 알 수 없어서 최근 며칠만 씀
    days = sorted(close.index)
    if len(expired) < 3:
        days = [d for d in days if d >= last_day - dt.timedelta(days=7)]
    m1m2, m1m6 = [], []
    for d in days:
        s = strip_on(d)
        # 근월물이 실제 첫 월물인지 확인 (중간 월물이 빠진 날은 건너뜀)
        if len(s) >= 6 and all((s[i + 1][0].year - s[i][0].year) * 12 + s[i + 1][0].month - s[i][0].month == 1 for i in range(5)):
            m1m2.append((d.isoformat(), (s[0][1] / s[1][1] - 1) * 100))
            m1m6.append((d.isoformat(), (s[0][1] / s[5][1] - 1) * 100))
    _save(f"CURVE:{root}:M1M2", f"{name} 근월물−차월물 스프레드", "%", m1m2)
    _save(f"CURVE:{root}:M1M6", f"{name} 근월물−6개월물 스프레드", "%", m1m6)
    print(f"{name}: 곡선 {len(strip)}개월, 스프레드 이력 {len(m1m6)}일 (최근 M1/M6 {m1m6[-1][1] if m1m6 else '-'}%)")


def collect(start: dt.date) -> None:
    # 평소엔 최근 며칠만 받음(월물 수가 많아서). 이력을 처음 채울 땐 --days 1100으로 실행
    failed = []
    for root, name, unit in PRODUCTS:
        try:
            collect_one(root, name, unit, start)
        except Exception as e:
            print(f"[유가 곡선 {name}] 실패: {e}")
            failed.append(name)
    if failed:
        raise RuntimeError(f"유가 곡선 실패: {', '.join(failed)}")
