"""공시 수집.

1) 관심종목 공시 전부: 국내는 DART, 미국은 SEC EDGAR → disclosures 테이블
2) 전체 상장사(코스피·코스닥) 중 투자 시그널이 될 만한 공시만 → signal_disclosures 테이블
   (실적 급변, 수주, 내부자 매매, 자사주, 증자·CB, 최대주주 변경 등)
"""

import datetime as dt
import os
import re
import time

import requests

import db
from financials import SEC_HEADERS

DART_LIST = "https://opendart.fss.or.kr/api/list.json"

# 보고서명 키워드 → 분류. 위에서부터 먼저 맞는 것을 씀
SIGNALS: list[tuple[str, list[str]]] = [
    ("위험", ["거래처와의거래중단", "횡령", "배임", "영업정지", "관리종목", "상장폐지", "상장적격성", "불성실공시", "회생절차", "파산", "부도", "감사의견", "거래정지", "감자결정"]),
    ("실적", ["매출액또는손익구조", "영업(잠정)실적", "잠정실적"]),
    ("수주·계약", ["단일판매ㆍ공급계약", "단일판매·공급계약"]),
    ("내부자 매매", ["임원ㆍ주요주주특정증권등소유상황보고서", "임원·주요주주특정증권등소유상황보고서"]),
    ("자사주·배당", ["자기주식취득", "자기주식처분", "자기주식소각", "주식소각결정", "현금ㆍ현물배당", "현금·현물배당"]),
    ("증자·CB", ["유상증자결정", "무상증자결정", "전환사채권발행결정", "신주인수권부사채권발행결정", "교환사채권발행결정"]),
    ("M&A·지배구조", ["최대주주변경", "최대주주 변경", "합병결정", "분할결정", "분할합병결정", "공개매수", "영업양수", "영업양도", "타법인주식및출자증권취득결정", "타법인주식및출자증권양도결정"]),
    ("5% 지분", ["주식등의대량보유상황보고서"]),
]
# 공시 종류 → 한글 이름
SEC_FORMS = {
    "8-K": "주요 사항", "10-Q": "분기보고서", "10-K": "연차보고서", "4": "내부자 거래",
    "SC 13D": "5% 지분(경영참여)", "SC 13D/A": "5% 지분 변동(경영참여)", "SC 13G": "5% 지분", "SC 13G/A": "5% 지분 변동",
    "6-K": "주요 사항(외국기업)", "20-F": "연차보고서(외국기업)", "S-1": "증권 신고", "S-3": "증권 신고", "DEF 14A": "주총 위임장",
}
SKIP_WORDS = ["주주명부폐쇄"]  # 배당 기준일 안내 등 시그널이 아닌 것


def _category(title: str) -> str | None:
    t = title.replace(" ", "")
    if any(w in t for w in SKIP_WORDS):
        return None
    for cat, words in SIGNALS:
        if any(w.replace(" ", "") in t for w in words):
            return cat
    return None


def _date(yyyymmdd: str) -> str:
    return f"{yyyymmdd[:4]}-{yyyymmdd[4:6]}-{yyyymmdd[6:]}"


def _dart_url(rcept_no: str) -> str:
    return f"https://dart.fss.or.kr/dsaf001/main.do?rcpNo={rcept_no}"


def _dart_list(key: str, **params) -> list[dict]:
    """목록 API 전체 페이지. 013(데이터 없음)은 빈 목록."""
    out, page = [], 1
    while True:
        r = requests.get(DART_LIST, params={"crtfc_key": key, "page_count": 100, "page_no": page, **params}, timeout=30)
        data = r.json()
        if data.get("status") == "013":
            return out
        if data.get("status") != "000":
            raise RuntimeError(f"DART 목록 오류: {data.get('message')}")
        out += data.get("list", [])
        if page >= int(data.get("total_page", 1)):
            return out
        page += 1


# ---------- 1) 관심종목 공시 ----------


def watch_korea(key: str, watchlist: list[dict], start: dt.date) -> None:
    for w in watchlist:
        if w["market"] != "KR" or not w.get("corp_code"):
            continue
        try:
            items = _dart_list(key, corp_code=w["corp_code"], bgn_de=start.strftime("%Y%m%d"))
        except Exception as e:
            print(f"DART {w['ticker']} 실패: {e}")
            continue
        db.upsert(
            "disclosures",
            [
                {"id": d["rcept_no"], "ticker": w["ticker"], "date": _date(d["rcept_dt"]), "title": d["report_nm"].strip(), "url": _dart_url(d["rcept_no"])}
                for d in items
            ],
        )


def watch_us(watchlist: list[dict], start: dt.date) -> None:
    us = [w["ticker"] for w in watchlist if w["market"] == "US"]
    if not us:
        return
    ciks = {}
    if db.URL:
        found = db.select("securities", "select=ticker,corp_code&ticker=in.(" + ",".join(f'"{t}"' for t in us) + ")")
        ciks = {s["ticker"]: s["corp_code"] for s in found if s.get("corp_code")}
    for t in us:
        cik = ciks.get(t)
        if not cik:
            print(f"{t} CIK 없음, 공시 건너뜀")
            continue
        try:
            r = requests.get(f"https://data.sec.gov/submissions/CIK{int(cik):010d}.json", headers=SEC_HEADERS, timeout=30)
            r.raise_for_status()
            rec = r.json()["filings"]["recent"]
        except Exception as e:
            print(f"SEC {t} 실패: {e}")
            continue
        rows = []
        for i, form in enumerate(rec["form"]):
            day = rec["filingDate"][i]
            if day < start.isoformat() or form not in SEC_FORMS:
                continue
            acc = rec["accessionNumber"][i]
            desc = (rec.get("primaryDocDescription") or [""] * len(rec["form"]))[i] or ""
            items = (rec.get("items") or [""] * len(rec["form"]))[i] or ""
            title = f"{SEC_FORMS[form]} ({form}" + (f", Item {items}" if items else "") + ")" + (f" · {desc}" if desc and desc.upper() not in (form, f"FORM {form}") else "")
            doc = rec["primaryDocument"][i]
            url = f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{acc.replace('-', '')}/{doc}"
            rows.append({"id": f"SEC-{acc}", "ticker": t, "date": day, "title": title, "url": url})
        db.upsert("disclosures", rows)
        time.sleep(0.2)  # SEC 요청 제한(초당 10회) 여유


# ---------- 2) 전체 상장사 시그널 공시 ----------

_insider_cache: dict[str, dict[str, dict]] = {}


def _insider(key: str, corp_code: str, rcept_no: str) -> dict | None:
    """임원·주요주주 보고서 한 건의 증감 주식 수 (elestock API, 회사별 전체 이력에서 찾음)"""
    if corp_code not in _insider_cache:
        r = requests.get("https://opendart.fss.or.kr/api/elestock.json", params={"crtfc_key": key, "corp_code": corp_code}, timeout=30)
        data = r.json()
        _insider_cache[corp_code] = {d["rcept_no"]: d for d in data.get("list", [])} if data.get("status") == "000" else {}
    return _insider_cache[corp_code].get(rcept_no)


def _num(s) -> float | None:
    try:
        return float(str(s).replace(",", ""))
    except (TypeError, ValueError):
        return None


def signals(key: str, start: dt.date) -> None:
    end = dt.date.today()
    rows = []
    day = start
    while day <= end:
        ymd = day.strftime("%Y%m%d")
        for cls in ("Y", "K"):  # 코스피, 코스닥
            for d in _dart_list(key, bgn_de=ymd, end_de=ymd, corp_cls=cls):
                title = re.sub(r"\s+", "", d["report_nm"])
                if title.startswith("[") and "정정" in title.split("]")[0]:
                    continue  # 정정 공시는 제외 (원 공시로 충분)
                cat = _category(title)
                if not cat:
                    continue
                note, direction = None, None
                if cat == "내부자 매매":
                    info = _insider(key, d["corp_code"], d["rcept_no"])
                    chg = _num(info.get("sp_stock_lmp_irds_cnt")) if info else None
                    if chg is None or chg == 0:
                        continue  # 증감 없는 보고(신규 선임 등)는 시그널 아님
                    direction = "buy" if chg > 0 else "sell"
                    who = " ".join(x for x in [info.get("repror"), info.get("isu_exctv_ofcps")] if x and x != "-")
                    note = f"{who} {'매수' if chg > 0 else '매도'} {abs(chg):,.0f}주".strip()
                elif "해지" in title or "취소" in title:
                    direction = "sell"
                rows.append({
                    "id": d["rcept_no"],
                    "date": _date(d["rcept_dt"]),
                    "stock_code": d.get("stock_code") or None,
                    "corp_name": d["corp_name"],
                    "market": "KOSPI" if cls == "Y" else "KOSDAQ",
                    "category": cat,
                    "title": d["report_nm"].strip(),
                    "note": note,
                    "direction": direction,
                    "url": _dart_url(d["rcept_no"]),
                })
        day += dt.timedelta(days=1)
    db.upsert("signal_disclosures", rows)
    # 90일 지난 것은 정리
    db.delete("signal_disclosures", f"date=lt.{(end - dt.timedelta(days=90)).isoformat()}")


def collect(start: dt.date, watchlist: list[dict]) -> None:
    key = os.environ.get("DART_API_KEY")
    watch_us(watchlist, start)
    if not key:
        print("DART_API_KEY 없음, 국내 공시 건너뜀")
        return
    watch_korea(key, watchlist, start)
    # 전체 시장 공시는 양이 많음(하루 수백 건). 평소엔 최근 3일만 다시 훑고(하루 두 번 돌아 빠짐없이 쌓임),
    # 처음처럼 길게 돌릴 때만 2주치를 채움
    today = dt.date.today()
    signals(key, today - dt.timedelta(days=14 if (today - start).days > 10 else 3))
