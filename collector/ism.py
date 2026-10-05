"""ISM 제조업 PMI 수집. FRED에서 빠진 지표라 ISM의 PR Newswire 발표문 제목에서 값을 읽음."""

import datetime as dt
import html
import re

import requests

import db

SERIES_ID = "ISM:MANUFACTURING_PMI"
LIST_URL = "https://www.prnewswire.com/news/institute-for-supply-management/"
# 예: "Manufacturing PMI® at 52.7%; March 2026 ISM® Manufacturing PMI® Report"
HEADLINE = re.compile(r"^Manufacturing PMI\W*\s+at\s+([\d.]+)%;\s*([A-Z][a-z]+)\s+(\d{4})")
MONTHS = {m: i for i, m in enumerate(
    ["January", "February", "March", "April", "May", "June", "July", "August",
     "September", "October", "November", "December"], start=1)}


def parse(page_html: str) -> list[dict]:
    rows = []
    for h3 in re.findall(r"<h3[^>]*>(.*?)</h3>", page_html, re.S):
        text = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", h3))).strip()
        # 제목 앞에 붙은 "Apr 01, 2026, 10:00 ET" 제거
        text = re.sub(r"^\w{3} \d{2}, \d{4}, \d{2}:\d{2} ET\s*", "", text)
        m = HEADLINE.match(text)
        if m and m.group(2) in MONTHS:
            rows.append({
                "series_id": SERIES_ID,
                "date": dt.date(int(m.group(3)), MONTHS[m.group(2)], 1).isoformat(),
                "value": float(m.group(1)),
            })
    return rows


def collect(start: dt.date) -> None:
    rows: dict[str, dict] = {}
    for page in range(1, 11):
        r = requests.get(LIST_URL, params={"page": page, "pagesize": 100},
                         headers={"User-Agent": "Mozilla/5.0"}, timeout=30)
        r.raise_for_status()
        found = parse(r.text)
        if not found:
            break
        for row in found:
            rows[row["date"]] = row
        if min(row["date"] for row in found) < start.isoformat():
            break
    if not rows:
        raise RuntimeError("ISM 발표문을 찾지 못함 (페이지 구조 변경 가능성)")
    db.upsert("macro_series", [{"series_id": SERIES_ID, "source": "ISM", "name": "ISM 제조업 PMI", "unit": "pt", "country": "US"}])
    db.upsert("macro_observations", [r for r in rows.values() if r["date"] >= start.replace(day=1).isoformat()])
