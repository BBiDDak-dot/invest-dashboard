import { Card } from "@/components/Card";
import { MacroGrid } from "@/components/MacroGrid";
import { OilCurve } from "@/components/OilCurve";
import { SetupNotice } from "@/components/SetupNotice";
import { getMacro, isCurve, isOil, isShip } from "@/lib/queries";

export default async function EnergyPage() {
  const rows = await getMacro();
  return (
    <>
      <SetupNotice />
      <Card title="원유·석유제품 가격 (최근 3년)">
        <MacroGrid rows={rows.filter((r) => isOil(r.series_id))} />
        <p className="mt-3 text-xs text-zinc-400">
          WTI·브렌트·휘발유(RBOB)·경유(ULSD)는 선물 근월물 일별 종가, 항공유는 EIA 미 걸프만 현물가(1주 정도 늦게 올라옴). 1배럴 = 42갤런.
        </p>
      </Card>
      <Card title="해운 운임 지수 (최근 3년)">
        <MacroGrid rows={rows.filter((r) => isShip(r.series_id))} />
        <p className="mt-3 text-xs text-zinc-400">
          BDI·BCI·BDTI·BCTI는 발틱거래소 일별 지수(동방재부 경유), SCFI·CCFI는 상하이해운거래소 주간 지수(매주 금요일). BDI는 철광석·석탄·곡물 같은 벌크선,
          BCI는 그중 가장 큰 케이프사이즈선(주로 철광석), SCFI는 상하이발 컨테이너 현물 운임, CCFI는 중국발 계약 운임까지 포함해 SCFI보다 느리게 움직임.
          신조선가 지수(Clarksons)는 유료라 넣지 못함.
        </p>
      </Card>
      <Card title="유가 선물 곡선 (콘탱고·백워데이션)">
        <OilCurve rows={rows.filter((r) => isCurve(r.series_id))} />
      </Card>
    </>
  );
}
