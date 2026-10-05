import { Card } from "@/components/Card";
import { SetupNotice } from "@/components/SetupNotice";
import { StockSearch } from "@/components/StockSearch";
import { WatchSheet } from "@/components/WatchSheet";
import { num } from "@/lib/format";
import { getFx, getWatchlist } from "@/lib/queries";

export default async function WatchlistPage() {
  const [rows, fx] = await Promise.all([getWatchlist(), getFx()]);
  return (
    <>
      <SetupNotice />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-semibold">관심종목</h1>
        <div className="text-sm text-zinc-500">
          환율 <span className="font-medium text-zinc-900 tabular-nums dark:text-zinc-100">{num(fx?.value)}</span> 원/달러
          {fx && <span className="ml-1 text-xs">({fx.date})</span>}
        </div>
      </div>
      <StockSearch />
      <Card title="종목명을 누르면 편집·재무·공시를 볼 수 있음">
        <WatchSheet rows={rows} />
      </Card>
    </>
  );
}
