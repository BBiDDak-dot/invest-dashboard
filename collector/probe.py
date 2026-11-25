"""임시 조사용 (머지 전 삭제)."""
import re
import requests

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36"}
BASE = "https://navercomp.wisereport.co.kr/v2/company"


def collect():
    page_url = f"{BASE}/c1050001.aspx?cmp_cd=005930"
    s = requests.Session()
    s.headers.update(UA)
    t = s.get(page_url, timeout=30).text
    for sel in ("conGubun2", "termTrendItem", "termTrend", "conGubun1"):
        m = re.search(rf'id="{sel}".*?</select>', t, re.S)
        print(f"[probe] select {sel}: {re.sub(r'\\s+', ' ', m[0])[:600] if m else None}")
    m = re.search(r"flag: '3'.*?\}", t, re.S)
    print("[probe] flag3 data:", re.sub(r"\s+", " ", m[0])[:400] if m else None)
    m = re.search(r"cF5002\.aspx.*?;", t, re.S)
    print("[probe] cF5002 url:", re.sub(r"\s+", " ", m[0])[:500] if m else None)
    hdr = {"Referer": page_url, "X-Requested-With": "XMLHttpRequest"}
    for fg in ("MAIN", "IFRSL", "IFRSS", "GAAPL"):
        r = s.get(f"{BASE}/ajax/c1050001_data.aspx", params={"flag": "3", "cmp_cd": "005930", "finGubun": fg, "frq": "0"}, headers=hdr, timeout=30)
        print(f"[probe] data flag3 {fg} {r.status_code} {r.text[:400]!r}")
    for frq in ("0", "Y"):
        for fg in ("MAIN", "IFRSL"):
            for yymm in ("202612", "202712"):
                r = s.get(f"{BASE}/ajax/cF5002.aspx", params={"cmp_cd": "005930", "dt": "20261124", "yymm": yymm, "frq": frq, "acc_cd": "312000", "fingubun": fg, "chartType": "svg"}, headers=hdr, timeout=30)
                print(f"[probe] cF5002 frq={frq} fg={fg} yymm={yymm} {r.status_code} {len(r.text)} {r.text[:700]!r}")
