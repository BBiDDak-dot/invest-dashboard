import Link from "next/link";
import { Card } from "@/components/Card";
import { SetupNotice } from "@/components/SetupNotice";
import { StockSearch } from "@/components/StockSearch";
import { WatchSheet } from "@/components/WatchSheet";
import { num } from "@/lib/format";
import { getPortfolio } from "@/lib/queries";

const VIEWS = { all: "전체", held: "보유", unheld: "미보유" } as const;
type View = keyof typeof VIEWS;
type Opts = { view: View; star: boolean; group: boolean };

function href(o: Opts) {
  const q = new URLSearchParams();
  if (o.view !== "all") q.set("view", o.view);
  if (o.star) q.set("star", "1");
  if (o.group) q.set("group", "sector");
  const s = q.toString();
  return s ? `/watchlist?${s}` : "/watchlist";
}

const pill = (on: boolean) =>
  `rounded-md px-3 py-1 ${on ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"}`;

export default async function WatchlistPage({ searchParams }: PageProps<"/watchlist">) {
  const sp = await searchParams;
  const opts: Opts = {
    view: sp.view === "held" || sp.view === "unheld" ? sp.view : "all",
    star: sp.star === "1",
    group: sp.group === "sector",
  };
  const { rows, holdings, fx } = await getPortfolio();
  const byTicker = new Map(holdings.map((h) => [h.ticker, h]));
  const inView = (t: string, v: View) => (v === "all" ? true : v === "held" ? byTicker.has(t) : !byTicker.has(t));
  const base = opts.star ? rows.filter((r) => r.starred) : rows;
  const shown = base.filter((r) => inView(r.ticker, opts.view));
  const count = (v: View) => base.filter((r) => inView(r.ticker, v)).length;
  const starCount = rows.filter((r) => r.starred).length;
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
      <Card title="칸을 누르면 바로 편집됨. ☆를 누르면 톱픽으로 지정. 보유 수량을 넣으면 포트폴리오에 반영됨">
        <div className="mb-3 flex flex-wrap items-center gap-1 text-sm">
          {(Object.keys(VIEWS) as View[]).map((k) => (
            <Link key={k} href={href({ ...opts, view: k })} className={pill(opts.view === k)}>
              {VIEWS[k]} <span className="tabular-nums opacity-70">{count(k)}</span>
            </Link>
          ))}
          <span className="mx-2 h-4 w-px bg-zinc-200 dark:bg-zinc-800" />
          <Link href={href({ ...opts, star: !opts.star })} className={pill(opts.star)}>
            ★ 톱픽 <span className="tabular-nums opacity-70">{starCount}</span>
          </Link>
          <Link href={href({ ...opts, group: !opts.group })} className={pill(opts.group)}>
            섹터별 묶기
          </Link>
        </div>
        <WatchSheet
          rows={shown}
          holdings={byTicker}
          groupBySector={opts.group}
          empty={
            opts.star && starCount === 0
              ? "톱픽이 없음. 전체 보기에서 종목 앞의 ☆를 눌러 지정할 것."
              : opts.view === "held"
                ? "보유 종목이 없음. 종목 편집에서 매입단가·보유주식수를 넣을 것."
                : rows.length === 0
                  ? undefined
                  : "조건에 맞는 종목이 없음."
          }
        />
      </Card>
    </>
  );
}
