"""임시: 출처 시험 3 (머지 전 삭제)."""
import datetime as dt
import json
import re
import requests
from bs4 import BeautifulSoup

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9,ko;q=0.8"}


def collect():
    t = requests.get("https://www.wsj.com/market-data/stocks/peyields", headers=UA, timeout=30).text
    for m in re.finditer(r'"mdc_peAndYields_\{\\+"indexType\\+":\\+"(\w+)\\+"\}"', t):
        print("indexType", m[1])
    for m in re.finditer(r'\{"instrumentId":"\d+","name":"([^"]+)","priceEarningsRatio":"([^"]*)","priceEarningsRatioEstimate":"([^"]*)"[^}]*"ticker":"([^"]+)"', t):
        print("inst", m.groups())
    for d in ("2023-11-17", "2024-11-15", "2025-05-16", "2025-11-14", "2024-07-05", "2024-07-03"):
        d = dt.date.fromisoformat(d)
        url = f"https://advantage.factset.com/hubfs/Website/Resources%20Section/Research%20Desk/Earnings%20Insight/EarningsInsight_{d:%m%d%y}.pdf"
        r = requests.head(url, headers=UA, timeout=30, allow_redirects=True)
        print("factset", d, r.status_code, r.headers.get("content-length"))
    for code in ("005930", "247540", "035420"):
        page_url = f"https://navercomp.wisereport.co.kr/v2/company/c1010001.aspx?cmp_cd={code}"
        page = requests.get(page_url, headers=UA, timeout=20)
        enc = re.search(r"encparam\s*:\s*'([^']+)'", page.text)
        cid = re.search(r"\bid\s*:\s*'([^']+)'", page.text)
        r = requests.get("https://navercomp.wisereport.co.kr/v2/company/ajax/cF1001.aspx",
                         params={"cmp_cd": code, "fin_typ": "0", "freq_typ": "Y", "encparam": enc[1], "id": cid[1] if cid else ""},
                         headers={**UA, "Referer": page_url}, timeout=20)
        soup = BeautifulSoup(r.text, "html.parser")
        for table in soup.find_all("table"):
            heads = [th.get_text(" ", strip=True) for th in table.find_all("th")]
            years = [h for h in heads if re.search(r"\d{4}/\d{2}", h)]
            if not years:
                continue
            print(code, years)
            for tr in table.find_all("tr"):
                th = tr.find("th")
                if th and re.match(r"(EPS|BPS|PER|PBR|지배주주순이익|지배주주지분|발행주식수)", th.get_text(strip=True)):
                    print("  ", th.get_text(strip=True), [td.get_text(strip=True) for td in tr.find_all("td")])
            break
