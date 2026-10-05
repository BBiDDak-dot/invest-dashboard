"""국내 공시 수집 (DART OpenAPI). watchlist의 corp_code가 있는 종목만 대상."""

import datetime as dt
import os

import requests

import db


def collect(start: dt.date, watchlist: list[dict]) -> None:
    key = os.environ.get("DART_API_KEY")
    if not key:
        print("DART_API_KEY 없음, 공시 건너뜀")
        return
    for w in watchlist:
        if w["market"] != "KR" or not w.get("corp_code"):
            continue
        r = requests.get(
            "https://opendart.fss.or.kr/api/list.json",
            params={
                "crtfc_key": key,
                "corp_code": w["corp_code"],
                "bgn_de": start.strftime("%Y%m%d"),
                "page_count": 100,
            },
            timeout=30,
        )
        data = r.json()
        if data.get("status") not in ("000", "013"):  # 013 = 조회된 데이터 없음
            print(f"DART {w['ticker']} 오류: {data.get('message')}")
            continue
        db.upsert(
            "disclosures",
            [
                {
                    "id": d["rcept_no"],
                    "ticker": w["ticker"],
                    "date": f"{d['rcept_dt'][:4]}-{d['rcept_dt'][4:6]}-{d['rcept_dt'][6:]}",
                    "title": d["report_nm"].strip(),
                    "url": f"https://dart.fss.or.kr/dsaf001/main.do?rcpNo={d['rcept_no']}",
                }
                for d in data.get("list", [])
            ],
        )
