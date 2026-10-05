import Link from "next/link";
import { Card, Empty } from "@/components/Card";
import { SetupNotice } from "@/components/SetupNotice";
import { TtmCharts } from "@/components/TtmCharts";
import { getFinancials, getWatchItems } from "@/lib/queries";

export default async function FinancialsPage() {
  const items = await getWatchItems();
  const fin = await getFinancials(items.map((i) => i.ticker));
  return (
    <>
      <SetupNotice />
      <h1 className="text-lg font-semibold">재무 추이 (4분기 누적 매출·영업이익)</h1>
      {items.length === 0 && <Empty>관심종목을 먼저 추가할 것.</Empty>}
      {items.map((i) => (
        <Card key={i.ticker} title={`${i.name} · ${i.ticker}`}>
          <TtmCharts fin={fin.filter((f) => f.ticker === i.ticker)} height={150} />
          <Link href={`/stocks/${encodeURIComponent(i.ticker)}`} className="mt-2 inline-block text-xs text-zinc-500 hover:underline">
            종목 상세 →
          </Link>
        </Card>
      ))}
    </>
  );
}
