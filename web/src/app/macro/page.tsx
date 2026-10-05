import { Card } from "@/components/Card";
import { MacroGrid } from "@/components/MacroGrid";
import { SetupNotice } from "@/components/SetupNotice";
import { getMacro } from "@/lib/queries";

export default async function MacroPage() {
  const rows = await getMacro(36);
  return (
    <>
      <SetupNotice />
      <Card title="경제지표 (최근 36개 관측치)">
        <MacroGrid rows={rows} />
      </Card>
    </>
  );
}
