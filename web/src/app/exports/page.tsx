import { buildExportItems, ExportSections } from "@/components/ExportCharts";
import { SetupNotice } from "@/components/SetupNotice";
import { getExports } from "@/lib/queries";

export default async function ExportsPage() {
  const items = buildExportItems(await getExports());
  return (
    <>
      <SetupNotice />
      <ExportSections items={items} />
      <p className="text-xs leading-relaxed text-zinc-400">
        관세청 수출입무역통계(HSK 10단위) 월간 확정치. 매월 15일 전후 전월분이 올라옴(빨간 막대 = 가장 최근 달). 단가는 수출 금액 ÷ 순중량이라 제품 구성(고용량·고부가 비중)이 바뀌면
        같이 움직임. 2019-01부터. 20일·10일 잠정치는 관세청이 반도체 같은 대분류로만 내서 품목별로는 없음.
      </p>
    </>
  );
}
