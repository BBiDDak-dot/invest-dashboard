import { Card } from "@/components/Card";
import { MacroGrid } from "@/components/MacroGrid";
import { SetupNotice } from "@/components/SetupNotice";
import { getMacro } from "@/lib/queries";

export default async function MacroPage() {
  const rows = await getMacro();
  return (
    <>
      <SetupNotice />
      <Card title="투자 지표 (최근 3년)">
        <MacroGrid rows={rows} />
      </Card>
    </>
  );
}
