"""ISM 제조업 PMI 수집. FRED에서 빠진 지표라 ISM의 PR Newswire 발표문 제목에서 값을 읽음."""

import datetime as dt
import html
import re

import requests

import db

SERIES_ID = "ISM:MANUFACTURING_PMI"
LIST_URL = "https://www.prnewswire.com/news/institute-for-supply-management/"
# 예: "Manufacturing PMI® at 52.7%; March 2026 ISM® Manufacturing PMI® Report"
HEADLINE = re.compile(r"Manufacturing PMI\W*\s+at\s+([\d.]+)%;\s*([A-Z][a-z]+)\s+(\d{4})")
MONTHS = {m: i for i, m in enumerate(
    ["January", "February", "March", "April", "May", "June", "July", "August",
     "September", "October", "November", "December"], start=1)}


def parse(page_html: str) -> list[dict]:
    # 제목이 <h3>에서 <a> 안으로 옮겨지는 등 태그가 자주 바뀌어서, 태그를 다 지운 본문 전체에서 찾음
    # 목록이 스크립트 안 JSON으로만 올 때를 대비해 \u00ae 같은 이스케이프도 풀어 둠
    page_html = re.sub(r"\\u([0-9a-fA-F]{4})", lambda m: chr(int(m.group(1), 16)), page_html).replace("\\/", "/")
    text = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", page_html)))
    rows = {}
    for m in HEADLINE.finditer(text):
        if m.group(2) in MONTHS:
            date = dt.date(int(m.group(3)), MONTHS[m.group(2)], 1).isoformat()
            rows[date] = {"series_id": SERIES_ID, "date": date, "value": float(m.group(1))}
    return list(rows.values())


def collect(start: dt.date) -> None:
    rows: dict[str, dict] = {}
    for page in range(1, 11):
        # 첫 쪽은 파라미터 없이: page·pagesize를 붙인 주소는 캐시가 늦어 최신 발표가 빠져 있었음
        params = {"page": page, "pagesize": 100} if page > 1 else None
        r = requests.get(LIST_URL, params=params, headers={"User-Agent": "Mozilla/5.0"}, timeout=30)
        r.raise_for_status()
        found = parse(r.text)
        if not found:
            if not rows:  # 원인 확인용: 받은 페이지가 어떤 모양인지 남김
                title = re.search(r"<title[^>]*>(.*?)</title>", r.text, re.S)
                hits = [r.text[max(0, i.start() - 80):i.start() + 120] for i in re.finditer("PMI", r.text)][:3]
                print(f"[ISM] {page}쪽 {r.status_code}, {len(r.text)}자, 제목={title.group(1).strip()[:80] if title else None}, PMI 주변={hits!r}")
            break
        for row in found:
            rows[row["date"]] = row
        if min(row["date"] for row in found) < start.isoformat():
            break
    if not rows:
        raise RuntimeError("ISM 발표문을 찾지 못함 (페이지 구조 변경 가능성)")
    db.upsert("macro_series", [{"series_id": SERIES_ID, "source": "ISM", "name": "ISM 제조업 PMI", "unit": "pt", "country": "US"}])
    db.upsert("macro_observations", [r for r in rows.values() if r["date"] >= start.replace(day=1).isoformat()])
