import "server-only";
import { ApiError, GoogleGenAI, type Part } from "@google/genai";
import type { WatchItem } from "./db";

// 무료 한도가 넉넉한 Gemini API(Google AI Studio 키) 사용. Pro가 한도 초과·과부하면 Flash → Flash-Lite 순으로 다시 시도함.
const MODELS = [process.env.GEMINI_MODEL || "gemini-pro-latest", "gemini-flash-latest", "gemini-flash-lite-latest"];
// 과부하(503)는 보통 잠깐이라 모델마다 잠시 기다렸다 한 번 더 시도함
const RETRY_WAIT_MS = [0, 4000];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
