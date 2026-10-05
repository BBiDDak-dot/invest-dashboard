import Link from "next/link";
import { Card } from "@/components/Card";
import { SetupNotice } from "@/components/SetupNotice";
import { StockSearch } from "@/components/StockSearch";
import { WatchSheet } from "@/components/WatchSheet";
import { num } from "@/lib/format";
import { getPortfolio } from "@/lib/queries";

const VIEWS = { all: "전체", held: "보유", unheld: "미보유" } as const;
type View = keyof typeof VIEWS;

export default async function WatchlistPage({ searchParams }: PageProps<"/watchlist">) {
  const v = (await searchParams).view;
  const view: View = v === "held" || v === "unheld" ? v : "all";
  const { rows, holdings, fx } = await getPortfolio();
  const byTicker = new Map(holdings.map((h) => [h.ticker, h]));
  const shown = rows.filter((r) => (view === "all" ? true : view === "held" ? byTicker.has(r.ticker) : !byTicker.has(r.ticker)));
  const counts: Record<View, number> = { all: rows.length, held: holdings.length, unheld: rows.length - holdings.length };
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
      <Card title="종목명을 누르면 편집·재무·공시를 볼 수 있음. 보유 수량을 넣으면 포트폴리오에 바로 반영됨">
        <div className="mb-3 flex gap-1 text-sm">
          {(Object.keys(VIEWS) as View[]).map((k) => (
            <Link
              key={k}
              href={k === "all" ? "/watchlist" : `/watchlist?view=${k}`}
              className={`rounded-md px-3 py-1 ${view === k ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"}`}
            >
              {VIEWS[k]} <span className="tabular-nums opacity-70">{counts[k]}</span>
            </Link>
          ))}
        </div>
        <WatchSheet rows={shown} holdings={byTicker} empty={view === "held" ? "보유 종목이 없음. 종목 편집에서 매입단가·보유주식수를 넣을 것." : undefined} />
      </Card>
    </>
  );
}
