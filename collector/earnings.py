"""실적 스크리닝: 코스피·코스닥 상장사의 영업(잠정)실적(공정공시)에서 매출액·영업이익을 뽑음.

DART 공시 목록에서 잠정실적 공시를 찾고, 원문(document.xml)의 표준 서식 표를 읽어
당기·전기(직전 분기)·전년동기 값과 증감률을 earnings_screen 테이블에 저장함.
"""

import datetime as dt
import html
import io
import os
import re
import zipfile

import requests

import db

DART = "https://opendart.fss.or.kr/api"
KEEP_DAYS = 400


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


def _list(key: str, day: dt.date, cls: str) -> list[dict]:
    out, page = [], 1
    while True:
        r = requests.get(
            f"{DART}/list.json",
            params={"crtfc_key": key, "bgn_de": day.strftime("%Y%m%d"), "end_de": day.strftime("%Y%m%d"), "corp_cls": cls, "pblntf_ty": "I", "page_no": page, "page_count": 100},
            timeout=30,
        ).json()
        out += r.get("list", [])
        if page >= int(r.get("total_page", 1) or 1):
            return out
        page += 1


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
    db.upsert("earnings_screen", rows)
    print(f"실적 스크리닝: {len(rows)}건 저장, 표를 못 읽은 공시 {skipped}건")
    db.delete("earnings_screen", f"date=lt.{(dt.date.today() - dt.timedelta(days=KEEP_DAYS)).isoformat()}")
