// 대표 AI 기업 ARR(연환산 매출) 시드 데이터.
// 비상장사라 정기 공시가 없어 회사 발표·보도된 값을 날짜별로 모음. 단위: 십억$.
// 갱신: 아래 points 배열에 { date, value, src, url } 한 줄 추가 → main에 커밋하면 Vercel이 다시 배포함.
//   date = 그 값이 가리키는 시점(YYYY-MM, 일 모르면 월만), value = 십억$(5억$ = 0.5)
//   src = 출처 이름, url = 출처 링크, note = (선택) 주의 사항

export type ArrPoint = { date: string; value: number; src: string; url: string; note?: string };
export type ArrCompany = { id: string; name: string; desc: string; color: string; points: ArrPoint[] };

// 십억$ → 읽기 쉬운 금액 (810억$, 4.5억$, 400만$)
export function money(v: number) {
  if (v >= 0.1) return `${(v * 10).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}억$`;
  const man = Math.round(v * 1e5);
  return man >= 1000 ? `${man / 1000}천만$` : `${man}만$`;
}

const ET_ANTHROPIC = "https://explodingtopics.com/blog/anthropic-revenue";
const CLINK_CURSOR = "https://clinkbill.com/arr-leaderboard/cursor";
const OKARA_LOVABLE = "https://okara.ai/blog/how-lovable-grew";
const sig = (slug: string) => `https://www.arr.club/signal/${slug}`;

export const AI_ARR: ArrCompany[] = [
  {
    id: "openai",
    name: "OpenAI",
    desc: "ChatGPT·API",
    color: "var(--series-1)",
    points: [
      { date: "2024-12", value: 6, src: "Reuters (CFO 발언)", url: "https://www.reuters.com/business/openai-cfo-says-annualized-revenue-crosses-20-billion-2025-2026-01-19/" },
      { date: "2025-06", value: 10, src: "CNBC", url: "https://www.cnbc.com/2025/06/09/openai-hits-10-billion-in-annualized-revenue-fueled-by-chatgpt-growth.html" },
      { date: "2025-12", value: 20, src: "Reuters (CFO 발언)", url: "https://www.reuters.com/business/openai-cfo-says-annualized-revenue-crosses-20-billion-2025-2026-01-19/" },
      { date: "2026-02", value: 25, src: "The Information", url: "https://www.theinformation.com/articles/openai-tops-25-billion-annualized-revenue-anthropic-narrows-gap" },
      { date: "2026-08", value: 40, src: "Bloomberg", url: "https://www.bloomberg.com/news/articles/2026-08-13/openai-s-revenue-run-rate-tops-40-billion-ahead-of-ipo" },
      {
        date: "2026-10",
        value: 50,
        src: "Axios",
        url: "https://www.axios.com/2026/10/08/openai-50-billion-arr-anthropic-revenue-accounting",
        note: "9월 말 Axios는 '약 700억$'로 보도했으나, 클라우드 파트너 판매분을 총액으로 잡는 Anthropic식 계산 기준이라 함. 여기선 OpenAI 자체 기준 약 500억$ 사용.",
      },
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    desc: "Claude·API",
    color: "var(--series-2)",
    points: [
      { date: "2025-01", value: 1, src: "Anthropic 시리즈 F 발표", url: "https://www.anthropic.com/news/anthropic-raises-series-f-at-usd183b-post-money-valuation" },
      { date: "2025-03", value: 2, src: "Exploding Topics 정리", url: ET_ANTHROPIC },
      { date: "2025-05", value: 3, src: "Exploding Topics 정리", url: ET_ANTHROPIC },
      { date: "2025-08", value: 5, src: "Anthropic 시리즈 F 발표", url: "https://www.anthropic.com/news/anthropic-raises-series-f-at-usd183b-post-money-valuation" },
      { date: "2025-10", value: 7, src: "Exploding Topics 정리", url: ET_ANTHROPIC },
      { date: "2025-12", value: 9, src: "Exploding Topics 정리", url: ET_ANTHROPIC },
      { date: "2026-02", value: 14, src: "Anthropic 시리즈 G 발표", url: "https://www.anthropic.com/news/anthropic-raises-30-billion-series-g-funding-380-billion-post-money-valuation" },
      { date: "2026-04", value: 30, src: "Anthropic 발표", url: "https://www.anthropic.com/news/google-broadcom-partnership-compute" },
      { date: "2026-05", value: 47, src: "Exploding Topics 정리", url: ET_ANTHROPIC },
      { date: "2026-07", value: 65, src: "CNBC", url: "https://www.cnbc.com/2026/08/17/anthropic-says-annualized-revenue-climbed-to-65-billion-in-july.html" },
      {
        date: "2026-10",
        value: 81,
        src: "S-1 수정본 (24/7 Wall St)",
        url: "https://247wallst.com/investing/2026/11/11/anthropic-says-its-revenue-run-rate-jumped-to-an-81-billion-run-rate/",
        note: "10/31 기준. 최근 28일 사용료×13 + 월 구독료×12 방식.",
      },
    ],
  },
  {
    id: "cursor",
    name: "Cursor",
    desc: "AI 코딩 에디터 (Anysphere)",
    color: "var(--series-3)",
    points: [
      { date: "2024-12", value: 0.1, src: "Sacra (Clinkbill 정리)", url: CLINK_CURSOR },
      { date: "2025-06", value: 0.5, src: "Clinkbill 정리", url: CLINK_CURSOR },
      { date: "2025-11", value: 1, src: "Clinkbill 정리 (시리즈 D 시점)", url: CLINK_CURSOR },
      { date: "2026-02", value: 2, src: "Bloomberg (Clinkbill 정리)", url: CLINK_CURSOR },
      { date: "2026-04", value: 3, src: "TechCrunch (Clinkbill 정리)", url: CLINK_CURSOR },
      { date: "2026-06", value: 4, src: "Reuters (Clinkbill 정리)", url: CLINK_CURSOR, note: "6월 SpaceX 인수 보도 이후 독자 ARR 발표가 끊길 수 있음." },
    ],
  },
  {
    id: "perplexity",
    name: "Perplexity",
    desc: "AI 검색",
    color: "var(--series-4)",
    points: [
      { date: "2024-01", value: 0.01, src: "ARR Club", url: sig("perplexity-ai-at-10m-arr") },
      { date: "2024-10", value: 0.05, src: "ARR Club", url: sig("perplexity-arr-at-50m-from-10m-6-months-ago") },
      { date: "2025-02", value: 0.08, src: "ARR Club", url: sig("perplexity-arr-hit-80m") },
      { date: "2025-03", value: 0.1, src: "ARR Club", url: sig("perplexity-revenue-hit-100m") },
      { date: "2025-08", value: 0.15, src: "ARR Club", url: sig("perplexity-arr-hits-150m") },
      { date: "2025-09", value: 0.2, src: "ARR Club", url: sig("perplexity-arr-hits-200m") },
      { date: "2026-03", value: 0.45, src: "ARR Club", url: sig("perplexity-arr-exceeds-450m-with-50-monthly-growth") },
      { date: "2026-04", value: 0.5, src: "ARR Club (FT·Reuters 보도)", url: sig("perplexity-arr-hit-500m-up-50m-in-just-one-week") },
      { date: "2026-08", value: 0.75, src: "ARR Club", url: sig("perplexity-arr-hit-750m-with-valuation-talks-at-30b") },
      { date: "2026-11", value: 1, src: "ARR Club", url: sig("perplexity-hit-1b-in-annual-run-rate-growing-4x-in-2026") },
    ],
  },
  {
    id: "lovable",
    name: "Lovable",
    desc: "바이브 코딩 (앱 자동 생성)",
    color: "#c99a06",
    points: [
      { date: "2024-12", value: 0.004, src: "Okara 정리 (회사 발표)", url: OKARA_LOVABLE },
      { date: "2025-01", value: 0.01, src: "Okara 정리 (회사 발표)", url: OKARA_LOVABLE },
      { date: "2025-05", value: 0.04, src: "Okara 정리", url: OKARA_LOVABLE },
      { date: "2025-07", value: 0.1, src: "Lovable 블로그", url: "https://lovable.dev/blog/agent" },
      { date: "2025-11", value: 0.2, src: "TechCrunch", url: "https://techcrunch.com/2026/03/11/lovable-says-it-added-100m-in-revenue-last-month-alone-with-just-146-employees/" },
      { date: "2026-01", value: 0.3, src: "CEO X 게시물", url: "https://x.com/antonosika/status/2017302005916827668" },
      { date: "2026-02", value: 0.4, src: "TechCrunch", url: "https://techcrunch.com/2026/03/11/lovable-says-it-added-100m-in-revenue-last-month-alone-with-just-146-employees/" },
      { date: "2026-06", value: 0.5, src: "Okara 정리", url: OKARA_LOVABLE },
      { date: "2026-09", value: 0.6, src: "Okara 정리 (공동창업자 발언)", url: OKARA_LOVABLE },
    ],
  },
];
