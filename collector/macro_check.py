"""지표 이력 점검: macro 테이블 지표마다 첫 날짜·마지막 날짜·관측치 수를 출력함 (수집기 이름 "지표 점검")."""

import requests

import db


def collect() -> None:
    if not db.URL:
        print("[지표 점검] DB 없음")
        return
    for s in sorted(db.select("macro_series", "select=series_id,name"), key=lambda s: s["series_id"]):
        sid = requests.utils.quote(s["series_id"], safe="")
        first = db.select("macro_observations", f"select=date&series_id=eq.{sid}&order=date.asc&limit=1")
        last = db.select("macro_observations", f"select=date&series_id=eq.{sid}&order=date.desc&limit=1")
        r = requests.head(
            f"{db.URL}/rest/v1/macro_observations?series_id=eq.{sid}",
            headers={**db._headers(), "Prefer": "count=exact"},
            timeout=30,
        )
        n = r.headers.get("content-range", "*/?").split("/")[-1]
        print(f"[지표 점검] {s['series_id']:<24} {first[0]['date'] if first else '-'} ~ {last[0]['date'] if last else '-'}  {n}개  {s['name']}")
