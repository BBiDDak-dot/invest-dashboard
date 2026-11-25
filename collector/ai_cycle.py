"""AI 사이클 지표 수집 → macro 테이블(series_id 접두어 AI:).

- OpenRouter 토큰 사용량: 공식 Data API(rankings-daily, 2025-01-01부터, 상위 50개 모델+기타의 일별 토큰).
  OPENROUTER_API_KEY(무료 계정 키도 됨)가 있어야 함. 주(월~일) 단위로 합쳐 저장.
    AI:OR_TOKENS          주간 총 토큰(조 토큰)
    AI:OR_SHARE:{개발사}   주간 토큰 점유율(%), 최근 8주 상위 개발사 6곳 + 기타
  매번 2025-01-01부터 통째로 다시 계산함(요청 2~3번).
- 하이퍼스케일러 설비투자(CAPEX): SEC companyfacts의 유형자산 취득(현금흐름표). 분기 보고서는 연초부터 누적이라 빼서 분기값을 만듦.
    AI:CAPEX:{티커}  분기 CAPEX(십억$), AI:CAPEX:TOTAL 5사 합계(같은 달력 분기로 묶음)
- TSMC 월매출: 대만 공시시스템(MOPS) 월별 상장사 매출 표에서 2330 행. 단위 십억 대만달러.
    AI:TSMC_REV  월매출, AI:TSMC_YOY 전년 같은 달 대비 %
"""

import datetime as dt
import os
import re
from collections import defaultdict

import requests

import db

OR_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OR_URL = "https://openrouter.ai/api/v1/datasets/rankings-daily"
OR_START = dt.date(2025, 1, 1)
OR_TOP = 6
AUTHOR_NAMES = {
    "openai": "OpenAI", "anthropic": "Anthropic", "google": "Google", "x-ai": "xAI", "deepseek": "DeepSeek",
    "qwen": "Qwen(알리바바)", "meta-llama": "Meta", "mistralai": "Mistral", "moonshotai": "Moonshot(Kimi)",
    "z-ai": "Zhipu(GLM)", "minimax": "MiniMax", "other": "기타",
}

SEC_HEADERS = {"User-Agent": "invest-dashboard admin@example.com"}
CAPEX_COS = [  # (티커, CIK, 이름)
    ("MSFT", 789019, "마이크로소프트"),
    ("GOOGL", 1652044, "알파벳"),
    ("AMZN", 1018724, "아마존"),
    ("META", 1326801, "메타"),
    ("ORCL", 1341439, "오라클"),
]
CAPEX_TAGS = ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"]
CAPEX_FROM = dt.date(2020, 1, 1)

MOPS_URL = "https://mopsov.twse.com.tw/nas/t21/sii/t21sc03_{roc}_{m}_0.html"
TSMC_MONTHS = 60


def _save(series_id: str, source: str, name: str, unit: str, points: dict[str, float], replace=True) -> None:
    db.upsert("macro_series", [{"series_id": series_id, "source": source, "name": name, "unit": unit, "country": "US"}])
    if replace:
        db.delete("macro_observations", f"series_id=eq.{series_id}")
    db.upsert("macro_observations", [{"series_id": series_id, "date": d, "value": round(v, 4)} for d, v in sorted(points.items())])


# ---------- OpenRouter ----------

def _or_rows() -> list[dict]:
    rows, start, today = [], OR_START, dt.date.today()
    while start < today:
        end = min(start + dt.timedelta(days=365), today - dt.timedelta(days=1))
        r = requests.get(OR_URL, params={"start_date": start.isoformat(), "end_date": end.isoformat()},
                         headers={"Authorization": f"Bearer {OR_KEY}"}, timeout=60)
        if r.status_code != 200:
            raise RuntimeError(f"OpenRouter {r.status_code}: {r.text[:200]}")
        data = r.json().get("data") or []
        print(f"OpenRouter {start}~{end}: {len(data)}행")
        rows += data
        start = end + dt.timedelta(days=1)
    return rows


def collect_openrouter() -> None:
    if not OR_KEY:
        print("OPENROUTER_API_KEY 없음 → OpenRouter 토큰 건너뜀")
        return
    week_tok: dict[dt.date, float] = defaultdict(float)
    week_author: dict[dt.date, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    week_days: dict[dt.date, set] = defaultdict(set)
    for row in _or_rows():
        d = dt.date.fromisoformat(row["date"][:10])
        wk = d - dt.timedelta(days=d.weekday())  # 월요일
        tok = float(row.get("total_tokens") or 0)
        slug = row.get("model_permaslug") or "other"
        author = slug.split("/")[0] if "/" in slug else "other"
        week_tok[wk] += tok
        week_author[wk][author] += tok
        week_days[wk].add(d)
    weeks = sorted(w for w in week_tok if len(week_days[w]) == 7)  # 다 찬 주만
    if not weeks:
        raise RuntimeError("OpenRouter 데이터 없음")
    _save("AI:OR_TOKENS", "OpenRouter", "OpenRouter 주간 토큰 사용량", "조 토큰/주",
          {w.isoformat(): week_tok[w] / 1e12 for w in weeks})

    recent = defaultdict(float)
    for w in weeks[-8:]:
        for a, t in week_author[w].items():
            recent[a] += t
    top = [a for a, _ in sorted(recent.items(), key=lambda x: -x[1]) if a != "other"][:OR_TOP]
    db.delete("macro_series", "series_id=like.AI:OR_SHARE:*")  # 순위가 바뀌면 빠진 개발사도 지움
    for a in top + ["other"]:
        pts = {}
        for w in weeks:
            if a == "other":
                t = sum(v for k, v in week_author[w].items() if k not in top)
            else:
                t = week_author[w].get(a, 0.0)
            pts[w.isoformat()] = t / week_tok[w] * 100
        _save(f"AI:OR_SHARE:{a}", "OpenRouter", AUTHOR_NAMES.get(a, a), "%", pts)


# ---------- 하이퍼스케일러 CAPEX ----------

def _quarters(facts: list[dict]) -> dict[dt.date, float]:
    """누적(YTD)·분기 값이 섞인 현금흐름 항목 → {분기말: 분기값}"""
    latest: dict[tuple, tuple] = {}  # (start, end) → (filed, val)  가장 늦게 제출된 값(정정 반영)
    for f in facts:
        if not f.get("start") or f.get("form") not in ("10-Q", "10-K", "10-Q/A", "10-K/A"):
            continue
        key = (f["start"], f["end"])
        if key not in latest or f["filed"] > latest[key][0]:
            latest[key] = (f["filed"], float(f["val"]))
    by_start: dict[str, list] = defaultdict(list)
    for (s, e), (_, v) in latest.items():
        by_start[s].append((e, v))
    out: dict[dt.date, float] = {}
    for s, items in by_start.items():
        items.sort()
        prev_end, prev_val = dt.date.fromisoformat(s) - dt.timedelta(days=1), 0.0
        for e, v in items:
            end = dt.date.fromisoformat(e)
            days = (end - prev_end).days
            if 80 <= days <= 100:  # 앞 누적값과 정확히 한 분기 차이일 때만
                out.setdefault(end, v - prev_val)
            prev_end, prev_val = end, v
    return out


def _cal_quarter(d: dt.date) -> str:
    """분기말 날짜를 달력 분기 마지막 달 1일로 (예: 오라클 2월말 → 3월, 마소 6월말 → 6월)"""
    m = ((d.month - 1) // 3 + 1) * 3
    return dt.date(d.year, m, 1).isoformat()


def collect_capex() -> None:
    total: dict[str, float] = defaultdict(float)
    count: dict[str, int] = defaultdict(int)
    for ticker, cik, name in CAPEX_COS:
        r = requests.get(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json", headers=SEC_HEADERS, timeout=60)
        r.raise_for_status()
        gaap = r.json()["facts"].get("us-gaap", {})
        q: dict[dt.date, float] = {}
        for tag in CAPEX_TAGS:  # 앞 태그를 우선, 빈 분기만 뒤 태그로 채움
            for end, v in _quarters(gaap.get(tag, {}).get("units", {}).get("USD", [])).items():
                q.setdefault(end, v)
        q = {e: v for e, v in q.items() if e >= CAPEX_FROM}
        if not q:
            print(f"[CAPEX] {ticker} 값 없음")
            continue
        pts = {}
        for e, v in q.items():
            cq = _cal_quarter(e)
            pts[cq] = v / 1e9
            total[cq] += v / 1e9
            count[cq] += 1
        _save(f"AI:CAPEX:{ticker}", "SEC", f"{name} CAPEX", "십억$", pts)
        print(f"[CAPEX] {ticker}: {len(pts)}분기, 최근 {max(pts)} {pts[max(pts)]:.1f}")
    n = len(CAPEX_COS)
    _save("AI:CAPEX:TOTAL", "SEC", "빅테크 5사 CAPEX 합계", "십억$", {k: v for k, v in total.items() if count[k] == n})


# ---------- TSMC 월매출 ----------

def _mops_month(y: int, m: int) -> tuple[float, float] | None:
    """(당월 매출, 전년 같은 달 매출) 천 대만달러"""
    r = requests.get(MOPS_URL.format(roc=y - 1911, m=m), headers={"User-Agent": "Mozilla/5.0"}, timeout=30)
    if r.status_code != 200:
        return None
    r.encoding = "big5"
    row = re.search(r"<td[^>]*>\s*2330\s*</td>(.*?)</tr>", r.text, re.S)
    if not row:
        return None
    cells = [re.sub(r"<[^>]+>|&nbsp;|,|\s", "", c) for c in re.findall(r"<td[^>]*>(.*?)</td>", row[1], re.S)]
    # [회사명, 당월, 전월, 전년 같은 달, 전월 대비%, 전년 대비%, 누적, 전년 누적, 누적 증감%, 비고]
    try:
        return float(cells[1]), float(cells[3])
    except (ValueError, IndexError):
        return None


def collect_tsmc() -> None:
    have = {r["date"] for r in db.select("macro_observations", "select=date&series_id=eq.AI:TSMC_REV")}
    today = dt.date.today()
    rev, yoy = {}, {}
    y, m = today.year, today.month
    for _ in range(TSMC_MONTHS):
        m, y = (m - 1, y) if m > 1 else (12, y - 1)
        key = dt.date(y, m, 1).isoformat()
        if key in have and len(have) > 12 and key < (today - dt.timedelta(days=70)).isoformat():
            break  # 이미 받은 과거 달 (정정은 거의 없음)
        got = _mops_month(y, m)
        if not got:
            continue
        rev[key] = got[0] / 1e6  # 천 대만달러 → 십억 대만달러
        if got[1]:
            yoy[key] = (got[0] / got[1] - 1) * 100
    if not rev and not have:
        raise RuntimeError("MOPS 월매출 표를 못 읽음")
    _save("AI:TSMC_REV", "MOPS", "TSMC 월매출", "십억 대만달러", rev, replace=False)
    _save("AI:TSMC_YOY", "MOPS", "TSMC 월매출 YoY", "%", yoy, replace=False)
    print(f"TSMC 월매출 {len(rev)}개월 저장")


def collect() -> None:
    failed = []
    for name, job in [("OpenRouter", collect_openrouter), ("CAPEX", collect_capex), ("TSMC", collect_tsmc)]:
        try:
            job()
        except Exception as e:
            print(f"[AI 지표 {name}] 실패: {e}")
            failed.append(name)
    if failed:
        raise RuntimeError(f"AI 지표 실패: {', '.join(failed)}")
