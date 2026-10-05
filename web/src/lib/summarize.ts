import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { WatchItem } from "./db";

export const MODEL = "claude-opus-5-5";

const SYSTEM = `너는 한국 개인 투자자의 리서치 보조임. 사용자가 그날 받은 증권사 리포트(PDF)를 읽고 한 페이지 분량의 브리핑을 한국어 마크다운으로 작성함.

규칙
- 문장은 "~음/~함" 체로 간결하게 씀.
- 리포트에 있는 내용만 쓰고, 추정이나 의견을 덧붙일 때는 "(판단)"이라고 표시함.
- 숫자(목표가, 실적 전망, 밸류에이션)는 원문 그대로 옮기고 단위를 붙임.

형식
# (오늘 리포트 전체를 한 줄로 요약한 제목)

## 한눈에 보기
리포트별 한 줄: 증권사 · 종목/산업 · 투자의견 · 목표가(변경 시 이전→신규) · 핵심 한 줄. 표로 작성.

## 핵심 논리
리포트별 소제목(###) 아래 근거 3~5개를 글머리표로.

## 주요 숫자
실적 전망·밸류에이션 등 중요한 숫자를 표로.

## 리스크·반대 논리

## 내 관심종목 시사점
아래 관심종목과 매도 시그널을 기준으로, 리포트가 영향을 주는 종목만 짚음. 매도 시그널에 해당하는 신호가 있으면 분명히 적음. 관련 없으면 "해당 없음".`;

function watchContext(items: WatchItem[]) {
  if (items.length === 0) return "(관심종목 없음)";
  return items
    .map((w) => `- ${w.name}(${w.ticker})${w.sector ? ` / ${w.sector}` : ""}${w.sell_signal ? ` / 매도 시그널: ${w.sell_signal.replace(/\s+/g, " ")}` : ""}`)
    .join("\n");
}

export async function summarizeReports(files: { name: string; data: ArrayBuffer }[], watch: WatchItem[]) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY가 설정되지 않음 (Vercel 환경변수에 추가 필요)");
  const client = new Anthropic();
  const content: Anthropic.Beta.BetaContentBlockParam[] = files.map((f) => ({
    type: "document",
    title: f.name,
    source: { type: "base64", media_type: "application/pdf", data: Buffer.from(f.data).toString("base64") },
  }));
  content.push({
    type: "text",
    text: `오늘 리포트 ${files.length}건을 한 페이지로 요약해 줘.\n\n내 관심종목:\n${watchContext(watch)}`,
  });

  try {
    // 모델이 일시적으로 과부하일 때 서버 쪽에서 다른 모델로 넘겨 처리하도록 fallbacks 사용
    const message = await client.beta.messages
      .stream({
        model: MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium" },
        system: SYSTEM,
        messages: [{ role: "user", content }],
      })
      .finalMessage();
    if (message.stop_reason === "refusal") throw new Error("Claude가 요약을 거절함");
    const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
    if (!text) throw new Error("요약 결과가 비어 있음");
    return { text, model: message.model };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new Error("Claude API 사용량 한도 초과, 잠시 후 다시 시도");
    if (e instanceof Anthropic.AuthenticationError) throw new Error("ANTHROPIC_API_KEY가 올바르지 않음");
    if (e instanceof Anthropic.APIError) throw new Error(`Claude API 오류 (${e.status}): ${e.message}`);
    throw e;
  }
}
