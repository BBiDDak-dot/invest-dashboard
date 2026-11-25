"""수집 진입점. 사용법: python main.py [--days N]"""

import argparse
import datetime as dt
import os
import sys

import calendar_events
import cleanup
import db
import disclosures
import earnings
import financials
import flows
import stock_flows
import us_earnings
import macro
import macro_check
import news_clips
import oil_curve
import pbr_band
import prices
import valuation
import sentiment
import snapshot

# DB 미연결(dry run) 시 사용할 예시 종목
SAMPLE_WATCHLIST = [
    {"ticker": "005930", "market": "KR", "corp_code": "00126380"},
    {"ticker": "AAPL", "market": "US", "corp_code": None},
]


ON_DEMAND = {"지표 점검", "공포탐욕 비교"}  # 정기 수집에선 빼고 only로 부를 때만 실행


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=10, help="며칠 전부터 수집할지 (처음엔 크게, 예: 1000)")
    parser.add_argument("--only", default="", help="이 이름의 수집기만 실행 (쉼표로 여러 개, 시험용)")
    args = parser.parse_args()
    only = {s.strip() for s in args.only.split(",") if s.strip()}
    start = dt.date.today() - dt.timedelta(days=args.days)

    if os.environ.get("GITHUB_ACTIONS") and not db.URL:
        sys.exit("SUPABASE_URL이 비어 있음. GitHub Secrets 이름을 확인할 것.")

    watchlist = db.select("watchlist", "select=ticker,market,corp_code") if db.URL else SAMPLE_WATCHLIST

    failed = []
    for name, job in [
        ("시세", lambda: prices.collect(start, watchlist)),
        ("공시", lambda: disclosures.collect(start, watchlist)),
        ("실적 스크리닝", lambda: earnings.collect(start)),
        ("미국 실적", us_earnings.collect),
        ("투자지표", lambda: macro.collect(start)),
        ("유가 곡선", lambda: oil_curve.collect(start)),
        ("순자산 기록", snapshot.collect),  # 시세·환율 다음에
        ("재무", lambda: financials.collect(watchlist)),
        ("수급", lambda: flows.collect(start)),
        ("종목 수급", stock_flows.collect),
        ("지수 밸류에이션", valuation.collect),
        ("PBR 밴드", pbr_band.collect),  # 시세 다음에(주가 보충)
        ("산업 클리핑", news_clips.collect),
        ("일정", calendar_events.collect),
        ("PDF 정리", cleanup.collect),
        ("지표 점검", macro_check.collect),  # 시험용: only="지표 점검"으로 실행
        ("공포탐욕 비교", sentiment.compare),  # 시험용: 예전·새 공포탐욕 계산을 출력만 함
    ]:
        if (only and name not in only) or (not only and name in ON_DEMAND):
            continue
        try:
            job()
        except Exception as e:  # 한 수집기가 실패해도 나머지는 진행
            print(f"[{name}] 실패: {e}")
            failed.append(name)
    if failed:
        sys.exit(f"실패한 수집기: {', '.join(failed)}")


if __name__ == "__main__":
    main()
