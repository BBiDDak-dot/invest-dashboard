"""임시 조사용 (머지 전 삭제)."""
import re
import requests

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36"}


def show(url, pats, n=6, width=300, **kw):
    try:
        r = requests.get(url, headers={**UA, **kw.pop("headers", {})}, timeout=30, **kw)
    except Exception as e:
        print(f"[probe] {url} 실패 {e}")
        return ""
    print(f"[probe] {url} {r.status_code} {len(r.text)}자")
    for p in pats:
        hits = [r.text[max(0, m.start() - 80):m.start() + width].replace("\n", " ") for m in re.finditer(p, r.text)][:n]
        print(f"  [{p}] {len(hits)}건 {hits!r}")
    return r.text


def collect():
    t = show("https://navercomp.wisereport.co.kr/v2/company/c1050001.aspx?cmp_cd=005930", [r"ajax/[^\"']+", r"encparam", r"\.aspx\?", r"추이"], n=15, width=160)
    enc = re.search(r"encparam\s*:\s*'([^']+)'", t)
    ref = {"Referer": "https://navercomp.wisereport.co.kr/v2/company/c1050001.aspx?cmp_cd=005930"}
    for path in sorted(set(re.findall(r"ajax/(cF\d+\.aspx)", t))):
        for extra in ({}, {"fin_typ": "0", "freq_typ": "Y"}):
            show(f"https://navercomp.wisereport.co.kr/v2/company/ajax/{path}", [r"\d{4}[./-]\d{2}[./-]\d{2}", r"EPS"], n=4, width=200,
                 params={"cmp_cd": "005930", "encparam": enc[1] if enc else "", **extra}, headers=ref)
    show("https://worldperatio.com/index/nasdaq-100/", [r"(?i)forward", r"_data\s*="], n=8, width=200)
    show("https://www.prnewswire.com/news/institute-for-supply-management/", [r"Manufacturing PMI"], n=6, width=160)
