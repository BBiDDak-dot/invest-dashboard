"""Supabase REST 업서트. SUPABASE_URL/SUPABASE_KEY가 없으면 결과만 출력함(dry run)."""

import json
import os

import requests

URL = os.environ.get("SUPABASE_URL")
KEY = os.environ.get("SUPABASE_KEY")


def _headers(extra=None):
    h = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}
    h.update(extra or {})
    return h


def select(table: str, query: str = "select=*") -> list[dict]:
    if not URL:
        return []
    r = requests.get(f"{URL}/rest/v1/{table}?{query}", headers=_headers(), timeout=30)
    r.raise_for_status()
    return r.json()


def upsert(table: str, rows: list[dict]) -> None:
    if not rows:
        return
    if not URL:
        print(f"[dry-run] {table}: {len(rows)}건, 예시 {json.dumps(rows[-1], ensure_ascii=False)}")
        return
    for i in range(0, len(rows), 500):
        r = requests.post(
            f"{URL}/rest/v1/{table}",
            headers=_headers({"Prefer": "resolution=merge-duplicates"}),
            data=json.dumps(rows[i : i + 500], ensure_ascii=False).encode(),
            timeout=60,
        )
        r.raise_for_status()
    print(f"{table}: {len(rows)}건 저장")
