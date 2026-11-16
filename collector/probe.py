"""임시: 지수 Fwd PER/PBR 출처 시험 2 (머지 전 삭제)."""
import datetime as dt
import io
import json
import re
import time
import requests

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9,ko;q=0.8"}


def collect():
    # WSJ
    t = requests.get("https://www.wsj.com/market-data/stocks/peyields", headers=UA, timeout=30).text
    for k in ["Nasdaq", "S&amp;P 500 Index", "S&P 500 Index", "Russell", "estimate", "priceEarningsRatio", "Index\":"]:
        for m in list(re.finditer(re.escape(k), t))[:4]:
            print(f"[wsj {k}]", repr(t[max(0, m.start()-300):m.end()+400]))
    m = re.search(r'<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>', t, re.S)
    print("NEXT_DATA", bool(m), len(m[1]) if m else 0)
    for m in re.finditer(r'window\.__([A-Z_]+)__\s*=', t):
        print("window var", m[1])
    # FactSet PDF text
    import pypdf
    today = dt.date.today()
    for back in range(0, 14):
        d = today - dt.timedelta(days=back)
        url = f"https://advantage.factset.com/hubfs/Website/Resources%20Section/Research%20Desk/Earnings%20Insight/EarningsInsight_{d:%m%d%y}.pdf"
        r = requests.get(url, headers=UA, timeout=30)
        if r.status_code == 200 and r.content[:4] == b"%PDF":
            txt = "\n".join(p.extract_text() or "" for p in pypdf.PdfReader(io.BytesIO(r.content)).pages[:3])
            for m in re.finditer(r"forward 12-month P/E", txt):
                print("[factset]", repr(txt[max(0, m.start()-200):m.end()+300]))
            break
    # wisereport EPS/BPS 표
    for code in ("005930", "247540", "196170"):
        t0 = time.time()
        page_url = f"https://navercomp.wisereport.co.kr/v2/company/c1010001.aspx?cmp_cd={code}"
        page = requests.get(page_url, headers=UA, timeout=20)
        enc = re.search(r"encparam\s*:\s*'([^']+)'", page.text)
        cid = re.search(r"\bid\s*:\s*'([^']+)'", page.text)
        r = requests.get("https://navercomp.wisereport.co.kr/v2/company/ajax/cF1001.aspx",
                         params={"cmp_cd": code, "fin_typ": "0", "freq_typ": "Y", "encparam": enc[1], "id": cid[1] if cid else ""},
                         headers={**UA, "Referer": page_url}, timeout=20)
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(r.text, "html.parser")
        tb = soup.find("table")
        print(code, f"{time.time()-t0:.1f}s", [th.get_text(" ", strip=True) for th in tb.find_all("th")][:20])
        for tr in tb.find_all("tr"):
            th = tr.find("th")
            if th and re.match(r"(EPS|BPS|PER|PBR|지배주주순이익|발행주식수)", th.get_text(strip=True)):
                print("  ", th.get_text(strip=True), [td.get_text(strip=True) for td in tr.find_all("td")])
    # 네이버 시총 목록 필드
    r = requests.get("https://m.stock.naver.com/api/stocks/marketValue/KOSPI", params={"page": 1, "pageSize": 2}, headers=UA, timeout=15)
    print(json.dumps(r.json(), ensure_ascii=False)[:1500])
    # 네이버 지수 PER? (KOSPI 지수 integration totalInfos 키)
    r = requests.get("https://m.stock.naver.com/api/index/KOSPI/integration", headers=UA, timeout=15).json()
    print([ (x.get("code"), x.get("key"), x.get("value")) for x in r.get("totalInfos", [])])
