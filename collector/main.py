"""수집 진입점. 사용법: python main.py [--days N]"""

import argparse
import datetime as dt
import os
import sys

import db
import disclosures
import macro
import prices

# DB 미연결(dry run) 시 사용할 예시 종목
SAMPLE_WATCHLIST = [
    {"ticker": "005930", "market": "KR", "corp_code": "00126380"},
    {"ticker": "AAPL", "market": "US", "corp_code": None},
]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=10, help="며칠 전부터 수집할지 (처음엔 크게, 예: 1000)")
    args = parser.parse_args()
    start = dt.date.today() - dt.timedelta(days=args.days)

    if os.environ.get("GITHUB_ACTIONS") and not db.URL:
        sys.exit("SUPABASE_URL이 비어 있음. GitHub Secrets 이름을 확인할 것.")

    watchlist = db.select("watchlist", "select=ticker,market,corp_code") if db.URL else SAMPLE_WATCHLIST

    failed = []
    for name, job in [
        ("시세", lambda: prices.collect(start, watchlist)),
        ("공시", lambda: disclosures.collect(start, watchlist)),
        ("경제지표", lambda: macro.collect(start)),
    ]:
        try:
            job()
        except Exception as e:  # 한 수집기가 실패해도 나머지는 진행
            print(f"[{name}] 실패: {e}")
            failed.append(name)
    if failed:
        sys.exit(f"실패한 수집기: {', '.join(failed)}")


if __name__ == "__main__":
    main()
