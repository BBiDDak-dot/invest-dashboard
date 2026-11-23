import { Card } from "@/components/Card";
import { MacroGrid } from "@/components/MacroGrid";
import { SetupNotice } from "@/components/SetupNotice";
import { ValuationNote } from "@/components/ValuationNote";
import { getMacro, isEconomic, isValuation } from "@/lib/queries";

export default async function MacroPage() {
  const rows = await getMacro();
  return (
    <>
      <SetupNotice />
      <Card title="경제 지표 (최근 3년)">
        <MacroGrid rows={rows.filter((r) => isEconomic(r.series_id))} />
      </Card>
      <Card title="지수 밸류에이션 (12M Fwd)">
        <MacroGrid rows={rows.filter((r) => isValuation(r.series_id))} />
        <ValuationNote />
      </Card>
    </>
  );
}
