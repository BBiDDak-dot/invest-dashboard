import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Empty } from "@/components/Card";
import { LineChart } from "@/components/LineChart";
import { StockEditForm } from "@/components/StockEditForm";
import { TtmCharts } from "@/components/TtmCharts";
import { changeColor, num, pct } from "@/lib/format";
import { getDisclosures, getFinancials, getPrices, getWatchItem, ratios } from "@/lib/queries";

export default async function StockPage({ params }: PageProps<"/stocks/[ticker]">) {
  const ticker = decodeURIComponent((await params).ticker);
  const item = await getWatchItem(ticker);
  if (!item) notFound();
  const [prices, fin, disclosures] = await Promise.all([
    getPrices(ticker, 365),
    getFinancials([ticker]),
    item.market === "KR" ? getDisclosures(15, ticker) : Promise.resolve([]),
  ]);
  const last = prices.at(-1);
  const { debtRatio, reserveRatio } = ratios(fin);
  const upside = last && item.target_price ? (item.target_price / last.close - 1) * 100 : null;

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Link href="/watchlist" className="text-sm text-zinc-500 hover:underline">
          ← 관심종목
        </Link>
        <h1 className="text-lg font-semibold">{item.name}</h1>
        <span className="text-sm text-zinc-500">
          {item.ticker} · {item.market === "KR" ? "국내" : "미국"}
        </span>
        <span className="text-lg tabular-nums">{num(last?.close)}</span>
        <span className={`text-sm tabular-nums ${changeColor(last?.change_pct)}`}>{pct(last?.change_pct)}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        {[
          ["상승여력", pct(upside)],
          ["12M Fwd P/E", num(item.fwd_pe, 1)],
          ["부채비율", debtRatio == null ? "-" : `${num(debtRatio, 0)}%`],
          ["유보율", reserveRatio == null ? "-" : `${num(reserveRatio, 0)}%`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-md bg-zinc-50 p-3 dark:bg-zinc-900">
            <div className="text-xs text-zinc-500">{k}</div>
            <div className="mt-0.5 font-semibold tabular-nums">{v}</div>
          </div>
        ))}
      </div>
      <Card title="주가 (1년)">
        <LineChart
          labels={prices.map((p) => p.date)}
          series={[{ name: "종가", color: "var(--series-1)", values: prices.map((p) => p.close) }]}
          height={220}
        />
      </Card>
      <Card title="재무 추이">
        <TtmCharts fin={fin} />
      </Card>
      <Card title="편집">
        <StockEditForm item={item} />
      </Card>
      {item.market === "KR" && (
        <Card title="최근 공시">
          {disclosures.length === 0 ? (
            <Empty>공시 없음.</Empty>
          ) : (
            <ul className="space-y-1 text-sm">
              {disclosures.map((d) => (
                <li key={d.id}>
                  <span className="text-zinc-400">{d.date}</span>{" "}
                  <Link href={d.url} target="_blank" className="hover:underline">
                    {d.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}
