"""한국 품목별 월간 수출 → macro 테이블(series_id 접두어 EXP:). 수집기 이름 "수출 데이터".

출처: 관세청 수출입무역통계 OpenAPI(data.go.kr "관세청_품목별 국가별 수출입실적(GW)").
  GitHub secret DATA_GO_KR_KEY(공공데이터포털 일반 인증키)가 있어야 함. 없으면 건너뜀.
  매월 15일 전후 전월 확정치가 올라옴. 한 번에 최대 1년 조회라 해마다 나눠 부름.

품목마다 두 시리즈를 저장함 (날짜는 그 달 1일).
  EXP:{key}:USD  수출 금액(백만$)
  EXP:{key}:KG   수출 중량(톤)  → 화면에서 금액÷중량으로 단가($/kg) 계산
HS코드가 여러 개인 품목은 합계. 처음엔 FROM부터 전부, 그 뒤엔 최근 14개월만 다시 받음(수정치 반영).

only="수출 품목 점검"이면 HS 상위 코드 아래 10단위 품목명·최근 금액을 출력만 함(코드 확인용).
"""

import datetime as dt
import os
import time
import urllib.parse
import xml.etree.ElementTree as ET
from collections import defaultdict

import requests

import db

KEY = urllib.parse.unquote(os.environ.get("DATA_GO_KR_KEY", ""))  # Encoding 키를 넣어도 되게 풀어 둠
URL = "https://apis.data.go.kr/1220000/nitemtrade/getNitemtradeList"
FROM = dt.date(2019, 1, 1)
RECENT_MONTHS = 14

# (key, 그룹, 이름, HS코드들) — HS는 관세청 HSK 10단위(앞자리만 쓰면 그 아래 전체)
ITEMS = [
    ("DRAM", "반도체", "DRAM (모듈 제외)", ["8542321010"]),
    ("DRAM_MODULE", "반도체", "DRAM 모듈", ["8473304060"]),
    ("NAND", "반도체", "NAND 플래시", ["8542321030"]),
    ("MCP", "반도체", "MCP (HBM 포함)", ["8542323000"]),
    ("SSD", "반도체", "SSD", ["8523511000"]),
    ("COSMETIC_BASIC", "소비재", "기초화장품", ["3304991000"]),
    ("COSMETIC", "소비재", "화장품 전체", ["3303", "3304", "3305", "3307"]),
    ("RAMEN", "소비재", "라면", ["1902301010"]),
    ("TRANSFORMER", "산업재", "전력용 변압기 (650kVA 초과)", ["850422", "850423"]),
    ("CABLE", "산업재", "전선·케이블", ["8544"]),
    ("SHIP", "산업재", "선박 (상선)", ["8901"]),
    ("BATTERY", "산업재", "리튬이온 배터리", ["850760"]),
]
# 화면용 합성 품목: (key, 이름, 더할 품목 key들)
COMBOS = [("DRAM_ALL", "반도체", "DRAM (모듈 포함)", ["DRAM", "DRAM_MODULE"])]

# 점검용: 이 상위 코드 아래 10단위 품목을 나열
CHECK_PREFIXES = ["854232", "847330", "852351", "330499", "190230", "8504"]


def _page(hs: str, y0: str, y1: str, page: int) -> ET.Element:
    params = {"serviceKey": KEY, "strtYymm": y0, "endYymm": y1, "hsSgn": hs, "numOfRows": 10000, "pageNo": page}
    for attempt in range(3):
        try:
            r = requests.get(URL, params=params, timeout=60)
            if r.status_code == 200 and r.text.lstrip().startswith("<"):
                break
        except requests.RequestException as e:
            print(f"관세청 {hs} {y0} 재시도: {e}")
        time.sleep(2 * (attempt + 1))
    else:
        raise RuntimeError(f"관세청 API {hs} {y0}~{y1} 응답 이상: {r.status_code} {r.text[:200]}")
    root = ET.fromstring(r.content)
    code = root.findtext(".//resultCode") or root.findtext(".//returnReasonCode")
    if code not in (None, "00", "0", "000"):
        msg = root.findtext(".//resultMsg") or root.findtext(".//returnAuthMsg") or ""
        raise RuntimeError(f"관세청 API 오류 {code}: {msg}")
    return root


def _call(hs: str, y0: str, y1: str) -> list[dict]:
    """응답 행 전부(국가×10단위 품목×월 + 기간 '총계' 행 1개). 행이 많으면 쪽을 넘김."""
    rows: list[dict] = []
    for page in range(1, 20):
        root = _page(hs, y0, y1, page)
        got = [{c.tag: (c.text or "").strip() for c in item} for item in root.iter("item")]
        rows += got
        total = int(root.findtext(".//totalCount") or 0)
        if not got or not total or len(rows) >= total:
            break
    return rows


def _ym(row: dict) -> str | None:
    """'2024.01' → '2024-01-01'. 합계 행('총계' 등)은 None."""
    y = row.get("year", "")
    if len(y) == 7 and y[4] == "." and y[:4].isdigit() and y[5:].isdigit():
        return f"{y[:4]}-{y[5:]}-01"
    return None


def _num(v: str) -> float:
    try:
        return float(v.replace(",", ""))
    except ValueError:
        return 0.0


def _is_total_country(row: dict) -> bool:
    c = (row.get("statCd") or "").strip()
    n = (row.get("statCdCntnKor1") or "").strip()
    return c in ("", "-") or n in ("-", "총계", "전체", "합계")


def _monthly(hs: str, months: list[tuple[str, str]]) -> dict[str, tuple[float, float]]:
    """{date: (수출$, 중량kg)}. 국가별로 나뉘어 오면 더하고, 전체 합계 행이 있으면 그것만 씀."""
    out: dict[str, tuple[float, float]] = {}
    for y0, y1 in months:
        by_month: dict[str, list[dict]] = defaultdict(list)
        rows_all = _call(hs, y0, y1)
        for row in rows_all:
            d = _ym(row)
            if d:
                by_month[d].append(row)
        # 기간 '총계' 행과 월별 행 합이 다르면 행이 덜 온 것
        grand = sum(_num(r.get("expDlr", "0")) for r in rows_all if not _ym(r))
        part = sum(_num(r.get("expDlr", "0")) for rs in by_month.values() for r in rs)
        if grand and abs(part - grand) > grand * 0.001:
            print(f"[수출] 경고 {hs} {y0}~{y1}: 월별 합 {part / 1e6:,.0f} ≠ 총계 {grand / 1e6:,.0f}백만$")
        for d, rows in by_month.items():
            totals = [r for r in rows if _is_total_country(r)]
            rows = totals or rows
            exact = [r for r in rows if r.get("hsCd") == hs]
            rows = exact or rows  # 상위 코드 합계 행이 있으면 그것만 (하위 코드와 중복 방지)
            out[d] = (sum(_num(r.get("expDlr", "0")) for r in rows), sum(_num(r.get("expWgt", "0")) for r in rows))
        time.sleep(0.3)
    return out


def _ranges(start: dt.date) -> list[tuple[str, str]]:
    """start~이번 달을 1년 이하 구간으로."""
    today = dt.date.today()
    out, y, m = [], start.year, start.month
    while (y, m) <= (today.year, today.month):
        ey, em = y, m + 11
        if em > 12:
            ey, em = y + 1, em - 12
        if (ey, em) > (today.year, today.month):
            ey, em = today.year, today.month
        out.append((f"{y}{m:02d}", f"{ey}{em:02d}"))
        y, m = (ey + 1, 1) if em == 12 else (ey, em + 1)
    return out


def _has_history(key: str) -> bool:
    rows = db.select("macro_observations", f"select=date&series_id=eq.EXP:{key}:USD&order=date.asc&limit=1")
    return bool(rows) and rows[0]["date"] <= f"{FROM.year}-{FROM.month + 1:02d}-01"


def _save(key: str, group: str, name: str, data: dict[str, tuple[float, float]]) -> None:
    for kind, unit, idx, scale in (("USD", "백만달러", 0, 1e6), ("KG", "톤", 1, 1e3)):
        sid = f"EXP:{key}:{kind}"
        db.upsert("macro_series", [{"series_id": sid, "source": "관세청", "name": f"{group}|{name}", "unit": unit, "country": "KR"}])
        db.upsert("macro_observations", [{"series_id": sid, "date": d, "value": round(v[idx] / scale, 4)} for d, v in sorted(data.items())])


def collect() -> None:
    if not KEY:
        print("DATA_GO_KR_KEY 없음 → 수출 데이터 건너뜀")
        return
    recent = dt.date.today().replace(day=1)
    for _ in range(RECENT_MONTHS - 1):
        recent = (recent - dt.timedelta(days=1)).replace(day=1)
    got: dict[str, dict[str, tuple[float, float]]] = {}
    failed = []
    for key, group, name, codes in ITEMS:
        start = recent if db.URL and _has_history(key) else FROM
        try:
            total: dict[str, list[float]] = defaultdict(lambda: [0.0, 0.0])
            for hs in codes:
                for d, (usd, kg) in _monthly(hs, _ranges(start)).items():
                    total[d][0] += usd
                    total[d][1] += kg
            data = {d: (v[0], v[1]) for d, v in total.items() if v[0] > 0}
            print(f"[수출] {name}: {start}부터 {len(data)}개월, 최근 {max(data) if data else '-'}", flush=True)
            _save(key, group, name, data)
            got[key] = data
        except Exception as e:
            print(f"[수출] {name} 실패: {e}")
            failed.append(name)
    for key, group, name, parts in COMBOS:
        # 합성 품목은 부분 품목의 DB 전체 이력으로 다시 계산
        hist = []
        for p in parts:
            usd = {r["date"]: r["value"] for r in db.select("macro_observations", f"select=date,value&series_id=eq.EXP:{p}:USD")} if db.URL else {d: v[0] / 1e6 for d, v in got.get(p, {}).items()}
            kg = {r["date"]: r["value"] for r in db.select("macro_observations", f"select=date,value&series_id=eq.EXP:{p}:KG")} if db.URL else {d: v[1] / 1e3 for d, v in got.get(p, {}).items()}
            hist.append((usd, kg))
        dates = set.intersection(*(set(u) for u, _ in hist)) if hist else set()
        data = {d: (sum(u[d] for u, _ in hist) * 1e6, sum(k.get(d, 0) for _, k in hist) * 1e3) for d in dates}
        _save(key, group, name, data)
    if failed:
        raise RuntimeError(f"수출 데이터 실패: {', '.join(failed)}")


def check() -> None:
    """상위 코드 아래 10단위 품목명과 최근 달 수출액 출력 (코드 확인용)."""
    if not KEY:
        print("DATA_GO_KR_KEY 없음")
        return
    today = dt.date.today()
    m = (today.replace(day=1) - dt.timedelta(days=45)).strftime("%Y%m")
    for prefix in CHECK_PREFIXES:
        try:
            rows = _call(prefix, m, m)
        except Exception as e:
            print(f"[수출 점검] {prefix}: {e}")
            continue
        print(f"[수출 점검] {prefix} {m}: {len(rows)}행, 첫 행 {rows[:1]}")
        agg: dict[tuple[str, str], float] = defaultdict(float)
        for r in rows:
            if _ym(r):
                agg[(r.get("hsCd", ""), r.get("statKor", ""))] += _num(r.get("expDlr", "0"))
        for (hs, nm), usd in sorted(agg.items()):
            print(f"  {hs:<12} {usd / 1e6:>10,.1f}백만$  {nm}")
    for key, _, name, codes in ITEMS:
        for hs in codes:
            try:
                rows = _call(hs, m, m)
                print(f"[수출 점검] {name} {hs}: {len(rows)}행, 품목명 {sorted({r.get('statKor', '') for r in rows})[:3]}")
            except Exception as e:
                print(f"[수출 점검] {name} {hs}: {e}")
