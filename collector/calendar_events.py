"""주요 일정 달력 → calendar_events 테이블. 모든 날짜·시각은 한국 시간(KST)으로 저장함.

- FOMC: 연준 일정 페이지(fomccalendars.htm). 결정 발표는 마지막 날 14:00 ET
- 경제지표: FRED 발표 일정(CPI, 고용보고서). 08:30 ET
- 미국 실적: Yahoo(yfinance) 실적 발표일. 장 전/장 마감 후 구분
- 국내 실적: DART 기업설명회(IR) 개최 공시의 일시, 잠정실적 공시일
- 행사: 아래 EVENTS 목록(날짜가 공식 확정된 것만 적음)
대상 기업은 BIG_US·BIG_KR(주요 기업) + 관심종목 전체.
"""

import datetime as dt
import io
import os
import re
import time
import zipfile
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup

import db

ET = ZoneInfo("America/New_York")
KST = ZoneInfo("Asia/Seoul")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36"}
DART = "https://opendart.fss.or.kr/api"

# 시장에 영향 큰 기업(빅테크·반도체·AI 인프라·주요 업종 대표주). 관심종목 전체는 따로 더함
BIG_US = [
    ("AAPL", "애플"), ("MSFT", "마이크로소프트"), ("GOOGL", "알파벳"), ("AMZN", "아마존"),
    ("META", "메타"), ("NVDA", "엔비디아"), ("TSLA", "테슬라"), ("AVGO", "브로드컴"), ("TSM", "TSMC"),
    # 반도체·장비
    ("AMD", "AMD"), ("MU", "마이크론"), ("ASML", "ASML"), ("ARM", "Arm"), ("QCOM", "퀄컴"), ("INTC", "인텔"),
    ("MRVL", "마벨"), ("AMAT", "어플라이드 머티리얼즈"), ("LRCX", "램리서치"),
    # AI 인프라·서버·네트워크
    ("ORCL", "오라클"), ("DELL", "델"), ("SMCI", "슈퍼마이크로"), ("ANET", "아리스타"), ("CSCO", "시스코"),
    # 소프트웨어·플랫폼
    ("CRM", "세일즈포스"), ("ADBE", "어도비"), ("PLTR", "팔란티어"), ("NFLX", "넷플릭스"),
    # 업종 대표(실적 시즌 분위기)
    ("JPM", "JP모건"), ("WMT", "월마트"), ("COST", "코스트코"), ("LLY", "일라이릴리"),
]
# 국내 주요 기업. DART 고유번호는 securities 테이블에서 찾음(없으면 여기 적은 값)
BIG_KR = [
    ("005930", "삼성전자", "00126380"), ("000660", "SK하이닉스", "00164779"),
    ("373220", "LG에너지솔루션", None), ("207940", "삼성바이오로직스", None), ("005380", "현대차", None),
    ("000270", "기아", None), ("066570", "LG전자", None), ("006400", "삼성SDI", None), ("009150", "삼성전기", None),
    ("035420", "NAVER", None), ("035720", "카카오", None), ("068270", "셀트리온", None), ("105560", "KB금융", None),
    ("012450", "한화에어로스페이스", None), ("329180", "HD현대중공업", None), ("005490", "POSCO홀딩스", None),
]

# (시작일, 끝일, 이름, 메모, 주소) — 공식 발표로 확정된 날짜만. 현지 날짜 그대로(행사는 시차 의미 적음)
EVENTS = [
    ("2027-01-06", "2027-01-09", "CES 2027", "라스베이거스", "https://www.ces.tech/"),
]

# FRED 발표 (release_id, 이름)
FRED_RELEASES = [(10, "미국 CPI"), (50, "미국 고용보고서")]


def _kst(local: dt.datetime) -> dt.datetime:
    return local.astimezone(KST)


def _row(grp: str, when: dt.date, title: str, category: str, time_kst: str | None = None,
         note: str | None = None, url: str | None = None, tentative: bool = False, suffix: str = "") -> dict:
    return {
        "id": f"{grp}-{when.isoformat()}{suffix}", "date": when.isoformat(), "time_kst": time_kst,
        "category": category, "title": title, "note": note, "url": url, "tentative": tentative,
        "grp": grp, "source": "auto", "updated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    }


def _et_row(grp: str, day: dt.date, hh: int, mm: int, title: str, category: str, note: str, url: str | None = None) -> dict:
    k = _kst(dt.datetime(day.year, day.month, day.day, hh, mm, tzinfo=ET))
    return _row(grp, k.date(), title, category, k.strftime("%H:%M"), f"{note} (현지 {day.month}/{day.day} {hh:02d}:{mm:02d} ET)", url)


# ---------- FOMC ----------
MONTHS = {m: i + 1 for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"])}
MONTHS.update({m[:3]: v for m, v in list(MONTHS.items())})
MONTHS["sept"] = 9


def fomc() -> list[dict]:
    url = "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm"
    r = requests.get(url, headers=UA, timeout=30)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")
    rows, this_year = [], dt.date.today().year
    for panel in soup.select("div.panel"):
        head = panel.find(["h4", "h3", "h5"])
        m = re.search(r"(20\d\d) FOMC Meetings", head.get_text() if head else "")
        if not m or int(m.group(1)) < this_year - 1:
            continue
        year = int(m.group(1))
        for meet in panel.select(".fomc-meeting"):
            mon_el, date_el = meet.select_one(".fomc-meeting__month"), meet.select_one(".fomc-meeting__date")
            if not mon_el or not date_el:
                continue
            mon_txt, date_txt = mon_el.get_text(" ", strip=True), date_el.get_text(" ", strip=True)
            if re.search(r"unscheduled|notation|cancel", meet.get_text(" ").lower()):
                continue
            mon = MONTHS.get(mon_txt.split("/")[-1].strip().lower().rstrip("."))
            days = re.findall(r"\d{1,2}", date_txt)
            if not mon or not days:
                continue
            day = dt.date(year, mon, int(days[-1]))
            sep = "*" in date_txt
            note = "금리 결정·성명서, 30분 뒤 의장 기자회견" + (" · 점도표(경제전망) 발표" if sep else "")
            rows.append(_et_row("fomc", day, 14, 0, "FOMC 금리 결정", "FOMC", note, url))
    if not rows:
        raise RuntimeError(f"FOMC 일정을 못 찾음 (페이지 {len(r.text)}자)")
    return rows


# ---------- 경제지표(FRED 발표 일정) ----------
def fred_releases(since: dt.date) -> list[dict]:
    key = os.environ.get("FRED_API_KEY")
    if not key:
        print("FRED_API_KEY 없음, 경제지표 일정 건너뜀")
        return []
    rows = []
    for rid, name in FRED_RELEASES:
        r = requests.get("https://api.stlouisfed.org/fred/release/dates", timeout=30, params={
            "release_id": rid, "api_key": key, "file_type": "json", "include_release_dates_with_no_data": "true",
            "realtime_start": since.isoformat(), "realtime_end": (dt.date.today() + dt.timedelta(days=400)).isoformat(),
            "sort_order": "asc", "limit": 1000,
        })
        r.raise_for_status()
        for d in r.json().get("release_dates", []):
            day = dt.date.fromisoformat(d["date"])
            if day >= since:
                rows.append(_et_row(f"fred{rid}", day, 8, 30, f"{name} 발표", "경제지표", "미국 장 시작 전 발표"))
    return rows


# ---------- 미국 실적(Yahoo) ----------
def _us_note(local: dt.datetime) -> str:
    h = local.hour + local.minute / 60
    if 4 <= h < 9.5:
        return "장 시작 전"
    if h >= 16:
        return "장 마감 후"
    return "장중"


def us_earnings(tickers: list[tuple[str, str]], since: dt.date) -> tuple[list[dict], set[str]]:
    import yfinance as yf

    rows, done = [], set()
    for t, name in tickers:
        grp = f"earn-{t}"
        try:
            df = yf.Ticker(t).get_earnings_dates(limit=8)
        except Exception as e:
            print(f"[일정] {t} 실적일 실패: {e}")
            continue
        if df is None or df.empty:
            print(f"[일정] {t} 실적일 없음")
            continue
        n = 0
        for ts in df.index:
            local = ts.to_pydatetime().astimezone(ET)
            if local.date() < since:
                continue
            title = f"{name} 실적발표"
            future = local.date() >= dt.date.today()
            if local.hour == 0 and local.minute == 0:  # 시각 미정
                rows.append(_row(grp, local.date(), title, "실적", None, "발표 시각 미정", tentative=future))
            else:
                k = _kst(local)
                rows.append(_row(grp, k.date(), title, "실적", k.strftime("%H:%M"),
                                 f"{_us_note(local)} (현지 {local.month}/{local.day} {local:%H:%M} ET)"))
            n += 1
        done.add(grp)
        print(f"[일정] {t}: {n}건")
        time.sleep(0.5)
    return rows, done


# ---------- 국내 실적(DART) ----------
def _document(key: str, rcept_no: str) -> str:
    r = requests.get(f"{DART}/document.xml", params={"crtfc_key": key, "rcept_no": rcept_no}, timeout=60)
    r.raise_for_status()
    zf = zipfile.ZipFile(io.BytesIO(r.content))
    html = "".join(zf.read(n).decode("utf-8", "replace") for n in zf.namelist())
    return re.sub(r"\s+", " ", BeautifulSoup(html, "html.parser").get_text(" "))


DATE_RE = re.compile(r"(20\d\d)\s*(?:[-./]|년)\s*(\d{1,2})\s*(?:[-./]|월)\s*(\d{1,2})")


def _ir_when(text: str) -> tuple[dt.date, str | None] | None:
    """IR 공시 본문에서 '일시' 다음 첫 날짜와 시각."""
    i = text.find("일시")
    m = DATE_RE.search(text, i if i >= 0 else 0)
    if not m:
        return None
    day = dt.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    tm = re.search(r"(\d{1,2})\s*:\s*(\d{2})", text[m.end(): m.end() + 60])
    return day, (f"{int(tm.group(1)):02d}:{tm.group(2)}" if tm else None)


def _prelim_guess(rows: list[dict], grp: str, name: str) -> dict | None:
    """삼성전자 잠정실적 예상일: 분기 다음 달 8일 전후(평일). 해당 분기 잠정 공시가 이미 있으면 없음."""
    today = dt.date.today()
    q_end_month = ((today.month - 1) // 3) * 3  # 직전 분기 말 월(0이면 전년 12월)
    target = dt.date(today.year, q_end_month + 1, 8)
    if target < today - dt.timedelta(days=20):
        nm = q_end_month + 4
        target = dt.date(today.year + (nm > 12), (nm - 1) % 12 + 1, 8)
    if any(r["grp"] == grp and "잠정" in r["title"] and abs((dt.date.fromisoformat(r["date"]) - target).days) <= 25 for r in rows):
        return None
    if target < today:
        return None
    while target.weekday() >= 5:
        target -= dt.timedelta(days=1)
    return _row(grp, target, f"{name} 잠정실적", "실적", None, "통상 분기 다음 달 8일 전후. 확정 공시 아님", tentative=True, suffix="-est")


def kr_earnings(companies: list[tuple[str, str, str]], since: dt.date) -> tuple[list[dict], set[str]]:
    key = os.environ.get("DART_API_KEY")
    if not key:
        print("DART_API_KEY 없음, 국내 실적 일정 건너뜀")
        return [], set()
    rows, done = [], set()
    for ticker, name, corp in companies:
        grp = f"earn-{ticker}"
        try:
            r = requests.get(f"{DART}/list.json", timeout=30, params={
                "crtfc_key": key, "corp_code": corp, "bgn_de": (dt.date.today() - dt.timedelta(days=100)).strftime("%Y%m%d"),
                "end_de": dt.date.today().strftime("%Y%m%d"), "pblntf_ty": "I", "page_count": 100,
            }).json()
        except Exception as e:
            print(f"[일정] {name} DART 실패: {e}")
            continue
        items = r.get("list", []) if r.get("status") in ("000", "013") else None
        if items is None:
            print(f"[일정] {name} DART 응답 {r.get('status')} {r.get('message')}")
            continue
        n = 0
        for it in items:
            title, rno = it["report_nm"].replace(" ", ""), it["rcept_no"]
            url = f"https://dart.fss.or.kr/dsaf001/main.do?rcpNo={rno}"
            if "정정" in title:
                continue
            if "기업설명회" in title:
                try:
                    when = _ir_when(_document(key, rno))
                except Exception as e:
                    print(f"[일정] {name} IR 원문 실패: {e}")
                    when = None
                if when and when[0] >= since:
                    rows.append(_row(grp, when[0], f"{name} 기업설명회(IR)", "실적", when[1], "DART 기업설명회 개최 공시", url, suffix="-ir"))
                    n += 1
            elif "잠정" in title and "실적" in title:
                d = dt.date.fromisoformat(f"{it['rcept_dt'][:4]}-{it['rcept_dt'][4:6]}-{it['rcept_dt'][6:]}")
                if d >= since:
                    rows.append(_row(grp, d, f"{name} 잠정실적 발표", "실적", None, it["report_nm"].strip(), url, suffix="-p"))
                    n += 1
        if ticker == "005930":
            g = _prelim_guess(rows, grp, name)
            if g:
                rows.append(g)
        done.add(grp)
        print(f"[일정] {name}: {n}건")
        time.sleep(0.3)
    return rows, done


def events() -> list[dict]:
    rows = []
    for start, end, name, note, url in EVENTS:
        s, e = dt.date.fromisoformat(start), dt.date.fromisoformat(end)
        rows.append(_row("event", s, name, "행사", None, f"{s.month}/{s.day}~{e.month}/{e.day} · {note}", url))
    return rows


def collect() -> None:
    since = dt.date.today() - dt.timedelta(days=90)
    # 관심종목 전체(★ 포함) + 주요 기업
    mine = db.select("watchlist", "select=ticker,market,name,corp_code") if db.URL else []
    codes = {}
    if db.URL:
        tickers = ",".join(t for t, _, c in BIG_KR if not c)
        codes = {r["ticker"]: r["corp_code"] for r in db.select("securities", f"select=ticker,corp_code&ticker=in.({tickers})")}
    us = BIG_US + [(s["ticker"], s["name"]) for s in mine if s["market"] == "US" and s["ticker"] not in {t for t, _ in BIG_US}]
    kr = [(t, n, c or codes.get(t)) for t, n, c in BIG_KR if c or codes.get(t)]
    kr += [(s["ticker"], s["name"], s["corp_code"]) for s in mine
           if s["market"] == "KR" and s.get("corp_code") and s["ticker"] not in {t for t, _, _ in BIG_KR}]
    missing = [n for t, n, c in BIG_KR if not (c or codes.get(t))]
    if missing:
        print(f"[일정] DART 고유번호 없음: {', '.join(missing)}")

    batches: list[tuple[set[str], list[dict]]] = []
    errors = []
    for name, job in [("FOMC", lambda: ({"fomc"}, fomc())),
                      ("경제지표", lambda: ({f"fred{r}" for r, _ in FRED_RELEASES}, fred_releases(since))),
                      ("행사", lambda: ({"event"}, events()))]:
        try:
            grps, rows = job()
            batches.append((grps if rows else set(), rows))
            print(f"[일정] {name}: {len(rows)}건")
        except Exception as e:
            print(f"[일정] {name} 실패: {e}")
            errors.append(name)
    for job in (lambda: us_earnings(us, since), lambda: kr_earnings(kr, since)):
        rows, done = job()
        batches.append((done, rows))

    today = dt.date.today().isoformat()
    soon = sorted((r for _, rows in batches for r in rows if r["date"] >= today), key=lambda r: (r["date"], r["time_kst"] or ""))
    for r in soon[:40]:  # 로그로 확인용
        print(f"  {r['date']} {r['time_kst'] or '--:--'} [{r['category']}] {r['title']}{' (예상)' if r['tentative'] else ''} · {r['note'] or ''}")
    for grps, rows in batches:
        for g in grps:  # 날짜가 바뀐 일정이 남지 않게 다시 받은 묶음의 최근 일정은 지우고 새로 씀
            db.delete("calendar_events", f"grp=eq.{g}&date=gte.{since.isoformat()}")
        # 같은 날 같은 종류 공시가 여러 건이면 id가 겹쳐 업서트가 500 → id 기준 하나만
        db.upsert("calendar_events", list({r["id"]: r for r in rows}.values()))
    if errors:
        raise RuntimeError(f"일부 일정 실패: {', '.join(errors)}")
