import { Card } from "@/components/Card";
import { MacroGrid } from "@/components/MacroGrid";
import { OilCurve } from "@/components/OilCurve";
import { SetupNotice } from "@/components/SetupNotice";
import { getMacro, isCurve, isOil } from "@/lib/queries";

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
      <Card title="유가 선물 곡선 (콘탱고·백워데이션)">
        <OilCurve rows={rows.filter((r) => isCurve(r.series_id))} />
      </Card>
    </>
  );
}
