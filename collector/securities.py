"""종목 검색용 전체 상장종목 목록 갱신. 국내: DART 고유번호 파일, 미국: SEC 티커 목록.

사용법: python securities.py (주 1회 워크플로에서 실행)
"""

import io
import os
import sys
import zipfile
import xml.etree.ElementTree as ET

import requests

import db

SEC_HEADERS = {"User-Agent": "invest-dashboard personal research (github.com/BBiDDak-dot)"}


def korea() -> list[dict]:
    key = os.environ.get("DART_API_KEY")
    if not key:
        print("DART_API_KEY 없음, 국내 종목 건너뜀")
        return []
    r = requests.get("https://opendart.fss.or.kr/api/corpCode.xml", params={"crtfc_key": key}, timeout=600)
    r.raise_for_status()
    with zipfile.ZipFile(io.BytesIO(r.content)) as z:
        root = ET.fromstring(z.read(z.namelist()[0]))
    rows = []
    for item in root.iter("list"):
        code = (item.findtext("stock_code") or "").strip()
        if code:  # 상장사만
            rows.append({
                "ticker": code,
                "market": "KR",
                "name": item.findtext("corp_name").strip(),
                "corp_code": item.findtext("corp_code").strip(),
            })
    return rows


def us() -> list[dict]:
    r = requests.get("https://www.sec.gov/files/company_tickers.json", headers=SEC_HEADERS, timeout=60)
    r.raise_for_status()
    rows = {}
    for c in r.json().values():
        ticker = c["ticker"].upper()
        rows.setdefault(ticker, {"ticker": ticker, "market": "US", "name": c["title"], "corp_code": str(c["cik_str"])})
    return list(rows.values())


def main() -> None:
    failed = False
    for name, fn in [("국내", korea), ("미국", us)]:
        try:
            rows = fn()
            print(f"{name} 종목 {len(rows)}개")
            db.upsert("securities", rows)
        except Exception as e:
            print(f"[{name}] 실패: {e}")
            failed = True
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
