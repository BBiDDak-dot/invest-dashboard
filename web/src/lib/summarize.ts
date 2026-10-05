import "server-only";
import { ApiError, GoogleGenAI, type Part } from "@google/genai";
import type { WatchItem } from "./db";

// 무료 한도가 넉넉한 Gemini API(Google AI Studio 키) 사용. Pro가 한도 초과·과부하면 Flash로 다시 시도함.
const MODELS = [process.env.GEMINI_MODEL || "gemini-pro-latest", "gemini-flash-latest"];

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

## 리스크·반대 논리

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
  const parts: Part[] = sources.map((s) =>
    s.youtube
      ? { fileData: { fileUri: s.youtube } }
      : { inlineData: { mimeType: "application/pdf", data: Buffer.from(s.pdf!).toString("base64") } },
  );
  parts.push({
    text: `오늘 자료 ${sources.length}건(${sources.map((s) => s.name).join(", ")})을 한 페이지로 요약해 줘.\n\n내 관심종목:\n${watchContext(watch)}`,
  });

  let lastError: unknown;
  for (const model of MODELS) {
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
      // 한도 초과(429)·과부하(503)일 때만 다음 모델로 넘어감
      if (e instanceof ApiError && (e.status === 429 || e.status === 503)) continue;
      break;
    }
  }
  if (lastError instanceof ApiError) {
    if (lastError.status === 429) throw new Error("Gemini 무료 한도 초과, 잠시 후 다시 시도");
    if (lastError.status === 400 || lastError.status === 403) throw new Error(`Gemini 요청 오류 (${lastError.status}): ${lastError.message}`);
    throw new Error(`Gemini API 오류 (${lastError.status}): ${lastError.message}`);
  }
  throw lastError;
}
