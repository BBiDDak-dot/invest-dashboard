"""실적 스크리닝: 코스피·코스닥 상장사의 분기 실적 공시에서 매출액·영업이익을 뽑음.

1) 영업(잠정)실적(공정공시): 원문(document.xml)의 표준 서식 표에서 당기·전기·전년동기 값.
2) 분기·반기·사업보고서: 잠정실적을 내지 않는 회사도 있어 정기보고서도 저장함.
   DART 다중회사 주요계정(fnlttMultiAcnt)으로 100개사씩 읽음. 4분기는 연간 - 3분기 누적.
화면에서는 종목·분기마다 가장 먼저 나온 공시를 씀.
"""

import datetime as dt
import html
import io
import os
import re
import zipfile
from collections import defaultdict

import requests

import db

DART = "https://opendart.fss.or.kr/api"
KEEP_DAYS = 400
REVENUE_NAMES = {"매출액", "수익(매출액)", "영업수익", "매출", "매출액(수익)"}
OP_NAMES = {"영업이익", "영업이익(손실)", "영업손실"}
# 정기보고서 제목 → 보고서 코드. 12월 결산 회사만 (다른 결산월은 분기가 어긋나 건너뜀)
REPORT_CODES = {("분기보고서", 3): "11013", ("반기보고서", 6): "11012", ("분기보고서", 9): "11014", ("사업보고서", 12): "11011"}


def _text(s: str) -> str:
    return re.sub(r"\s+", "", html.unescape(re.sub(r"<[^>]+>", "", s)))


def _num(s: str) -> float | None:
    s = s.replace(",", "").replace("△", "-").replace("(", "-").replace(")", "")
    try:
        return float(s)
    except ValueError:
        return None


def parse(doc: str) -> dict | None:
    """잠정실적 서식 표 → 값. 행: [구분, 당해실적, 당기, 전기, 전기대비%, 흑적전환, 전년동기, 전년동기대비%, 흑적전환]"""
    rows = [[_text(c) for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", tr, re.S)] for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", doc, re.S)]
    unit_m = re.search(r"단위\s*[:：]?\s*([가-힣]+원)", _text(doc))
    unit = unit_m.group(1) if unit_m else None
    scale = {"원": 1e-8, "천원": 1e-5, "백만원": 1e-2, "억원": 1, "십억원": 10, "조원": 1e4}.get(unit or "", None)
    out = {}
    for r in rows:
        for key, label in (("revenue", "매출액"), ("op", "영업이익")):
            # "영업이익" 행이 "영업이익(손실)"로 적히기도 함
            if r and r[0].startswith(label) and len(r) >= 9 and r[1].startswith("당해") and key not in out:
                v = r[2:9]
                out[key] = _num(v[0])
                out[key + "_prev_q"] = _num(v[1])
                out[key + "_qoq"] = _num(v[2])
                out[key + "_prev_y"] = _num(v[4])
                out[key + "_yoy"] = _num(v[5])
                out[key + "_turn"] = v[6] if v[6] not in ("", "-") else None
    if "revenue" not in out or "op" not in out:
        return None
    if scale is None:
        return None
    for k in ("revenue", "revenue_prev_q", "revenue_prev_y", "op", "op_prev_q", "op_prev_y"):
        if out.get(k) is not None:
            out[k] = round(out[k] * scale, 1)  # 억원으로 통일
    return out


def period_of(rcept_dt: str) -> str:
    # 원문마다 기간 표기가 제각각이라 공시 날짜로 분기를 정함 (1~3월 공시=전년 4분기, 4~6월=1분기, 7~9월=2분기, 10~12월=3분기)
    y, m = int(rcept_dt[:4]), int(rcept_dt[4:6])
    return f"{y - 1}.4Q" if m <= 3 else f"{y}.{(m - 1) // 3}Q"


def _document(key: str, rcept_no: str) -> str:
    r = requests.get(f"{DART}/document.xml", params={"crtfc_key": key, "rcept_no": rcept_no}, timeout=60)
    r.raise_for_status()
    zf = zipfile.ZipFile(io.BytesIO(r.content))
    return "".join(zf.read(n).decode("utf-8", "replace") for n in zf.namelist())


def _list(key: str, day: dt.date, cls: str, ty: str = "I") -> list[dict]:
    out, page = [], 1
    while True:
        r = requests.get(
            f"{DART}/list.json",
            params={"crtfc_key": key, "bgn_de": day.strftime("%Y%m%d"), "end_de": day.strftime("%Y%m%d"), "corp_cls": cls, "pblntf_ty": ty, "page_no": page, "page_count": 100},
            timeout=30,
        ).json()
        out += r.get("list", [])
        if page >= int(r.get("total_page", 1) or 1):
            return out
        page += 1


def _amount(s) -> float | None:
    try:
        return float((s or "").replace(",", ""))
    except ValueError:
        return None


def _multi(key: str, corp_codes: list[str], year: int, reprt_code: str) -> dict[str, dict]:
    """여러 회사 주요계정 → {corp_code: {"revenue": {...}, "op": {...}}}. 연결 우선, 없으면 별도."""
    out: dict[str, dict] = {}
    for i in range(0, len(corp_codes), 100):
        r = requests.get(
            f"{DART}/fnlttMultiAcnt.json",
            params={"crtfc_key": key, "corp_code": ",".join(corp_codes[i : i + 100]), "bsns_year": str(year), "reprt_code": reprt_code},
            timeout=120,
        ).json()
        by_fs: dict[str, dict[str, dict]] = defaultdict(lambda: defaultdict(dict))
        for it in r.get("list", []):
            if it.get("sj_div") != "IS":
                continue
            name = (it.get("account_nm") or "").strip()
            field = "revenue" if name in REVENUE_NAMES else "op" if name in OP_NAMES else None
            if field and field not in by_fs[it["corp_code"]][it.get("fs_div")]:
                by_fs[it["corp_code"]][it.get("fs_div")][field] = it
        for code, fs in by_fs.items():
            pick = fs.get("CFS") if len(fs.get("CFS", {})) == 2 else fs.get("OFS")
            if pick and len(pick) == 2:
                out[code] = {**pick, "fs": "CFS" if pick is fs.get("CFS") else "OFS"}
    return out


def _growth(now: float | None, prev: float | None) -> tuple[float | None, str | None]:
    """전년 대비 증감률(%)과 흑자·적자 전환 표시 (잠정실적 서식과 같은 말)"""
    if now is None or prev is None:
        return None, None
    if prev > 0:
        return round((now - prev) / prev * 100, 1), ("적자전환" if now < 0 else None)
    if prev < 0:
        return None, ("흑자전환" if now > 0 else "적자지속")
    return None, None


def periodic(key: str, start: dt.date, done: set[str], end: dt.date | None = None) -> list[dict]:
    """분기·반기·사업보고서 최초 제출본 → 해당 분기(3개월) 매출액·영업이익과 전년 동기"""
    filings = []
    day = start
    while day <= (end or dt.date.today()):
        for cls in ("Y", "K"):
            for d in _list(key, day, cls, "A"):
                # 기재정정·첨부추가 등 [..]이 붙은 건 최초 제출본이 아님
                m = re.match(r"^(분기보고서|반기보고서|사업보고서)\s*\((\d{4})\.(\d{2})\)", d["report_nm"].strip())
                code = m and REPORT_CODES.get((m.group(1), int(m.group(3))))
                if code and d["rcept_no"] not in done:
                    filings.append((d, cls, int(m.group(2)), code))
        day += dt.timedelta(days=1)

    groups: dict[tuple[int, str], list[str]] = defaultdict(list)
    for d, _, year, code in filings:
        groups[(year, code)].append(d["corp_code"])
    values = {g: _multi(key, codes, *g) for g, codes in groups.items()}
    # 4분기 = 연간 - 3분기 누적 (3분기보고서의 누적 금액)
    cum3 = {year: _multi(key, codes, year, "11014") for (year, code), codes in groups.items() if code == "11011"}

    rows = []
    for d, cls, year, code in filings:
        v = values[(year, code)].get(d["corp_code"])
        if not v:
            continue
        # 한 번에 올리는 행들은 칸 구성이 같아야 함(PostgREST). 정기보고서엔 직전 분기 값이 없음
        row = {"revenue_prev_q": None, "revenue_qoq": None, "op_prev_q": None, "op_qoq": None}
        for f in ("revenue", "op"):
            now, prev = _amount(v[f].get("thstrm_amount")), _amount(v[f].get("frmtrm_amount"))
            if code == "11011":
                c = cum3.get(year, {}).get(d["corp_code"])
                if not c or c["fs"] != v["fs"]:
                    now = prev = None
                else:
                    a, b = _amount(c[f].get("thstrm_add_amount")), _amount(c[f].get("frmtrm_add_amount"))
                    now = now - a if now is not None and a is not None else None
                    prev = prev - b if prev is not None and b is not None else None
            yoy, turn = _growth(now, prev)
            row[f] = round(now / 1e8, 1) if now is not None else None  # 억원
            row[f + "_prev_y"] = round(prev / 1e8, 1) if prev is not None else None
            row[f + "_yoy"], row[f + "_turn"] = yoy, turn
        if row["revenue"] is None or row["op"] is None:
            continue
        q = {"11013": 1, "11012": 2, "11014": 3, "11011": 4}[code]
        rows.append({
            "id": d["rcept_no"],
            "date": f"{d['rcept_dt'][:4]}-{d['rcept_dt'][4:6]}-{d['rcept_dt'][6:]}",
            "stock_code": d.get("stock_code") or None,
            "corp_name": d["corp_name"],
            "market": "KOSPI" if cls == "Y" else "KOSDAQ",
            "title": d["report_nm"].strip(),
            "consolidated": v["fs"] == "CFS",
            "corrected": False,
            "url": f"https://dart.fss.or.kr/dsaf001/main.do?rcpNo={d['rcept_no']}",
            "period": f"{year}.{q}Q",
            **row,
        })
    print(f"정기보고서: {len(filings)}건 중 {len(rows)}건 수치 읽음")
    return rows


def collect(start: dt.date) -> None:
    key = os.environ.get("DART_API_KEY")
    if not key:
        print("DART_API_KEY 없음, 실적 스크리닝 건너뜀")
        return
    done = {r["id"] for r in db.select("earnings_screen", f"select=id&date=gte.{start.isoformat()}")} if db.URL else set()
    rows, skipped = [], 0
    day = start
    while day <= dt.date.today():
        for cls in ("Y", "K"):
            for d in _list(key, day, cls):
                title = re.sub(r"\s+", "", d["report_nm"])
                # 자회사 실적을 모회사 이름으로 낸 공시(자회사의 주요경영사항)는 제외
                if "잠정" not in title or "실적" not in title or "자회사" in title or d["rcept_no"] in done:
                    continue
                try:
                    v = parse(_document(key, d["rcept_no"]))
                except Exception as e:  # 원문 하나가 깨져도 계속
                    print(f"[실적] {d['corp_name']} 원문 실패: {e}")
                    v = None
                if not v:
                    skipped += 1
                    continue
                rows.append({
                    "id": d["rcept_no"],
                    "date": f"{d['rcept_dt'][:4]}-{d['rcept_dt'][4:6]}-{d['rcept_dt'][6:]}",
                    "stock_code": d.get("stock_code") or None,
                    "corp_name": d["corp_name"],
                    "market": "KOSPI" if cls == "Y" else "KOSDAQ",
                    "title": d["report_nm"].strip(),
                    "consolidated": "연결" in title,
                    "corrected": "정정" in title.split("]")[0] if title.startswith("[") else False,
                    "url": f"https://dart.fss.or.kr/dsaf001/main.do?rcpNo={d['rcept_no']}",
                    "period": period_of(d["rcept_dt"]),
                    **v,
                })
        day += dt.timedelta(days=1)
    rows += periodic(key, start, done)
    db.upsert("earnings_screen", rows)
    print(f"실적 스크리닝: {len(rows)}건 저장, 표를 못 읽은 공시 {skipped}건")
    db.delete("earnings_screen", f"date=lt.{(dt.date.today() - dt.timedelta(days=KEEP_DAYS)).isoformat()}")
