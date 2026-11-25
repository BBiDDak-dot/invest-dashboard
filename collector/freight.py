"""해운 운임·신조선가 지수 수집 → macro 테이블(series_id 접두어 SHIP:)."""

import re

import requests

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"}
EM = "https://datacenter-web.eastmoney.com/api/data/v1/get"


def _show(label, url, **kw):
    try:
        r = requests.get(url, headers={**UA, **kw.pop("headers", {})}, timeout=30, **kw)
        body = r.text
        print(f"[운임 점검] {label}: {r.status_code} {r.headers.get('content-type')} {len(body)}자")
        return r
    except Exception as e:
        print(f"[운임 점검] {label}: 실패 {e}")
        return None


def check() -> None:
    # 1) 东方财富 업종 지수: 지표 이름 전체 목록에서 운임·선박 관련만
    for page in range(1, 6):
        r = _show(f"동방재부 목록 p{page}", EM, params={"reportName": "RPT_INDUSTRY_INDEX", "columns": "INDICATOR_ID,INDICATOR_NAME",
                  "pageSize": "500", "pageNumber": str(page), "source": "WEB", "client": "WEB", "distinct": "INDICATOR_ID"})
        if not r:
            break
        try:
            j = r.json()
            data = (j.get("result") or {}).get("data") or []
            print(f"   pages={(j.get('result') or {}).get('pages')} rows={len(data)}")
            seen = {}
            for d in data:
                seen[d.get("INDICATOR_ID")] = d.get("INDICATOR_NAME")
            for k, v in seen.items():
                if v and re.search(r"运|船|箱|BDI|SCFI|CCFI|指数", v) and re.search(r"运|船|箱|航|干散|油", v):
                    print(f"   {k} {v}")
            if page >= ((j.get("result") or {}).get("pages") or 1):
                break
        except Exception as e:
            print("   json 실패", e, r.text[:300])
            break
    for iid in ["EMI00107664", "EMI00107665", "EMI00107666", "EMI00107667", "EMI00107668", "EMI00107669", "EMI00107670"]:
        r = _show(f"동방재부 {iid}", EM, params={"reportName": "RPT_INDUSTRY_INDEX", "columns": "ALL", "pageSize": "3",
                  "sortColumns": "REPORT_DATE", "sortTypes": "-1", "filter": f'(INDICATOR_ID="{iid}")', "source": "WEB", "client": "WEB"})
        if r:
            try:
                res = r.json().get("result") or {}
                d = (res.get("data") or [{}])
                print(f"   count={res.get('count')} pages={res.get('pages')} 최신={ {k: d[0].get(k) for k in ('INDICATOR_NAME','REPORT_DATE','INDICATOR_VALUE')} }")
            except Exception as e:
                print("   ", e, r.text[:200])
    # 2) 新浪 宏观 업종 지수(event 번호별 헤더)
    for ev in range(18, 30):
        r = _show(f"신랑 event {ev}", "http://quotes.sina.cn/mac/view/vMacExcle.php",
                  params={"cate": "industry", "event": str(ev), "from": "0", "num": "5000", "condition": ""})
        if r and r.status_code == 200:
            lines = r.content.decode("gbk", "ignore").split("\n")
            print("   ", lines[2][:400] if len(lines) > 2 else lines[:2])
            print("    첫:", lines[3][:150] if len(lines) > 3 else "-", "| 끝:", [l for l in lines if l.strip()][-1][:150], "| 줄", len(lines))
    # 3) 상하이해운거래소
    for u in ["https://www.sse.net.cn/index/singleIndex?indexType=scfi", "https://en.sse.net.cn/currentIndex?indexName=scfi",
              "https://www.sse.net.cn/index/singleIndex?indexType=ccfi", "https://www.sse.net.cn/index/singleIndex?indexType=cnpi"]:
        r = _show("SSE", u)
        if r:
            print("   ", r.text[:400].replace("\n", " "))
    # 4) 기타
    for label, u in [("FBX", "https://fbx.freightos.com/api/lane/FBX?isDaily=true"),
                     ("stock-marketdata", "https://stock-marketdata.com/time-series/charts/commodity-container-scfi-index.html"),
                     ("MarketWatch BDI", "https://www.marketwatch.com/investing/index/bdi/downloaddatapartial?startdate=01/01/2025%2000:00:00&enddate=11/20/2026%2000:00:00&daterange=d30&frequency=p1d&csvdownload=true&downloadpartial=false&newdates=false&countrycode=xx"),
                     ("WSJ BDI", "https://www.wsj.com/market-data/quotes/index/XX/BDI/historical-prices/download?MOD_VIEW=page&num_rows=1000&range_days=1000&startDate=01/01/2024&endDate=11/20/2026")]:
        r = _show(label, u)
        if r:
            t = r.text
            print("   ", t[:300].replace("\n", " "))
            if label == "stock-marketdata":
                print("    참조:", sorted(set(re.findall(r"""["']([^"']+\.(?:json|csv|js|php)[^"']*)["']""", t)))[:40])
