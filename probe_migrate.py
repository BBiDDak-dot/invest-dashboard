# 메모에 넣었던 Claude 조사 29건을 실적 분석 리포트로 옮기고 메모는 비움
import json, os, re, requests
U, K = os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"]
H = {"apikey": K, "Authorization": f"Bearer {K}", "Content-Type": "application/json"}
def body(name, period, note):
    lines = note.split("\n")[1:]
    src = [l for l in lines if l.startswith("출처:")]
    pts = [l for l in lines if not l.startswith("출처:")]
    out = [f"# {name} {period} 실적: 상승 이유", "", "## 왜 늘었나", *pts]
    if src:
        out += ["", "## 자료"]
        for i, part in enumerate(src[0][3:].split(" / "), 1):
            m = re.match(r"\s*(.*?)\s+(https?://\S+)\s*$", part)
            out.append(f"{i}. [{m.group(1)}]({m.group(2)})" if m else f"{i}. {part.strip()}")
    return "\n".join(out)
for f, table, market in [("kr", "earnings_screen", "KR"), ("usA", "us_earnings", "US"), ("usB", "us_earnings", "US")]:
    for i, note in json.load(open(f"notes/{f}.json")).items():
        cols = "corp_name,period,note" if market == "KR" else "name,period,note"
        row = requests.get(f"{U}/rest/v1/{table}?select={cols}&id=eq.{i}", headers=H).json()[0]
        name = row.get("corp_name") or row.get("name")
        key = f"{'kr' if market == 'KR' else 'us'}-{i}"
        r = requests.post(f"{U}/rest/v1/earnings_reports", headers={**H, "Prefer": "resolution=merge-duplicates"}, json={"id": key, "market": market, "name": name, "period": row["period"], "body": body(name, row["period"], note), "model": "Claude 웹 조사"})
        # 메모가 그대로 내 조사 글일 때만 비움 (그 사이 직접 고쳤으면 남김)
        c = requests.patch(f"{U}/rest/v1/{table}?id=eq.{i}", headers={**H, "Prefer": "return=representation"}, json={"note": None, "note_updated_at": None}) if row["note"] == note else None
        print(key, r.status_code, r.text[:100] if not r.ok else "", "memo cleared" if c is not None and c.ok else "memo kept")
