import { Card } from "@/components/Card";
import { MacroGrid } from "@/components/MacroGrid";
import { MddChart } from "@/components/MddChart";
import { SentimentNote } from "@/components/SentimentNote";
import { SetupNotice } from "@/components/SetupNotice";
import { getMacro, getMdd, isSentiment } from "@/lib/queries";

export default async function SentimentPage() {
  const [rows, mdd] = await Promise.all([getMacro(), getMdd()]);
  return (
    <>
      <SetupNotice />
      <Card title="4대 지수 고점 대비 하락률 (MDD, 최근 20년)">
        <MddChart rows={mdd} />
      </Card>
      <Card title="심리 지표 (최근 3년)">
        <MacroGrid rows={rows.filter((r) => isSentiment(r.series_id))} />
        <SentimentNote />
      </Card>
    </>
  );
}
