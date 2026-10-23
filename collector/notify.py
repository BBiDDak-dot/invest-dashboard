"""수집 후 텔레그램 알림: 내 종목 공시, 실적 스크리닝(국내·미국)에 새로 잡힌 종목.

사용법: python notify.py [--days N]  (collect 워크플로가 수집 직후 실행)
최근 N일(기본 3일) 안의 것 중 아직 안 보낸 것만 보내고 sent_alerts에 남김.
필요한 값: SUPABASE_URL, SUPABASE_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
"""

import argparse
import datetime as dt
import html

import db
from alerts import SITE, send

US_MIN_REVENUE = 100  # 백만$ (화면 기본 필터 1억$↑와 같음)
MAX_LEN = 3800  # 텔레그램 한 메시지 4096자 제한 안쪽


def _since(days: int) -> str:
    return (dt.date.today() - dt.timedelta(days=days)).isoformat()


def _sent(ids: list[str]) -> set[str]:
    out: set[str] = set()
    for i in range(0, len(ids), 100):
        chunk = ",".join(f'"{x}"' for x in ids[i : i + 100])
        out |= {r["id"] for r in db.select("sent_alerts", f"select=id&id=in.({chunk})")}
    return out


def _send_lines(title: str, lines: list[str]) -> bool:
    """줄이 많으면 여러 메시지로 나눠 보냄"""
    ok, buf = True, title
    for line in lines:
        if len(buf) + len(line) + 1 > MAX_LEN:
            ok &= send(buf)
            buf = title + " (계속)"
        buf += "\n" + line
    return send(buf) and ok


def _grow(now, prev, yoy, turn) -> bool:
    if now is None or prev is None:
        return False
    return (yoy is not None and yoy > 0) or "흑자" in (turn or "")


def all_grow(r: dict) -> bool:
    """화면(earnings/shared.tsx allGrow)과 같은 기준: 매출·영업이익·순이익 모두 YoY 증가(흑자전환 포함)"""
    return (
        _grow(r.get("revenue"), r.get("revenue_prev_y"), r.get("revenue_yoy"), None)
        and _grow(r.get("op"), r.get("op_prev_y"), r.get("op_yoy"), r.get("op_turn"))
        and _grow(r.get("ni"), r.get("ni_prev_y"), r.get("ni_yoy"), r.get("ni_turn"))
    )


def _pct(yoy, turn) -> str:
    return turn if turn and "흑자" in turn else (f"+{yoy:.0f}%" if yoy is not None else "-")


def disclosures(days: int) -> list[tuple[str, str]]:
    rows = db.select("disclosures", f"select=id,ticker,date,title,url&date=gte.{_since(days)}&order=date,id")
    if not rows:
        return []
    names = {w["ticker"]: w["name"] for w in db.select("watchlist", "select=ticker,name")}
    done = _sent([f"disc:{r['id']}" for r in rows])
    new = [r for r in rows if f"disc:{r['id']}" not in done]
    if not new:
        return []
    lines = [f"• <b>{html.escape(names.get(r['ticker'], r['ticker']))}</b> {html.escape(r['title'])} <a href=\"{r['url']}\">원문</a>" for r in new]
    if _send_lines(f"📢 <b>내 종목 공시 {len(new)}건</b>", lines):
        return [(f"disc:{r['id']}", "disc") for r in new]
    return []


def kr_earnings(days: int) -> list[tuple[str, str]]:
    recent = db.select("earnings_screen", f"select=*&date=gte.{_since(days)}&stock_code=not.is.null")
    if not recent:
        return []
    # 같은 회사·분기의 최초 공시만 (화면과 같음): 이전 공시가 있으면 이미 보였던 실적
    codes = ",".join(f'"{c}"' for c in {r["stock_code"] for r in recent})
    history = db.select("earnings_screen", f"select=id,stock_code,period,date,consolidated&stock_code=in.({codes})")
    first: dict[str, dict] = {}
    for r in history:
        k = f"{r['stock_code']}|{r['period'] or r['date']}"
        cur = first.get(k)
        if not cur or (r["date"], not r["consolidated"], r["id"]) < (cur["date"], not cur["consolidated"], cur["id"]):
            first[k] = r
    firsts = {r["id"] for r in first.values()}
    hits = [r for r in recent if r["id"] in firsts and all_grow(r)]
    done = _sent([f"kr:{r['id']}" for r in hits])
    new = sorted((r for r in hits if f"kr:{r['id']}" not in done), key=lambda r: r["date"])
    if not new:
        return []
    lines = [
        f"• <b>{html.escape(r['corp_name'])}</b> {r['period'] or ''} 매출 {_pct(r['revenue_yoy'], None)} · 영업익 {_pct(r['op_yoy'], r['op_turn'])} · 순익 {_pct(r['ni_yoy'], r['ni_turn'])} "
        f"<a href=\"{SITE}/earnings/r/kr-{r['id']}\">리포트</a>"
        for r in new
    ]
    if _send_lines(f"📈 <b>실적 스크리닝(국내) 새 종목 {len(new)}곳</b>", lines):
        return [(f"kr:{r['id']}", "kr") for r in new]
    return []


def us_earnings(days: int) -> list[tuple[str, str]]:
    rows = db.select("us_earnings", f"select=*&filed=gte.{_since(days)}&revenue=gte.{US_MIN_REVENUE}")
    hits = [r for r in rows if all_grow(r)]
    if not hits:
        return []
    done = _sent([f"us:{r['id']}" for r in hits])
    new = sorted((r for r in hits if f"us:{r['id']}" not in done), key=lambda r: -(r["revenue"] or 0))
    if not new:
        return []
    lines = [
        f"• <b>{html.escape(r['name'])}</b> ({r['ticker']}) {r['period']} 매출 {_pct(r['revenue_yoy'], None)} · 영업익 {_pct(r['op_yoy'], r['op_turn'])} · 순익 {_pct(r['ni_yoy'], r['ni_turn'])} "
        f"<a href=\"{SITE}/earnings/r/us-{r['id']}\">리포트</a>"
        for r in new
    ]
    if _send_lines(f"📈 <b>실적 스크리닝(미국) 새 종목 {len(new)}곳</b>", lines):
        return [(f"us:{r['id']}", "us") for r in new]
    return []


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=3)
    args = parser.parse_args()
    done: list[tuple[str, str]] = []
    for name, job in [("공시", disclosures), ("국내 실적", kr_earnings), ("미국 실적", us_earnings)]:
        try:
            sent = job(args.days)
            done += sent
            print(f"[알림] {name}: {len(sent)}건 발송")
        except Exception as e:  # 하나가 실패해도 나머지는 보냄
            print(f"[알림] {name} 실패: {e}")
    db.upsert("sent_alerts", [{"id": i, "kind": k} for i, k in done])


if __name__ == "__main__":
    main()
