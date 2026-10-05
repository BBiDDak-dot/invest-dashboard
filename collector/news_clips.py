"""산업 클리핑: 국내·해외 산업 매체 RSS에서 '산업이 어떻게 바뀌는가'를 보여 주는 기사만 골라 저장함.

1) 매체 RSS를 모아 최근 기사만 남김 (이미 본 기사는 건너뜀)
2) 주가·시황 기사는 제목 규칙으로 먼저 거름
3) Gemini가 기사마다 변화 유형(수요·상용화·사업모델·생산성·경쟁·공급망·제도), 산업,
   점수(0~3), "무엇이 바뀌었나" 한 줄을 붙임. GEMINI_API_KEY가 없으면 키워드 규칙으로 대신함
4) 고른 기사와 거른 기사를 모두 news_clips에 저장 (거른 기사는 다시 판단하지 않으려고 남김)
"""

import datetime as dt
import email.utils
import hashlib
import html
import json
import os
import re
import time
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor

import requests

import db

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"}
LOOKBACK_DAYS = 3
KEEP_DAYS = 30

# (매체 이름, 지역, RSS 주소). 주가·시황 위주 매체는 넣지 않음
FEEDS = [
    ("전자신문", "국내", "https://rss.etnews.com/Section901.xml"),
    ("지디넷코리아", "국내", "https://zdnet.co.kr/feed"),
    ("디일렉", "국내", "https://www.thelec.kr/rss/allArticle.xml"),
    ("블로터", "국내", "https://www.bloter.net/rss/allArticle.xml"),
    ("바이라인네트워크", "국내", "https://byline.network/feed/"),
    ("한국경제 IT", "국내", "https://www.hankyung.com/feed/it"),
    ("매일경제 기업", "국내", "https://www.mk.co.kr/rss/50100032/"),
    ("히트뉴스", "국내", "https://www.hitnews.co.kr/rss/allArticle.xml"),
    ("에너지신문", "국내", "https://www.energy-news.co.kr/rss/allArticle.xml"),
    ("플래텀", "국내", "https://platum.kr/feed"),
    ("벤처스퀘어", "국내", "https://www.venturesquare.net/feed"),
    ("TechCrunch", "해외", "https://techcrunch.com/feed/"),
    ("IEEE Spectrum", "해외", "https://spectrum.ieee.org/feeds/feed.rss"),
    ("MIT Technology Review", "해외", "https://www.technologyreview.com/feed/"),
    ("Semiconductor Engineering", "해외", "https://semiengineering.com/feed/"),
    ("Electrek", "해외", "https://electrek.co/feed/"),
    ("Supply Chain Dive", "해외", "https://www.supplychaindive.com/feeds/news/"),
    ("Retail Dive", "해외", "https://www.retaildive.com/feeds/news/"),
    ("BioPharma Dive", "해외", "https://www.biopharmadive.com/feeds/news/"),
    ("Utility Dive", "해외", "https://www.utilitydive.com/feeds/news/"),
    ("Manufacturing Dive", "해외", "https://www.manufacturingdive.com/feeds/news/"),
    ("CIO Dive", "해외", "https://www.ciodive.com/feeds/news/"),
    ("Payments Dive", "해외", "https://www.paymentsdive.com/feeds/news/"),
    ("Fierce Biotech", "해외", "https://www.fiercebiotech.com/rss/xml"),
    ("DatacenterDynamics", "해외", "https://www.datacenterdynamics.com/en/rss/"),
    ("Stratechery", "해외", "https://stratechery.com/feed/"),
    ("Rest of World", "해외", "https://restofworld.org/feed/latest"),
]

CATEGORIES = ["수요", "상용화", "사업모델", "생산성", "경쟁·공급망", "제도"]
INDUSTRIES = [
    "반도체", "AI·소프트웨어", "전자·디스플레이", "통신·인프라", "자동차·모빌리티", "배터리·에너지",
    "바이오·헬스케어", "소비재·유통", "금융·핀테크", "산업재·제조", "소재·화학", "기타",
]

# 주가·시황 중심 기사 (제목 기준)
STOCK_TITLE = re.compile(
    r"특징주|주가|상한가|하한가|목표가|목표주가|급등|급락|신고가|코스피|코스닥|증시|시황|마감|시총|52주|공모주|청약|투자의견|"
    r"매수 의견|ETF|레버리지|외국인 순매수|\bshares? (?:rose|fell|jump|surge|slide|drop)|\bstocks? (?:rose|fell|jump|surge|slide|drop)|"
    r"Nasdaq|S&P 500|Dow Jones|price target|earnings call",
    re.I,
)
# 홍보·행사·인사 기사
NOISE_TITLE = re.compile(r"\[인사\]|\[부고\]|\[포토\]|\[게시판\]|\[알림\]|웨비나|webinar|sponsored|\bpodcast\b|\bdeal(?:s)? of the day\b", re.I)

# Gemini 키가 없을 때 쓰는 키워드 규칙 (유형별)
KEYWORDS = {
    "수요": r"수요|주문|구매|대체|소비자|고객사|사용처|채택|demand|orders|adoption|customers? (?:switch|shift)|replac",
    "상용화": r"상용화|양산|도입|공급 계약|수주|첫 고객|유료|출시|납품|commerciali|mass production|deploy|rollout|first customer|contract|signed",
    "사업모델": r"구독|과금|요금제|수수료|유통|직판|플랫폼화|수익원|라이선스|subscription|pricing|licens|revenue model|marketplace|direct-to",
    "생산성": r"원가|수율|공정|자동화|생산성|인력|효율|리드타임|cost per|yield|automation|productivity|efficien|throughput",
    "경쟁·공급망": r"내재화|공급망|공급처|점유율|진입|국산화|독점|탈중국|공급사|supply chain|supplier|in-house|market share|entrant|vertical integration|sourcing",
    "제도": r"규제|법안|정책|표준|인증|허가|보조금|관세|가이드라인|regulat|standard|tariff|subsid|approval|FDA|rule",
}

SYSTEM = f"""너는 산업 애널리스트다. 기사 목록을 보고, 각 기사가 '산업에서 기술·수요·경쟁구도·돈 버는 방식이 어떻게 바뀌고 있는가'를 보여 주는지 판단한다.
주가가 얼마나 움직였는지는 판단 기준이 아니다.

변화 유형(category)은 다음 중 하나:
- 수요: 고객의 구매 행동, 제품 대체, 새로운 사용처
- 상용화: 기술의 실제 도입, 유료 고객 확보, 양산·현장 적용
- 사업모델: 과금 방식, 유통 구조, 수익원 변화
- 생산성: 원가, 생산 시간, 인력 투입, 공정 효율 변화
- 경쟁·공급망: 신규 진입, 공급처 교체, 내재화, 시장 지배력 변화
- 제도: 사업화에 영향을 주는 규제, 정책, 기술 표준
- 없음: 위 어디에도 해당하지 않음

점수(score):
3 = 구체적 사실(고객·계약·수치·도입 사례·규정 내용)로 산업 구조 변화를 보여 줌
2 = 변화의 신호지만 구체성이 약함
1 = 일반 동향, 전망, 칼럼, 기업 홍보성 발표
0 = 주가·시황·실적 숫자 나열, 인사·행사·사건사고·정치, 산업과 무관

산업(industry)은 다음 중 하나: {", ".join(INDUSTRIES)}
what: 무엇이 바뀌었는지 한국어 한 문장(70자 안). 주가 이야기는 넣지 말 것.
title_ko: 제목의 한국어 번역 (한국어 기사는 원제목 그대로).
companies: 기사의 핵심 회사 이름 (최대 3개, 한국어 표기).
같은 회사만 반복되지 않도록, 대기업 소식이라도 구조 변화가 없으면 낮게 준다."""

SCHEMA = {
    "type": "ARRAY",
    "items": {
        "type": "OBJECT",
        "properties": {
            "i": {"type": "INTEGER"},
            "category": {"type": "STRING", "enum": CATEGORIES + ["없음"]},
            "industry": {"type": "STRING", "enum": INDUSTRIES},
            "score": {"type": "INTEGER"},
            "what": {"type": "STRING"},
            "title_ko": {"type": "STRING"},
            "companies": {"type": "ARRAY", "items": {"type": "STRING"}},
        },
        "required": ["i", "category", "industry", "score", "what", "title_ko", "companies"],
    },
}
MODELS = [os.environ.get("GEMINI_MODEL") or "gemini-flash-latest", "gemini-flash-lite-latest"]
BATCH = 30


def _clean(s: str | None, limit: int = 400) -> str:
    s = html.unescape(re.sub(r"<[^>]+>", " ", s or ""))
    return re.sub(r"\s+", " ", s).strip()[:limit]


def _date(s: str) -> dt.datetime | None:
    s = (s or "").strip()
    if not s:
        return None
    try:
        d = email.utils.parsedate_to_datetime(s)
    except (TypeError, ValueError):
        try:
            d = dt.datetime.fromisoformat(s.replace("Z", "+00:00").replace(" ", "T", 1))
        except ValueError:
            return None
    if d.tzinfo is None:  # 국내 매체는 시간대 없이 한국 시각을 적음
        d = d.replace(tzinfo=dt.timezone(dt.timedelta(hours=9)))
    return d.astimezone(dt.timezone.utc)


def _parse(source: str, region: str, content: bytes) -> list[dict]:
    root = ET.fromstring(content)
    atom = "{http://www.w3.org/2005/Atom}"
    out = []
    for e in root.findall(".//item") or root.findall(f".//{atom}entry"):
        def text(*tags):
            for t in tags:
                x = e.find(t)
                if x is not None and (x.text or "").strip():
                    return x.text.strip()
            return ""
        link = text("link")
        if not link:
            x = e.find(f"{atom}link")
            link = x.get("href", "") if x is not None else ""
        title = _clean(text("title", f"{atom}title"), 300)
        if not title or not link.startswith("http"):
            continue
        out.append({
            "id": hashlib.sha1(link.encode()).hexdigest()[:20],
            "url": link,
            "title": title,
            "summary": _clean(text("description", f"{atom}summary", f"{atom}content")),
            "source": source,
            "region": region,
            "published_at": _date(text("pubDate", f"{atom}updated", f"{atom}published", "{http://purl.org/dc/elements/1.1/}date")),
        })
    return out


def fetch_all() -> list[dict]:
    def one(feed):
        source, region, url = feed
        try:
            r = requests.get(url, headers=UA, timeout=20)
            r.raise_for_status()
            return _parse(source, region, r.content)
        except Exception as e:  # 매체 하나가 막혀도 나머지는 진행
            print(f"[클리핑] {source} 실패: {e}")
            return []

    since = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=LOOKBACK_DAYS)
    seen, items = set(), []
    with ThreadPoolExecutor(8) as ex:
        for rows in ex.map(one, FEEDS):
            for r in rows:
                if r["id"] in seen or (r["published_at"] and r["published_at"] < since):
                    continue
                seen.add(r["id"])
                items.append(r)
    return items


def rule_classify(item: dict) -> dict:
    """키워드 규칙: 제목·요약에서 가장 많이 맞은 유형. 맞은 게 없으면 '없음'"""
    text = f"{item['title']} {item['summary']}"
    hits = {c: len(re.findall(p, text, re.I)) for c, p in KEYWORDS.items()}
    best = max(hits, key=hits.get)
    # 규칙은 거칠어서, 제목에 신호가 있고 본문까지 합쳐 두 번 넘게 맞을 때만 고름
    ok = re.search(KEYWORDS[best], item["title"], re.I) is not None and sum(hits.values()) >= 2
    first = re.split(r"(?<=[.다])\s", item["summary"])[0][:120] if item["summary"] else ""
    return {"category": best if ok else "없음", "industry": "기타", "score": 2 if ok else 0, "what": first, "title_ko": item["title"], "companies": [], "model": "rule"}


def _gemini(key: str, items: list[dict]) -> tuple[list[dict], str]:
    lines = [
        json.dumps({"i": i, "source": it["source"], "title": it["title"], "summary": it["summary"][:300]}, ensure_ascii=False)
        for i, it in enumerate(items)
    ]
    body = {
        "systemInstruction": {"parts": [{"text": SYSTEM}]},
        "contents": [{"role": "user", "parts": [{"text": "기사 목록 (한 줄에 하나):\n" + "\n".join(lines)}]}],
        "generationConfig": {"responseMimeType": "application/json", "responseSchema": SCHEMA, "temperature": 0.2},
    }
    last = None
    for model in MODELS:
        for wait in (0, 20):
            time.sleep(wait)
            r = requests.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                params={"key": key}, json=body, timeout=120,
            )
            if r.status_code == 503:  # 붐빔: 같은 모델로 한 번 더
                last = f"{model} 503"
                continue
            if r.status_code == 429:  # 한도 초과: 다음 모델
                last = f"{model} 429"
                break
            r.raise_for_status()
            data = r.json()
            text = data["candidates"][0]["content"]["parts"][0]["text"]
            return json.loads(text), data.get("modelVersion", model)
    raise RuntimeError(f"Gemini 실패: {last}")


def classify(items: list[dict]) -> None:
    key = os.environ.get("GEMINI_API_KEY")
    for it in items:
        if STOCK_TITLE.search(it["title"]) or NOISE_TITLE.search(it["title"]):
            it.update(category="없음", industry="기타", score=0, what=None, title_ko=it["title"], companies=[], model="filter")
    todo = [it for it in items if "model" not in it]
    if not key:
        print("GEMINI_API_KEY 없음 → 키워드 규칙으로 분류")
    for i in range(0, len(todo), BATCH):
        chunk = todo[i : i + BATCH]
        if key:
            try:
                res, model = _gemini(key, chunk)
                for r in res:
                    if 0 <= r.get("i", -1) < len(chunk):
                        chunk[r["i"]].update(
                            category=r["category"], industry=r["industry"], score=max(0, min(3, int(r["score"]))),
                            what=(r.get("what") or "").strip()[:200] or None, title_ko=(r.get("title_ko") or "").strip()[:300] or None,
                            companies=[c.strip() for c in r.get("companies", []) if c.strip()][:3], model=model,
                        )
                time.sleep(6)  # 무료 한도(분당 요청 수) 안쪽으로
            except Exception as e:
                print(f"[클리핑] Gemini 실패, 이 묶음은 규칙으로: {e}")
        for it in chunk:
            if "model" not in it:
                it.update(rule_classify(it))


def collect() -> None:
    items = fetch_all()
    done = set()
    if db.URL and items:
        since = (dt.date.today() - dt.timedelta(days=LOOKBACK_DAYS + 2)).isoformat()
        done = {r["id"] for r in db.select("news_clips", f"select=id&collected_at=gte.{since}&limit=20000")}
    new = [it for it in items if it["id"] not in done]
    classify(new)
    rows = []
    for it in new:
        it["selected"] = it["category"] in CATEGORIES and it["score"] >= 2
        it["published_at"] = it["published_at"].isoformat() if it["published_at"] else None
        rows.append(it)
    db.upsert("news_clips", rows)
    picked = [r for r in rows if r["selected"]]
    by_cat = {c: sum(r["category"] == c for r in picked) for c in CATEGORIES}
    print(f"산업 클리핑: 새 기사 {len(rows)}건 중 {len(picked)}건 선별 {by_cat}")
    db.delete("news_clips", f"collected_at=lt.{(dt.date.today() - dt.timedelta(days=KEEP_DAYS)).isoformat()}")
