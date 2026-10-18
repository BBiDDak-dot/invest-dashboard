import "server-only";
import { ApiError, GoogleGenAI } from "@google/genai";
import type { EarningsRow, UsEarningsRow } from "./db";
import { friendly } from "./summarize";

// 실적 스크리닝 종목의 "왜 실적이 늘었나" 분석 리포트. Gemini가 구글 검색으로 실적 발표·기사·증권사 코멘트를 찾아 씀.
// Pro는 무료 한도가 작아 Flash부터 씀
const MODELS = ["gemini-flash-latest", "gemini-flash-lite-latest"];
const MODEL_WAIT_MS = [150_000];

const SYSTEM = `너는 한국 개인 투자자의 리서치 보조임. 상장사 한 곳의 최근 분기 실적이 전년 동기 대비 늘어난 이유를 구글 검색으로 조사해 한국어 마크다운 분석 리포트를 작성함.

규칙
- 문장은 "~음/~함" 체로 간결하게 씀.
- 주가·목표주가 얘기는 빼고 실적 원인만 다룸.
- 검색으로 확인한 내용만 사실로 쓰고, 추정은 "(추정)", 의견은 "(판단)"으로 표시함.
- 실적 숫자는 사용자가 준 값을 그대로 씀. 회계분기가 달력 분기와 다른 회사는 분기 마감일로 해당 실적 발표를 찾음.
- 전년의 손상차손·구조조정비 기저, 라이선스 선급금, 자산 매각 이익, 환율·세금 효과처럼 반복되지 않는 요인은 반드시 짚고 크기를 적음.

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

숫자 흐름이 한눈에 보이면 좋은 것(사업부별 매출 비교 등, 숫자 3개 이상)은 아래 JSON 한 줄을 \`\`\`chart 코드 블록에 넣어 0~2개 차트로도 보여 줌. 검색으로 확인한 숫자만, 한 차트 안에서는 단위를 통일함.
\`\`\`chart
{"title":"사업부별 매출","unit":"억원","type":"bar","labels":["A","B","C"],"series":[{"name":"전년 동기","values":[1,2,3]},{"name":"이번 분기","values":[2,3,4]}],"source":"실적 발표"}
\`\`\`
출처 목록은 따로 붙이므로 쓰지 않음.`;

export type ReportInput = { name: string; ticker: string; market: "KR" | "US"; period: string; facts: string };

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
      facts: [
        `실적 공시: ${r.title} (${r.date}, ${r.consolidated ? "연결" : "별도"}) ${r.url}`,
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
    facts: [
      `SEC 제출: ${r.form ?? "보고서"} ${r.filed ?? ""} ${r.url ?? ""}`,
      line("매출", r.revenue, r.revenue_prev_y, r.revenue_yoy, null, "백만$"),
      line("영업이익", r.op, r.op_prev_y, r.op_yoy, r.op_turn, "백만$"),
      line("순이익", r.ni, r.ni_prev_y, r.ni_yoy, r.ni_turn, "백만$"),
    ].join("\n"),
  };
}

export async function writeEarningsReport(input: ReportInput) {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY가 설정되지 않음 (Vercel 환경변수에 추가 필요)");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const prompt = `${input.market === "KR" ? "한국" : "미국"} 상장사 ${input.name}(${input.ticker})의 ${input.period} 실적이 왜 늘었는지 분석해 줘. 오늘은 ${new Date().toISOString().slice(0, 10)}임.\n\n${input.facts}`;
  const deadline = Date.now() + 280_000; // 서버 함수 제한(300초) 안에
  let lastError: unknown;
  for (const [mi, model] of MODELS.entries()) {
    const left = deadline - Date.now();
    if (left < 20_000) break;
    try {
      const res = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { systemInstruction: SYSTEM, tools: [{ googleSearch: {} }], abortSignal: AbortSignal.timeout(Math.min(left, MODEL_WAIT_MS[mi] ?? left)) },
      });
      const text = res.text?.trim();
      if (!text) throw new Error(`리포트가 비어 있음 (${res.candidates?.[0]?.finishReason ?? "원인 불명"})`);
      // 검색 근거(웹 페이지)를 출처로 붙임. 같은 사이트는 한 번만
      const seen = new Set<string>();
      const sources = (res.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [])
        .map((c) => c.web)
        .filter((w): w is { uri: string; title?: string } => !!w?.uri && !seen.has(w.uri) && !!seen.add(w.uri))
        .map((w) => `- [${w.title || w.uri}](${w.uri})`);
      const body = sources.length ? `${text}\n\n## 출처 (검색)\n${sources.join("\n")}` : text;
      return { body, model: res.modelVersion ?? model };
    } catch (e) {
      lastError = e;
      if (e instanceof ApiError && [429, 500, 503].includes(e.status)) continue;
      if (e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError")) continue;
      throw friendly(e);
    }
  }
  if (lastError instanceof Error && (lastError.name === "AbortError" || lastError.name === "TimeoutError"))
    throw new Error("Gemini가 붐벼서 시간 안에 리포트를 못 씀. 잠시 뒤 다시 시도");
  throw friendly(lastError);
}
