"""미국 상장사 실적 스크리닝: SEC XBRL frames API로 분기 매출·영업이익(백만 달러)과 전년 동기 대비 증감률을 저장함.

frames API는 한 개념·한 기간에 대해 모든 제출 회사의 값을 한 번에 돌려줌(달력 분기에 가장 가까운 회계 분기로 맞춰 줌).
4분기는 10-K에 연간만 나오는 경우가 많아 연간 - 나머지 세 분기로 계산함.
"""

import datetime as dt
import re
import time

import requests

import db

UA = {"User-Agent": "invest-dashboard admin@example.com"}  # SEC는 연락처가 담긴 UA를 요구함
FRAMES = "https://data.sec.gov/api/xbrl/frames/us-gaap/{}/USD/{}.json"
# 매출 개념은 회사마다 다르게 씀. 앞에 있는 것을 우선하고, 전년 동기도 같은 개념으로 비교함
REVENUE = [
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "Revenues",
    "SalesRevenueNet",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
]
OP = "OperatingIncomeLoss"
SHOWN = 5  # 화면에 보이는 분기 수 (웹 실적 스크리닝과 같음)
MIN_REVENUE = 10  # 분기 매출 1천만 달러 미만 초소형사는 저장하지 않음


def _get(url: str):
    for i in range(3):
        r = requests.get(url, headers=UA, timeout=60)
        if r.status_code == 404:
            return None
        if r.ok:
            return r
        time.sleep(2 * (i + 1))
    r.raise_for_status()


def _date(s: str) -> dt.date:
    return dt.date.fromisoformat(s)


def _label(start: dt.date, end: dt.date) -> str:
    """기간 가운데 날짜가 속한 달력 분기 (52/53주 회계연도도 맞게 잡힘)"""
    mid = start + (end - start) / 2
    return f"{mid.year}.{(mid.month - 1) // 3 + 1}Q"


def shown_quarters(today: dt.date, n: int = SHOWN) -> list[str]:
    """오늘 기준 발표가 시작된 가장 최근 분기부터 n개 (웹의 recentQuarters와 같음)"""
    y, m = today.year, today.month
    yy, qq = (y - 1, 4) if m <= 3 else (y, (m - 1) // 3)
    out = []
    for _ in range(n):
        out.append(f"{yy}.{qq}Q")
        yy, qq = (yy - 1, 4) if qq == 1 else (yy, qq - 1)
    return out


def _prev_year(q: str) -> str:
    return f"{int(q[:4]) - 1}{q[4:]}"


def _frames(concept: str, quarters: list[str], years: list[int]) -> dict[int, dict[str, dict]]:
    """{cik: {분기: {val, start, end, accn, form}}}. 명시된 분기 값 + 연간에서 계산한 4분기(또는 빠진 분기)"""
    out: dict[int, dict[str, dict]] = {}
    for q in quarters:
        r = _get(FRAMES.format(concept, f"CY{q[:4]}Q{q[5]}"))
        for d in (r.json()["data"] if r else []):
            out.setdefault(d["cik"], {})[q] = {"val": d["val"], "start": _date(d["start"]), "end": _date(d["end"]), "accn": d["accn"], "derived": False}
        time.sleep(0.12)
    for y in years:
        r = _get(FRAMES.format(concept, f"CY{y}"))
        for d in (r.json()["data"] if r else []):
            qs = out.get(d["cik"])
            if not qs:
                continue
            a0, a1 = _date(d["start"]), _date(d["end"])
            inside = sorted((v for v in qs.values() if not v["derived"] and v["start"] >= a0 - dt.timedelta(10) and v["end"] <= a1 + dt.timedelta(10)), key=lambda v: v["start"])
            if len(inside) != 3:
                continue
            # 세 분기가 덮지 않는 구간이 빠진 분기
            edges = [a0 - dt.timedelta(1)] + [x for v in inside for x in (v["start"] - dt.timedelta(1), v["end"])] + [a1]
            gaps = [(edges[i] + dt.timedelta(1), edges[i + 1]) for i in range(0, len(edges), 2) if (edges[i + 1] - edges[i]).days > 45]
            if len(gaps) != 1:
                continue
            s, e = gaps[0]
            q = _label(s, e)
            if q not in qs and q in quarters:
                qs[q] = {"val": d["val"] - sum(v["val"] for v in inside), "start": s, "end": e, "accn": d["accn"], "derived": True}
        time.sleep(0.12)
    return out


def _growth(now, prev):
    """전년 대비 증감률(%)과 흑자·적자 전환 (국내 실적 스크리닝과 같은 말)"""
    if now is None or prev is None:
        return None, None
    if prev > 0:
        return round((now - prev) / prev * 100, 1), ("적자전환" if now < 0 else None)
    if prev < 0:
        return None, ("흑자전환" if now > 0 else "적자지속")
    return None, None


def _filings(accns: set[str], since: dt.date) -> dict[str, tuple[str, str]]:
    """접수번호 → (제출일, 서식). EDGAR 분기별 xbrl.idx를 최근 분기부터 거슬러 읽음"""
    found: dict[str, tuple[str, str]] = {}
    today = dt.date.today()
    y, q = today.year, (today.month - 1) // 3 + 1
    while accns - found.keys() and (y, q) >= (since.year, (since.month - 1) // 3 + 1):
        r = _get(f"https://www.sec.gov/Archives/edgar/full-index/{y}/QTR{q}/xbrl.idx")
        for line in (r.text.splitlines() if r else []):
            parts = line.split("|")
            if len(parts) == 5 and (m := re.search(r"(\d{10}-\d{2}-\d{6})", parts[4])) and m.group(1) in accns:
                found[m.group(1)] = (parts[3], parts[2])
        y, q = (y - 1, 4) if q == 1 else (y, q - 1)
    return found


def collect() -> None:
    today = dt.date.today()
    shown = shown_quarters(today)
    oldest = shown[-1]
    # 화면 분기와 그 전년 동기, 그리고 4분기 계산에 필요한 같은 해 분기들
    first_year = int(oldest[:4]) - 1
    quarters = [f"{y}.{q}Q" for y in range(first_year, today.year + 1) for q in range(1, 5)]
    quarters = [q for q in quarters if q <= shown[0]]
    years = list(range(first_year, today.year + 1))

    tickers = {}
    for t in _get("https://www.sec.gov/files/company_tickers.json").json().values():
        tickers.setdefault(t["cik_str"], (t["ticker"], t["title"]))  # 여러 종류 주식이면 첫 번째(시총 큰 쪽)

    revenue = {c: _frames(c, quarters, years) for c in REVENUE}
    op = _frames(OP, quarters, years)
    print(f"[미국 실적] frames 읽음: 매출 {sum(len(v) for v in revenue.values())}개사(개념 합), 영업이익 {len(op)}개사")

    rows = []
    for cik, (ticker, name) in tickers.items():
        for q in shown:
            p = _prev_year(q)
            # 이번 분기 값이 있는 첫 개념. 전년 동기도 있는 개념이 있으면 그것을 우선
            have = [c for c in REVENUE if q in revenue[c].get(cik, {})]
            both = [c for c in have if p in revenue[c][cik]]
            c = (both or have or [None])[0]
            cur = revenue[c][cik][q] if c else None
            o = op.get(cik, {})
            if not cur or cur["val"] / 1e6 < MIN_REVENUE:
                continue
            prev = revenue[c][cik].get(p)
            oc, op_ = o.get(q), o.get(p)
            row = {
                "id": f"{cik}-{q}",
                "cik": cik,
                "ticker": ticker,
                "name": name,
                "period": q,
                "end_date": cur["end"].isoformat(),
                "accn": cur["accn"],
                "derived_q4": cur["derived"],
                "revenue": round(cur["val"] / 1e6, 1),
                "revenue_prev_y": round(prev["val"] / 1e6, 1) if prev else None,
                "op": round(oc["val"] / 1e6, 1) if oc else None,
                "op_prev_y": round(op_["val"] / 1e6, 1) if op_ else None,
            }
            row["revenue_yoy"], _ = _growth(row["revenue"], row["revenue_prev_y"])
            row["op_yoy"], row["op_turn"] = _growth(row["op"], row["op_prev_y"])
            rows.append(row)

    # 제출일은 처음 저장한 값을 유지 (frames의 접수번호는 나중에 낸 보고서로 바뀌기도 함)
    known = {}
    if db.URL:
        for off in range(0, 100_000, 1000):
            page = db.select("us_earnings", f"select=id,filed,form,accn&filed=not.is.null&limit=1000&offset={off}")
            known.update({r["id"]: r for r in page})
            if len(page) < 1000:
                break
    need = {r["accn"] for r in rows if r["id"] not in known}
    since = min(_date(r["end_date"]) for r in rows) if rows else today
    filed = _filings(need, since)
    for r in rows:
        k = known.get(r["id"])
        if k:
            r["accn"], r["filed"], r["form"] = k["accn"], k["filed"], k["form"]
        else:
            r["filed"], r["form"] = filed.get(r["accn"], (None, None))
        nodash = r["accn"].replace("-", "")
        r["url"] = f"https://www.sec.gov/Archives/edgar/data/{r['cik']}/{nodash}/{r['accn']}-index.htm"
    print(f"[미국 실적] {len(rows)}행, 제출일 확인 {sum(1 for r in rows if r['filed'])}행")
    for q in shown:
        print(f"  {q}: {sum(1 for r in rows if r['period'] == q)}개사")
    db.upsert("us_earnings", rows)


if __name__ == "__main__":
    collect()
