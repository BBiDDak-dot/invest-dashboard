import { CapexCards, OpenRouterCards, TsmcCard } from "@/components/AiCycle";
import { Card } from "@/components/Card";
import { SetupNotice } from "@/components/SetupNotice";
import { getAi } from "@/lib/queries";

export default async function AiPage() {
  const rows = await getAi();
  return (
    <>
      <SetupNotice />
      <Card title="AI 수요: OpenRouter 토큰 사용량">
        <OpenRouterCards rows={rows} />
        <p className="mt-3 text-xs leading-relaxed text-zinc-400">
          여러 AI 모델을 한 API로 쓰게 해 주는 중개 서비스 OpenRouter의 공개 트래픽(상위 50개 모델+기타)을 주 단위로 합친 값. 전체 AI 시장이 아니라 주로 개발자·코딩 도구 쪽
          수요를 보여주는 표본이고, 토큰 수는 모델마다 토크나이저가 달라 개발사 간 비교는 대략적임. 2025-01부터. Source: OpenRouter (openrouter.ai/rankings), CC BY 4.0.
        </p>
      </Card>
      <Card title="AI 투자: 빅테크 설비투자(CAPEX)">
        <CapexCards rows={rows} />
        <p className="mt-3 text-xs leading-relaxed text-zinc-400">
          마이크로소프트·알파벳·아마존·메타·오라클의 현금흐름표 &quot;유형자산 취득&quot;(SEC XBRL). 금융리스로 들여온 서버·데이터센터는 빠져 있어 회사 발표 CAPEX보다 작을 수 있음.
          회계연도가 달라(마소 6월, 오라클 5월 결산) 분기말이 속한 달력 분기로 묶음. YoY는 4분기 전 대비.
        </p>
      </Card>
      <Card title="AI 반도체: TSMC 월매출">
        <TsmcCard rows={rows} />
        <p className="mt-3 text-xs leading-relaxed text-zinc-400">
          매달 10일 전후 대만 공시(MOPS)로 나오는 TSMC 월매출. 엔비디아·브로드컴 등 AI 칩 생산이 몰려 있어 AI 반도체 수요를 가장 빨리 보여주는 월간 지표.
        </p>
      </Card>
    </>
  );
}
