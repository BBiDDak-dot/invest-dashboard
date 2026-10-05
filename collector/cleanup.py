"""저장 공간 정리. Supabase 무료 한도(파일 1GB) 안에서 계속 쓰도록, 요약이 끝난 리포트 PDF는 60일 뒤 지움.
요약문·차트는 reports 테이블에 남고, 원본 쪽 링크(file_paths)만 비움."""

import datetime as dt

import requests

import db

KEEP_DAYS = 60
BUCKET = "reports"


def collect() -> None:
    if not db.URL:
        print("[dry-run] PDF 정리 건너뜀")
        return
    cutoff = dt.date.today() - dt.timedelta(days=KEEP_DAYS)
    base = f"{db.URL}/storage/v1/object"
    # PDF는 "YYYY-MM-DD/파일" 경로로 저장됨 → 날짜 폴더 단위로 오래된 것을 찾음
    r = requests.post(f"{base}/list/{BUCKET}", headers=db._headers(), json={"prefix": "", "limit": 1000}, timeout=30)
    r.raise_for_status()
    old = [f["name"] for f in r.json() if len(f["name"]) == 10 and f["name"] < cutoff.isoformat()]
    paths = []
    for folder in old:
        r = requests.post(f"{base}/list/{BUCKET}", headers=db._headers(), json={"prefix": folder, "limit": 1000}, timeout=30)
        r.raise_for_status()
        paths += [f"{folder}/{f['name']}" for f in r.json()]
    for i in range(0, len(paths), 100):
        r = requests.delete(f"{base}/{BUCKET}", headers=db._headers(), json={"prefixes": paths[i : i + 100]}, timeout=60)
        r.raise_for_status()
    # 지운 PDF를 가리키던 원본 쪽 링크 정리
    r = requests.patch(
        f"{db.URL}/rest/v1/reports?created_at=lt.{cutoff.isoformat()}&file_paths=not.is.null",
        headers=db._headers(),
        json={"file_paths": None},
        timeout=30,
    )
    r.raise_for_status()
    print(f"PDF 정리: {len(paths)}개 삭제 ({cutoff} 이전)")
