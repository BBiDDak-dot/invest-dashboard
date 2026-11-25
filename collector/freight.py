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
    # 신조선가 CNTPI
    r = _show("CNTPI", EM, params={"reportName": "RPT_INDUSTRY_INDEX", "columns": "ALL", "pageSize": "500",
              "sortColumns": "REPORT_DATE", "sortTypes": "-1", "filter": '(INDICATOR_ID="EMI00890442")', "source": "WEB", "client": "WEB"})
    if r:
        res = r.json().get("result") or {}
        d = res.get("data") or []
        print(f"   count={res.get('count')} pages={res.get('pages')} 키={list(d[0].keys()) if d else None}")
        for x in d[:8] + d[-3:]:
            print("   ", x.get("REPORT_DATE"), x.get("INDICATOR_VALUE"), x.get("INDICATOR_NAME"))
    for name in ["scfi", "ccfi", "cnpi", "cntpi", "cbfi", "secfi"]:
        r = _show(f"SSE currentIndex {name}", f"https://en.sse.net.cn/currentIndex?indexName={name}")
        if r:
            print("   ", r.text[:250].replace("\n", " "))
    for slug in ["commodity-container-scfi-index", "commodity-container-ccfi-index", "commodity-ccfi-index", "commodity-container-wci-index",
                 "commodity-container-fbx-index", "commodity-bdi-index", "commodity-baltic-dry-index"]:
        r = _show(f"smd {slug}", f"https://stock-marketdata.com/time-series/charts/{slug}.html")
        if not r or r.status_code != 200:
            continue
        t = r.text
        for m in list(re.finditer(r"Plotly\.(newPlot|react)", t))[:2]:
            print("    plot@", m.start(), t[m.start():m.start() + 200].replace("\n", " "))
        for m in list(re.finditer(r'"name"\s*:\s*"([^"]*)"', t))[:12]:
            print("    name:", m.group(1))
        for m in list(re.finditer(r'"x"\s*:\s*\[', t))[:6]:
            seg = t[m.end():m.end() + 120000]
            j = seg.find("]")
            arr = seg[:j].split(",")
            print(f"    x 길이 {len(arr)} 처음 {arr[:2]} 끝 {arr[-2:]}")
            k = t.find('"y"', m.end())
            print("    y 앞:", t[k:k + 120].replace("\n", " "))
