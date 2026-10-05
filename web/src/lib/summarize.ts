import "server-only";
import { ApiError, createPartFromUri, FileState, GoogleGenAI, type Part } from "@google/genai";
import type { WatchItem } from "./db";

// 무료 한도가 넉넉한 Gemini API(Google AI Studio 키) 사용. Pro가 한도 초과·과부하면 Flash → Flash-Lite 순으로 다시 시도함.
const MODELS = [process.env.GEMINI_MODEL || "gemini-pro-latest", "gemini-flash-latest", "gemini-flash-lite-latest"];
// 과부하(503)는 보통 잠깐이라 모델마다 잠시 기다렸다 한 번 더 시도함
const RETRY_WAIT_MS = [0, 4000];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const INLINE_MAX_BYTES = 14 * 1024 * 1024; // base64로 늘어나도 요청 한도(20MB) 안에 드는 크기

const SYSTEM = `너는 한국 개인 투자자의 리서치 보조임. 사용자가 그날 받은 증권사 리포트(PDF)와 투자 유튜브 영상을 보고 한 페이지 분량의 브리핑을 한국어 마크다운으로 작성함.

규칙
- 문장은 "~음/~함" 체로 간결하게 씀.
- 자료에 있는 내용만 쓰고, 추정이나 의견을 덧붙일 때는 "(판단)"이라고 표시함.
- 숫자(목표가, 실적 전망, 밸류에이션)는 원문 그대로 옮기고 단위를 붙임.

형식
# (오늘 자료 전체를 한 줄로 요약한 제목)

## 한눈에 보기
자료별 한 줄: 출처(증권사·채널) · 종목/산업 · 투자의견 · 목표가(변경 시 이전→신규) · 핵심 한 줄. 표로 작성.

## 핵심 논리
자료별 소제목(###) 아래 근거 3~5개를 글머리표로.

## 주요 숫자
실적 전망·밸류에이션 등 중요한 숫자를 표로.
그 아래, 숫자 흐름이 한눈에 보이면 좋은 것(연도·분기별 실적 전망, 목표가 변화, 동종사 비교 등 숫자 3개 이상)은 차트 블록으로도 넣음. 0~3개, 자료에 있는 숫자만, 한 차트 안에서는 단위를 통일함. 형식은 아래 JSON 한 줄을 \`\`\`chart 코드 블록에 넣음.
\`\`\`chart
{"title":"삼성전자 연간 영업이익 전망","unit":"조원","type":"bar","labels":["2025","2026E","2027E"],"series":[{"name":"영업이익","values":[32.7,45.1,60.2]}],"source":"p.3"}
\`\`\`
- type은 항목 비교·연도별은 "bar", 6개 이상 이어지는 시계열은 "line".
- series는 최대 2개, values는 숫자만(없으면 null).
- source는 PDF면 그 숫자가 나온 쪽("p.3"), 영상이면 "영상".

## 리스크·반대 논리

## 원본 차트·표
PDF 자료일 때만: 원문에서 직접 볼 만한 핵심 차트·표를 최대 5개, "- p.쪽번호: 무엇을 보여 주는지" 형식으로. 영상만 있으면 이 절은 빼고, 본문 어디서든 PDF 숫자를 인용할 때는 (p.쪽번호)를 붙임.

## 내 관심종목 시사점
아래 관심종목과 매도 시그널을 기준으로, 자료가 영향을 주는 종목만 짚음. 매도 시그널에 해당하는 신호가 있으면 분명히 적음. 관련 없으면 "해당 없음".`;

function watchContext(items: WatchItem[]) {
  if (items.length === 0) return "(관심종목 없음)";
  return items
    .map((w) => `- ${w.name}(${w.ticker})${w.sector ? ` / ${w.sector}` : ""}${w.sell_signal ? ` / 매도 시그널: ${w.sell_signal.replace(/\s+/g, " ")}` : ""}`)
    .join("\n");
}

export type Source = { name: string; pdf?: ArrayBuffer; youtube?: string };

export async function summarizeReports(sources: Source[], watch: WatchItem[]) {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY가 설정되지 않음 (Vercel 환경변수에 추가 필요)");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  // 작은 PDF는 요청에 바로 담고, 큰 PDF(요청 한도 20MB를 base64로 넘기는 것)는 Gemini 파일 저장소에 올려서 참조함 (최대 50MB)
  const parts: Part[] = await Promise.all(
    sources.map(async (s): Promise<Part> => {
      if (s.youtube) return { fileData: { fileUri: s.youtube } };
      if (s.pdf!.byteLength <= INLINE_MAX_BYTES) {
        return { inlineData: { mimeType: "application/pdf", data: Buffer.from(s.pdf!).toString("base64") } };
      }
      let file = await ai.files.upload({ file: new Blob([s.pdf!], { type: "application/pdf" }), config: { mimeType: "application/pdf", displayName: s.name } });
      for (let i = 0; file.state === FileState.PROCESSING && i < 30; i++) {
        await sleep(2000);
        file = await ai.files.get({ name: file.name! });
      }
      if (file.state === FileState.FAILED || !file.uri) throw new Error(`${s.name}: Gemini 파일 처리 실패`);
      return createPartFromUri(file.uri, "application/pdf");
    }),
  );
  parts.push({
    text: `오늘 자료 ${sources.length}건(${sources.map((s) => s.name).join(", ")})을 한 페이지로 요약해 줘.\n\n내 관심종목:\n${watchContext(watch)}`,
  });

  let lastError: unknown;
  for (const model of MODELS) {
    for (const wait of RETRY_WAIT_MS) {
      if (wait) await sleep(wait);
      try {
        const res = await ai.models.generateContent({
          model,
          contents: [{ role: "user", parts }],
          config: { systemInstruction: SYSTEM },
        });
        const text = res.text?.trim();
        if (!text) throw new Error(`요약 결과가 비어 있음 (${res.candidates?.[0]?.finishReason ?? "원인 불명"})`);
        return { text, model: res.modelVersion ?? model };
      } catch (e) {
        lastError = e;
        // 과부하(503)는 같은 모델로 한 번 더, 한도 초과(429)는 바로 다음 모델로. 그 밖의 오류는 중단
        if (e instanceof ApiError && e.status === 503) continue;
        if (e instanceof ApiError && e.status === 429) break;
        throw friendly(e);
      }
    }
  }
  throw friendly(lastError);
}

function friendly(e: unknown): Error {
  if (e instanceof ApiError) {
    if (e.status === 429) return new Error("Gemini 무료 한도 초과, 잠시 후 다시 시도");
    if (e.status === 503) return new Error("Gemini 서버가 붐벼서 모든 모델이 거절함 (일시적). 몇 분 뒤 다시 시도");
    if (e.status === 400 || e.status === 403) return new Error(`Gemini 요청 오류 (${e.status}): ${e.message}`);
    return new Error(`Gemini API 오류 (${e.status}): ${e.message}`);
  }
  return e instanceof Error ? e : new Error(String(e));
}
