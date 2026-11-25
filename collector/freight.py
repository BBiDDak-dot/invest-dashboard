"""해운 운임 지수 수집 → macro 테이블(series_id 접두어 SHIP:, 수집기 이름 "해운 운임").

- 벌크·유조선(BDI·BCI·BDTI·BCTI): 东方财富(Eastmoney) 데이터센터 RPT_INDUSTRY_INDEX, 일별. 발틱거래소 공표값.
- 컨테이너(SCFI·CCFI): 상하이해운거래소(SSE)는 이번 주·지난주 값만 줘서, 이력은 stock-marketdata.com 차트 페이지
  (Plotly 데이터가 HTML에 들어 있음)에서 받고 최신 주는 SSE 공식값으로 덮어씀. 주간(금요일).
신조선가 지수(Clarksons)는 유료라 없음. Eastmoney의 중국 신조선가(CNTPI)는 2017년에 끊김.
"""

import base64
import datetime as dt
import json
import re
import struct

import requests

import db

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"}
EM = "https://datacenter-web.eastmoney.com/api/data/v1/get"
SINCE = dt.date(2019, 1, 1)  # 화면은 3년이지만 2021년 운임 급등기까지 남겨 둠

# (series_id, Eastmoney 지표 ID, 이름)
BALTIC = [
    ("SHIP:BDI", "EMI00107664", "BDI (발틱 건화물선 운임지수)"),
    ("SHIP:BCI", "EMI00107666", "BCI (케이프사이즈 운임지수)"),
    ("SHIP:BDTI", "EMI00107668", "BDTI (원유 유조선 운임지수)"),
    ("SHIP:BCTI", "EMI00107669", "BCTI (석유제품선 운임지수)"),
]
# (series_id, stock-marketdata 페이지, SSE 지수 이름, 이름)
CONTAINER = [
    ("SHIP:SCFI", "commodity-container-scfi-index", "scfi", "SCFI (상하이 컨테이너 운임지수)"),
    ("SHIP:CCFI", "commodity-container-ccfi-index", "ccfi", "CCFI (중국 컨테이너 운임지수)"),
]
SERIES_IDS = [s for s, *_ in BALTIC] + [s for s, *_ in CONTAINER]


def _save(series_id: str, name: str, source: str, points: dict[str, float]) -> None:
    db.upsert("macro_series", [{"series_id": series_id, "source": source, "name": name, "unit": "pt", "country": "GLOBAL"}])
    db.upsert("macro_observations", [{"series_id": series_id, "date": d, "value": round(v, 2)} for d, v in sorted(points.items())])


def _baltic(iid: str) -> dict[str, float]:
    out, page = {}, 1
    while True:
        r = requests.get(EM, headers=UA, timeout=30, params={
            "reportName": "RPT_INDUSTRY_INDEX", "columns": "REPORT_DATE,INDICATOR_VALUE", "pageSize": "500", "pageNumber": str(page),
            "sortColumns": "REPORT_DATE", "sortTypes": "-1", "filter": f'(INDICATOR_ID="{iid}")', "source": "WEB", "client": "WEB"})
        r.raise_for_status()
        res = r.json().get("result") or {}
        rows = res.get("data") or []
        for x in rows:
            d = x["REPORT_DATE"][:10]
            if d >= SINCE.isoformat() and x.get("INDICATOR_VALUE") is not None:
                out[d] = float(x["INDICATOR_VALUE"])  # 같은 날짜가 두 번 오는 경우가 있어 dict로 중복 제거
        if not rows or rows[-1]["REPORT_DATE"][:10] < SINCE.isoformat() or page >= (res.get("pages") or 1):
            return out
        page += 1


def _plotly_first_trace(html: str) -> dict[str, float]:
    """페이지 첫 Plotly 차트의 첫 선(지수 자체)을 읽음. y는 base64 float64 배열이거나 숫자 목록."""
    i = html.index("Plotly.newPlot(")
    mx = re.compile(r'"x"\s*:\s*\[').search(html, i)
    xs = json.loads(html[mx.end() - 1: html.index("]", mx.end()) + 1])
    my = re.compile(r'"y"\s*:\s*').search(html, mx.end())
    rest = html[my.end():]
    if rest.startswith("{"):
        obj = json.loads(rest[: rest.index("}") + 1])
        raw = base64.b64decode(obj["bdata"])
        ys = list(struct.unpack(f"<{len(raw) // 8}d", raw))
    else:
        ys = json.loads(rest[: rest.index("]") + 1])
    if len(xs) != len(ys):
        raise RuntimeError(f"x {len(xs)}개, y {len(ys)}개로 안 맞음")
    return {x[:10]: float(y) for x, y in zip(xs, ys) if y is not None and y == y and x[:10] >= SINCE.isoformat()}


def _sse_latest(name: str) -> tuple[str, float]:
    r = requests.get(f"https://en.sse.net.cn/currentIndex?indexName={name}", headers=UA, timeout=30)
    r.raise_for_status()
    data = r.json()["data"]
    return data["currentDate"], float(data["lineDataList"][0]["currentContent"])  # 첫 줄이 종합지수


def collect() -> None:
    failed = []
    for sid, iid, name in BALTIC:
        try:
            pts = _baltic(iid)
            if not pts:
                raise RuntimeError("데이터 없음")
            _save(sid, name, "Baltic Exchange (Eastmoney)", pts)
            print(f"[해운 운임] {sid}: {len(pts)}개 {min(pts)} ~ {max(pts)} (최근 {pts[max(pts)]})")
        except Exception as e:
            print(f"[해운 운임] {sid} 실패: {e}")
            failed.append(sid)
    for sid, slug, sse, name in CONTAINER:
        pts = {}
        try:
            r = requests.get(f"https://stock-marketdata.com/time-series/charts/{slug}.html", headers=UA, timeout=60)
            r.raise_for_status()
            pts = _plotly_first_trace(r.text)
        except Exception as e:
            print(f"[해운 운임] {sid} 이력 실패: {e}")
        try:
            d, v = _sse_latest(sse)
            pts[d] = v
        except Exception as e:
            print(f"[해운 운임] {sid} SSE 최신값 실패: {e}")
        if not pts:
            failed.append(sid)
            continue
        _save(sid, name, "Shanghai Shipping Exchange", pts)
        print(f"[해운 운임] {sid}: {len(pts)}개 {min(pts)} ~ {max(pts)} (최근 {pts[max(pts)]})")
    if failed:
        raise RuntimeError(f"해운 운임 실패: {', '.join(failed)}")
