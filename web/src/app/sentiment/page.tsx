import { Card } from "@/components/Card";
import { MacroGrid } from "@/components/MacroGrid";
import { SentimentNote } from "@/components/SentimentNote";
import { SetupNotice } from "@/components/SetupNotice";
import { getMacro, isSentiment } from "@/lib/queries";

export default async function SentimentPage() {
  const rows = await getMacro();
  return (
    <>
      <SetupNotice />
      <Card title="심리 지표 (최근 3년)">
        <MacroGrid rows={rows.filter((r) => isSentiment(r.series_id))} />
        <SentimentNote />
      </Card>
    </>
  );
}
