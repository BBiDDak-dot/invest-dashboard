"""분기 재무 수집. 국내: DART 단일회사 주요계정, 미국: SEC XBRL companyfacts.

모든 값은 '해당 분기 3개월' 기준으로 저장함. 4분기는 연간 값에서 1~3분기 누적을 빼서 구함.
"""

import datetime as dt
import os

import requests

import db

# ---------- 국내 (DART) ----------

DART_URL = "https://opendart.fss.or.kr/api/fnlttSinglAcnt.json"
# 보고서 코드 → (분기 번호, 분기말 월일)
REPORTS = [("11013", 1, "03-31"), ("11012", 2, "06-30"), ("11014", 3, "09-30"), ("11011", 4, "12-31")]
REVENUE_NAMES = {"매출액", "수익(매출액)", "영업수익", "매출", "매출액(수익)"}
OP_NAMES = {"영업이익", "영업이익(손실)", "영업손실"}
BS_NAMES = {"부채총계": "total_liabilities", "자본총계": "total_equity", "자본금": "capital_stock"}


def _amount(s) -> float | None:
    s = (s or "").replace(",", "").strip()
    try:
        return float(s)
    except ValueError:
        return None


def _dart_report(key: str, corp_code: str, year: int, reprt_code: str) -> dict | None:
    r = requests.get(
        DART_URL,
        params={"crtfc_key": key, "corp_code": corp_code, "bsns_year": str(year), "reprt_code": reprt_code},
        timeout=30,
    )
    data = r.json()
    if data.get("status") != "000":
        return None
    items = data.get("list", [])
    # 연결재무제표 우선, 없으면 별도
    fs = "CFS" if any(i.get("fs_div") == "CFS" for i in items) else "OFS"
    out = {}
    for i in items:
        if i.get("fs_div") != fs:
            continue
        name = i.get("account_nm", "").strip()
        if i.get("sj_div") == "IS":
            # 누적 금액(thstrm_add_amount)이 있으면 그것을, 없으면 당기 금액을 씀
            cum = _amount(i.get("thstrm_add_amount")) if reprt_code in ("11012", "11014") else None
            val = cum if cum is not None else _amount(i.get("thstrm_amount"))
            if name in REVENUE_NAMES and "revenue" not in out:
                out["revenue"] = val
            elif name in OP_NAMES and "operating_income" not in out:
                out["operating_income"] = val
        elif i.get("sj_div") == "BS" and name in BS_NAMES:
            out.setdefault(BS_NAMES[name], _amount(i.get("thstrm_amount")))
    return out or None


def korea(key: str, ticker: str, corp_code: str, years: list[int]) -> list[dict]:
    rows = []
    for year in years:
        cum = {}  # 분기 번호 → 누적 값
        for code, q, md in REPORTS:
            rep = _dart_report(key, corp_code, year, code)
            if not rep:
                continue
            cum[q] = rep
            row = {
                "ticker": ticker,
                "period_end": f"{year}-{md}",
                "currency": "KRW",
                **{k: rep.get(k) for k in BS_NAMES.values()},
            }
            # 누적 → 단일 분기: 이번 누적 - 직전 분기 누적
            for f in ("revenue", "operating_income"):
                now, prev = rep.get(f), (cum.get(q - 1) or {}).get(f) if q > 1 else 0
                row[f] = now - prev if now is not None and prev is not None else None
            rows.append(row)
    return rows


# ---------- 미국 (SEC) ----------

SEC_HEADERS = {"User-Agent": "invest-dashboard personal research (github.com/BBiDDak-dot)"}
REVENUE_TAGS = [
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "Revenues",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
    "SalesRevenueNet",
]


def _usd(facts: dict, tag: str) -> list[dict]:
    return facts.get("us-gaap", {}).get(tag, {}).get("units", {}).get("USD", [])


def _quarterly(entries: list[dict]) -> dict[str, float]:
    """기간형(손익) 항목 → {분기말: 3개월 값}. 4분기는 연간 - 같은 회계연도 1~3분기."""
    quarters, annual = {}, {}
    for e in entries:
        if "start" not in e or e.get("form") not in ("10-Q", "10-K", "10-Q/A", "10-K/A"):
            continue
        days = (dt.date.fromisoformat(e["end"]) - dt.date.fromisoformat(e["start"])).days
        if 80 <= days <= 100:
            quarters[e["end"]] = e["val"]
        elif 350 <= days <= 380:
            annual[e["end"]] = (e["start"], e["val"])
    for end, (start, val) in annual.items():
        if end in quarters:
            continue
        inside = [v for qe, v in quarters.items() if start < qe < end]
        if len(inside) == 3:
            quarters[end] = val - sum(inside)
    return quarters


def _instant(entries: list[dict]) -> dict[str, float]:
    return {e["end"]: e["val"] for e in entries if "start" not in e}


def us(ticker: str, cik: str, since: dt.date) -> list[dict]:
    r = requests.get(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{int(cik):010d}.json", headers=SEC_HEADERS, timeout=60)
    r.raise_for_status()
    facts = r.json().get("facts", {})
    # 최근 데이터가 있는 매출 태그를 고름 (회사마다 쓰는 태그가 다름)
    revenue = max((_quarterly(_usd(facts, t)) for t in REVENUE_TAGS), key=lambda q: max(q, default=""))
    op = _quarterly(_usd(facts, "OperatingIncomeLoss"))
    liab = _instant(_usd(facts, "Liabilities"))
    equity = _instant(_usd(facts, "StockholdersEquity"))
    total = _instant(_usd(facts, "LiabilitiesAndStockholdersEquity"))
    rows = []
    for end in sorted(set(revenue) | set(op)):
        if end < since.isoformat():
            continue
        l = liab.get(end)
        if l is None and end in total and end in equity:
            l = total[end] - equity[end]
        rows.append({
            "ticker": ticker,
            "period_end": end,
            "revenue": revenue.get(end),
            "operating_income": op.get(end),
            "total_liabilities": l,
            "total_equity": equity.get(end),
            "capital_stock": None,
            "currency": "USD",
        })
    return rows


def collect(watchlist: list[dict]) -> None:
    key = os.environ.get("DART_API_KEY")
    this_year = dt.date.today().year
    years = [this_year - 2, this_year - 1, this_year]
    since = dt.date(this_year - 3, 1, 1)
    # 미국 종목 CIK는 securities 테이블에서 찾음
    us_tickers = [w["ticker"] for w in watchlist if w["market"] == "US"]
    ciks = {}
    if us_tickers and db.URL:
        found = db.select("securities", "select=ticker,corp_code&ticker=in.(" + ",".join(f'"{t}"' for t in us_tickers) + ")")
        ciks = {s["ticker"]: s["corp_code"] for s in found}
    for w in watchlist:
        try:
            if w["market"] == "KR":
                if not key or not w.get("corp_code"):
                    continue
                rows = korea(key, w["ticker"], w["corp_code"], years)
            else:
                cik = ciks.get(w["ticker"]) or w.get("corp_code")
                if not cik:
                    print(f"{w['ticker']} CIK 없음 (securities 목록 갱신 필요)")
                    continue
                rows = us(w["ticker"], cik, since)
            db.upsert("financials_quarterly", rows)
        except Exception as e:
            print(f"{w['ticker']} 재무 실패: {e}")
