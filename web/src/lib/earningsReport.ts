import "server-only";
import { ApiError, GoogleGenAI } from "@google/genai";
import type { EarningsRow, UsEarningsRow } from "./db";
import { getArticle } from "./news";
import { friendly } from "./summarize";

// 실적 스크리닝 종목의 "왜 실적이 늘었나" 분석 리포트.
// 무료 키는 Gemini 구글 검색 기능이 막혀 있어(429), 근거 자료를 직접 모아 넘김:
// 국내는 네이버 증권 종목 뉴스 중 실적 기사, 미국은 SEC에 낸 실적 보도자료(8-K)와 분기·연간 보고서의 MD&A
// Pro는 무료 한도가 없어(429) Flash부터. 시험해 보니 Flash가 1~2분
const MODELS = ["gemini-flash-latest", "gemini-flash-lite-latest"];
const MODEL_WAIT_MS = [180_000];

const SYSTEM = `너는 한국 개인 투자자의 리서치 보조임. 상장사 한 곳의 최근 분기 실적이 전년 동기 대비 늘어난 이유를, 주어진 자료(실제 공시·기사)를 근거로 한국어 마크다운 분석 리포트로 작성함.

규칙
- 자료는 실제 최신 공시·기사임. 네가 알고 있는 것과 연도·숫자가 달라도 자료를 따름.
- 문장은 "~음/~함" 체로 간결하게 씀.
- 주가·목표주가 얘기는 빼고 실적 원인만 다룸.
- 자료에 있는 내용만 사실로 쓰고, 추정은 "(추정)", 의견은 "(판단)"으로 표시함. 근거 문장 끝에 [자료 번호]를 붙임.
- 실적 숫자는 사용자가 준 값을 그대로 씀.
- 전년의 손상차손·구조조정비 기저, 라이선스 선급금, 자산 매각 이익, 환율·세금 효과처럼 반복되지 않는 요인은 반드시 짚고 크기를 적음.
- 자료에 원인이 안 나오면 지어내지 말고 "자료에서 확인 안 됨"이라고 씀.

형식
# (회사명) (분기) 실적: (상승 이유를 한 줄로)

## 한눈에 보기
핵심 3줄 글머리표.

## 실적 숫자
항목(매출액·영업이익·당기순이익) | 이번 분기 | 전년 동기 | YoY 표. 영업이익률 변화도 한 줄.

## 왜 늘었나
사업부·제품·가격·물량·고객·환율 등 원인별 소제목(###)과 근거 숫자. 매출 증가와 이익 증가를 나눠 설명.

## 일회성·기저 요인
없으면 "확인된 일회성 요인 없음". 있으면 빼고 본 실질 성장도 적음.

## 지속 가능성
다음 분기 이후에도 이어질 요인과 꺾일 수 있는 요인 (판단).

## 리스크

숫자 흐름이 한눈에 보이면 좋은 것(사업부별 매출 비교 등, 숫자 3개 이상)은 아래 JSON 한 줄을 \`\`\`chart 코드 블록에 넣어 0~2개 차트로도 보여 줌. 자료에 있는 숫자만, 한 차트 안에서는 단위를 통일함.
\`\`\`chart
{"title":"사업부별 매출","unit":"억원","type":"bar","labels":["A","B","C"],"series":[{"name":"전년 동기","values":[1,2,3]},{"name":"이번 분기","values":[2,3,4]}],"source":"자료 1"}
\`\`\`
출처 목록은 따로 붙이므로 쓰지 않음.`;

export type ReportInput = {
  name: string;
  ticker: string;
  market: "KR" | "US";
  period: string;
  facts: string;
  date: string; // 실적 공시·제출일 (자료 찾는 기준)
  cik?: number;
  accn?: string;
};

const pct = (v: number | null, turn: string | null) => turn ?? (v == null ? "-" : `${v > 0 ? "+" : ""}${v}%`);
const line = (label: string, now: number | null, prev: number | null, yoy: number | null, turn: string | null, unit: string) =>
  `- ${label}: ${now ?? "-"}${unit} (전년 동기 ${prev ?? "-"}${unit}, YoY ${pct(yoy, turn)})`;

// 스크리닝 행 → 모델에 줄 실적 숫자
export function reportInput(t: { kr?: EarningsRow; us?: UsEarningsRow }): ReportInput {
  if (t.kr) {
    const r = t.kr;
    return {
      name: r.corp_name,
      ticker: r.stock_code ?? "",
      market: "KR",
      period: r.period ?? r.date,
      date: r.date,
      facts: [
        `실적 공시: ${r.title} (${r.date}, ${r.consolidated ? "연결" : "별도"})`,
        line("매출액", r.revenue, r.revenue_prev_y, r.revenue_yoy, r.revenue_turn, "억원"),
        line("영업이익", r.op, r.op_prev_y, r.op_yoy, r.op_turn, "억원"),
        line("당기순이익", r.ni, r.ni_prev_y, r.ni_yoy, r.ni_turn, "억원"),
      ].join("\n"),
    };
  }
  const r = t.us!;
  return {
    name: r.name,
    ticker: r.ticker,
    market: "US",
    period: `${r.period} (회계분기 마감 ${r.end_date ?? "-"})`,
    date: r.filed ?? r.end_date ?? "",
    cik: r.cik,
    accn: r.url?.match(/(\d{10}-\d{2}-\d{6})/)?.[1],
    facts: [
      `SEC 제출: ${r.form ?? "보고서"} ${r.filed ?? ""}`,
      line("매출", r.revenue, r.revenue_prev_y, r.revenue_yoy, null, "백만$"),
      line("영업이익", r.op, r.op_prev_y, r.op_yoy, r.op_turn, "백만$"),
      line("순이익", r.ni, r.ni_prev_y, r.ni_yoy, r.ni_turn, "백만$"),
    ].join("\n"),
  };
}

type Doc = { title: string; url: string; text: string };
const DAY = 86400_000;
const ymd = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00Z`).getTime();

// 국내: 네이버 뉴스 검색("회사명" N분기 실적)에서 네이버뉴스로 볼 수 있는 기사 최대 6건.
// 검색 결과엔 다른 회사·시황 기사도 섞여서, 15건을 읽고 제목에 회사명과 실적 낱말이 든 기사부터 씀.
// 먼저 공시일 직후 며칠만 찾고, 모자라면 3주로 넓힘
// 네이버 검색은 브라우저 머리글이 모자라면 403을 줌(2026-10 확인)
const BROWSER = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
  "sec-ch-ua": '"Chromium";v="140", "Not=A?Brand";v="24"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Upgrade-Insecure-Requests": "1",
};
// 자료 하나가 늦어도 전체가 멈추지 않게
const WAIT = () => AbortSignal.timeout(10_000);
const dots = (t: number) => new Date(t).toISOString().slice(0, 10).replace(/-/g, ".");

async function naverSearch(q: string, from: number, to: number) {
  const d = (t: number) => dots(t).replace(/\./g, "");
  const url = `https://search.naver.com/search.naver?where=news&sort=0&query=${encodeURIComponent(q)}&ds=${dots(from)}&de=${dots(to)}&nso=so:r,p:from${d(from)}to${d(to)}`;
  const r = await fetch(url, { headers: BROWSER, signal: WAIT(), next: { revalidate: 3600 } }).catch(() => null);
  if (!r?.ok) return [];
  return [...new Set([...(await r.text()).matchAll(/n\.news\.naver\.com\/mnews\/article\/(\d{3})\/(\d{10})/g)].map((m) => `${m[1]}-${m[2]}`))].slice(0, 15);
}

// 검색이 막히거나 비면 네이버 증권 종목 뉴스(모바일 API)에서 그 무렵 기사로 보충
async function stockNews(code: string, from: number, to: number) {
  if (!/^\d{6}$/.test(code)) return [];
  const r = await fetch(`https://m.stock.naver.com/api/news/stock/${code}?pageSize=50&page=1`, { headers: { "User-Agent": BROWSER["User-Agent"] }, signal: WAIT(), next: { revalidate: 3600 } }).catch(() => null);
  if (!r?.ok) return [];
  const pages = (await r.json().catch(() => [])) as { items?: { officeId: string; articleId: string; datetime: string }[] }[];
  return pages
    .flatMap((p) => p.items ?? [])
    .filter((it) => {
      const t = ymd(`${it.datetime.slice(0, 4)}-${it.datetime.slice(4, 6)}-${it.datetime.slice(6, 8)}`);
      return t >= from && t <= to;
    })
    .map((it) => `${it.officeId}-${it.articleId}`)
    .slice(0, 15);
}

async function krDocs(name: string, code: string, period: string, date: string): Promise<Doc[]> {
  const q = `"${name}" ${period.match(/\.([1-4])Q/)?.[1] ?? ""}분기 실적`;
  const seen = new Set<string>();
  const out: (Doc & { score: number })[] = [];
  for (const days of [4, 20]) {
    const from = ymd(date) - DAY;
    const to = Math.min(ymd(date) + days * DAY, Date.now());
    let found = await naverSearch(q, from, to);
    if (found.length === 0) found = await stockNews(code, from, to);
    const ids = found.filter((id) => !seen.has(id) && !!seen.add(id));
    const docs = await Promise.all(
      ids.map(async (id) => {
        const a = await getArticle(id).catch(() => null);
        if (!a) return null;
        const text = [a.lead, ...a.blocks.flatMap((b) => (b.kind === "text" ? [b.text] : []))].filter(Boolean).join("\n");
        // 점수: 제목에 회사명과 실적 낱말 2, 제목에 회사명 1, 본문 앞부분에만 회사명 0
        const named = a.item.title.includes(name);
        if (!named && !text.slice(0, 300).includes(name)) return null;
        const score = named ? (/실적|영업익|영업이익|매출|순이익|어닝/.test(a.item.title) ? 2 : 1) : 0;
        return { title: `${a.item.title}${a.item.source ? ` (${a.item.source})` : ""}`, url: a.item.url, text: text.slice(0, 6000), score };
      }),
    );
    out.push(...docs.filter((d): d is NonNullable<typeof d> => !!d && d.text.length > 100));
    if (out.filter((d) => d.score === 2).length >= 3) break;
  }
  return out.sort((x, y) => y.score - x.score).slice(0, 6).map((d) => ({ title: d.title, url: d.url, text: d.text }));
}

// ---------- 미국: SEC ----------
const SEC_HEADERS = { "User-Agent": "invest-dashboard admin@example.com" }; // SEC는 연락처가 담긴 UA를 요구함
async function sec(url: string) {
  const r = await fetch(url, { headers: SEC_HEADERS, signal: AbortSignal.timeout(20_000), next: { revalidate: 86400 } });
  if (!r.ok) throw new Error(`SEC ${r.status}`);
  return r;
}
const htmlText = (html: string) =>
  html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;|&rsquo;/g, "’")
    .replace(/&#\d+;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n");

type Filing = { name: string; type?: string; size?: string | number };
async function filingFiles(cik: number, accn: string): Promise<{ base: string; files: Filing[] }> {
  const base = `https://www.sec.gov/Archives/edgar/data/${cik}/${accn.replace(/-/g, "")}`;
  const j = (await (await sec(`${base}/index.json`)).json()) as { directory?: { item?: Filing[] } };
  return { base, files: j.directory?.item ?? [] };
}

async function usDocs(cik: number, accn: string | undefined, date: string): Promise<Doc[]> {
  const docs: Doc[] = [];
  // 실적 보도자료: 같은 무렵 낸 8-K(2.02 실적 발표)의 첨부 99
  try {
    const sub = (await (await sec(`https://data.sec.gov/submissions/CIK${String(cik).padStart(10, "0")}.json`)).json()) as {
      filings: { recent: { form: string[]; filingDate: string[]; accessionNumber: string[]; items: string[] } };
    };
    const rc = sub.filings.recent;
    const target = ymd(date);
    let best = -1;
    for (let i = 0; i < rc.form.length; i++) {
      if (rc.form[i] !== "8-K" || !rc.items[i]?.includes("2.02")) continue;
      const d = ymd(rc.filingDate[i]);
      if (d < target - 45 * DAY || d > target + 3 * DAY) continue;
      if (best < 0 || Math.abs(d - target) < Math.abs(ymd(rc.filingDate[best]) - target)) best = i;
    }
    if (best >= 0) {
      const { base, files } = await filingFiles(cik, rc.accessionNumber[best]);
      const ex = files.find((f) => /ex-?99.*\.htm/i.test(f.name)) ?? files.find((f) => /press|release|earn/i.test(f.name) && f.name.endsWith(".htm"));
      if (ex) docs.push({ title: `실적 보도자료 (8-K, ${rc.filingDate[best]})`, url: `${base}/${ex.name}`, text: htmlText(await (await sec(`${base}/${ex.name}`)).text()).slice(0, 40_000) });
    }
  } catch {
    // 보도자료를 못 찾으면 보고서만으로
  }
  // 분기·연간 보고서의 MD&A (경영진의 실적 설명)
  if (accn) {
    try {
      const { base, files } = await filingFiles(cik, accn);
      const main = files
        .filter((f) => f.name.endsWith(".htm") && !/ex|index/i.test(f.name))
        .sort((a, b) => Number(b.size ?? 0) - Number(a.size ?? 0))[0];
      if (main) {
        const text = htmlText(await (await sec(`${base}/${main.name}`)).text());
        // 목차의 제목 말고 본문 시작: 제목 뒤 2천 자 안에 다음 항목(Item 3·7A) 제목이 없는 곳
        const at = [...text.matchAll(/management[’']s discussion and analysis/gi)]
          .map((m) => m.index!)
          .find((i) => !/quantitative and qualitative/i.test(text.slice(i, i + 2000)));
        if (at != null) docs.push({ title: `보고서 MD&A (${main.name})`, url: `${base}/${main.name}`, text: text.slice(at, at + 40_000) });
      }
    } catch {
      // 무시
    }
  }
  return docs;
}

export async function writeEarningsReport(input: ReportInput) {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY가 설정되지 않음 (Vercel 환경변수에 추가 필요)");
  const docs = input.market === "KR" ? await krDocs(input.name, input.ticker, input.period, input.date) : await usDocs(input.cik!, input.accn, input.date);
  if (docs.length === 0)
    throw new Error(input.market === "KR" ? "공시일 앞뒤로 이 종목의 실적 기사를 찾지 못함" : "SEC에서 실적 보도자료·보고서를 찾지 못함");

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const prompt = [
    `${input.market === "KR" ? "한국" : "미국"} 상장사 ${input.name}(${input.ticker})의 ${input.period} 실적이 왜 늘었는지 분석해 줘. 오늘은 ${new Date().toISOString().slice(0, 10)}임.`,
    input.facts,
    ...docs.map((d, i) => `[자료 ${i + 1}] ${d.title}\n${d.text}`),
  ].join("\n\n");
  const sources = `\n\n## 자료\n${docs.map((d, i) => `${i + 1}. [${d.title}](${d.url})`).join("\n")}`;

  const deadline = Date.now() + 270_000; // 서버 함수 제한(300초) 안에
  let lastError: unknown;
  for (const [mi, model] of MODELS.entries()) {
    const left = deadline - Date.now();
    if (left < 20_000) break;
    try {
      const res = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { systemInstruction: SYSTEM, abortSignal: AbortSignal.timeout(Math.min(left, MODEL_WAIT_MS[mi] ?? left)) },
      });
      const text = res.text?.trim();
      if (!text) throw new Error(`리포트가 비어 있음 (${res.candidates?.[0]?.finishReason ?? "원인 불명"})`);
      return { body: text + sources, model: res.modelVersion ?? model };
    } catch (e) {
      lastError = e;
      // 한도 초과·과부하·시간 초과는 다음 모델로
      if (e instanceof ApiError && [429, 500, 503].includes(e.status)) continue;
      if (e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError")) continue;
      throw friendly(e);
    }
  }
  if (lastError instanceof Error && (lastError.name === "AbortError" || lastError.name === "TimeoutError"))
    throw new Error("Gemini가 붐벼서 시간 안에 리포트를 못 씀. 잠시 뒤 다시 시도");
  throw friendly(lastError);
}
