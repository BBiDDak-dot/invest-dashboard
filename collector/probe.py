"""임시: 지수 Fwd PER/PBR 출처 시험 (머지 전 삭제)."""
import datetime as dt
import re
import requests
import yfinance as yf

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9,ko;q=0.8"}


def show(name, url, keys=(), n=300, **kw):
    try:
        r = requests.get(url, headers={**UA, **kw.pop("headers", {})}, timeout=25, **kw)
        t = r.text
        print(f"\n=== {name} HTTP {r.status_code} len {len(t)} ct {r.headers.get('content-type')}")
        hit = False
        for k in keys:
            for m in list(re.finditer(k, t, re.I))[:3]:
                hit = True
                print(f"  [{k}] ...{t[max(0, m.start()-200):m.end()+200]!r}")
        if not hit:
            print("  head:", repr(t[:n]))
        return r
    except Exception as e:
        print(f"\n=== {name} ERR {e}")


def collect():
    # 국내
    show("naver index integration", "https://m.stock.naver.com/api/index/KOSPI/integration", ["per", "pbr"], 1500)
    show("naver index basic", "https://m.stock.naver.com/api/index/KOSPI/basic", ["per", "pbr"], 800)
    show("naver stock integration", "https://m.stock.naver.com/api/stock/005930/integration", ["추정", "cnsPer", "PER"], 600)
    show("naver PC index", "https://finance.naver.com/sise/sise_index.naver?code=KOSPI", ["PER", "PBR"])
    show("fnguide market", "https://comp.fnguide.com/SVO2/ASP/SVD_Main.asp?pGB=1&gicode=A005930", ["PER"], 300)
    show("fnguide home", "https://www.fnguide.com/", ["PER"], 300)
    show("fnguide marketvalue", "https://comp.fnguide.com/SVO2/ASP/SVD_UJRank.asp?pGB=1&gicode=A005930", ["PER"], 300)
    show("wisereport index?", "https://navercomp.wisereport.co.kr/v2/company/c1010001.aspx?cmp_cd=005930", ["업종 PER", "PER"], 300)
    # 미국
    today = dt.date.today()
    for back in range(0, 22):
        d = today - dt.timedelta(days=back)
        if d.weekday() not in (3, 4):
            continue
        url = f"https://advantage.factset.com/hubfs/Website/Resources%20Section/Research%20Desk/Earnings%20Insight/EarningsInsight_{d:%m%d%y}.pdf"
        r = show(f"factset {d}", url, [], 100)
        if r is not None and r.status_code == 200 and r.content[:4] == b"%PDF":
            print("  FACTSET PDF OK", len(r.content))
            break
    show("factset insight page", "https://insight.factset.com/topic/earnings", ["forward 12-month P/E", "EarningsInsight_\\d+"], 300)
    show("wsj peyields", "https://www.wsj.com/market-data/stocks/peyields", ["Estimate", "S&P 500"], 300)
    show("worldperatio sp500", "https://worldperatio.com/index/sp-500/", ["forward"], 300)
    show("worldperatio nasdaq", "https://worldperatio.com/index/nasdaq-100/", ["forward"], 300)
    show("multpl pb", "https://www.multpl.com/s-p-500-price-to-book/table/by-month", ["<td"], 300)
    show("yardeni", "https://yardeni.com/charts/stock-market-p-e-ratios/", ["forward", "\\.pdf"], 300)
    show("slickcharts sp500", "https://www.slickcharts.com/sp500", ["AAPL", "NVDA"], 300)
    show("slickcharts ndx", "https://www.slickcharts.com/nasdaq100", ["AAPL"], 300)
    show("gurufocus fwd", "https://www.gurufocus.com/economic_indicators/6778/sp-500-forward-pe-ratio", ["forward"], 300)
    for t in ("SPY", "QQQ", "ONEQ"):
        try:
            fd = yf.Ticker(t).funds_data
            print(f"\n=== yf {t} equity_holdings\n{fd.equity_holdings}")
        except Exception as e:
            print(f"\n=== yf {t} funds ERR {e}")
    try:
        tk = yf.Ticker("AAPL")
        info = tk.info
        print("\n=== yf AAPL", {k: info.get(k) for k in ("forwardEps", "forwardPE", "bookValue", "priceToBook", "marketCap", "sharesOutstanding", "lastFiscalYearEnd", "nextFiscalYearEnd")})
        print(tk.earnings_estimate)
    except Exception as e:
        print("yf AAPL ERR", e)
