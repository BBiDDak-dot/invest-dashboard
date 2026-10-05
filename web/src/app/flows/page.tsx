import Link from "next/link";
import { Card, Empty } from "@/components/Card";
import { LineChart } from "@/components/LineChart";
import { SetupNotice } from "@/components/SetupNotice";
import type { MarketFlow, StockFlow } from "@/lib/db";
import { changeColor, num } from "@/lib/format";
import { getFlows, getStockFlows, getWatchItems } from "@/lib/queries";

const RANGES = { "1m": ["1개월", 31], "3m": ["3개월", 92], "6m": ["6개월", 183], "1y": ["1년", 365] } as const;
type Range = keyof typeof RANGES;
const TOP_DAYS = { "1": "1일", "5": "5일", "20": "20일" } as const;
type TopDays = keyof typeof TOP_DAYS;
const WHO = { f: ["외국인", "foreigner"], i: ["기관", "institution"] } as const;
type Who = keyof typeof WHO;

// 기간 시작일부터 날마다 순매수를 더한 누적값
function cumulative(rows: MarketFlow[], key: "foreigner" | "institution") {
  let sum = 0;
  return rows.map((r) => (sum += r[key] ?? 0));
}

function MarketChart({ market, rows }: { market: string; rows: MarketFlow[] }) {
  const recent = rows.slice(-5).reverse();
  return (
    <Card title={`${market} 누적 순매수 (억원)`}>
      <LineChart
        labels={rows.map((r) => r.date)}
        series={[
          { name: "외국인", color: "var(--series-1)", values: cumulative(rows, "foreigner") },
          { name: "기관", color: "var(--series-2)", values: cumulative(rows, "institution") },
        ]}
        height={240}
        decimals={0}
      />
      <table className="mt-3 w-full text-xs">
        <thead className="text-zinc-500">
          <tr>
            <th className="py-1 text-left font-normal">일별 순매수</th>
            <th className="py-1 text-right font-normal">개인</th>
            <th className="py-1 text-right font-normal">외국인</th>
            <th className="py-1 text-right font-normal">기관</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {recent.map((r) => (
            <tr key={r.date} className="border-t border-zinc-100 dark:border-zinc-900">
              <td className="py-1 text-zinc-500">{r.date}</td>
              {[r.individual, r.foreigner, r.institution].map((v, i) => (
                <td key={i} className={`py-1 text-right ${changeColor(v)}`}>
                  {num(v, 0)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      className={`rounded-md px-2.5 py-1 ${active ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"}`}
    >
      {children}
    </Link>
  );
}

type Ranked = { code: string; name: string; sum: number };

function RankList({ title, items, watch }: { title: string; items: Ranked[]; watch: Set<string> }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-xs text-zinc-500">{title}</div>
      <ol className="text-sm">
        {items.map((r, i) => (
          <li key={r.code} className="flex items-baseline gap-2 border-t border-zinc-100 py-1 dark:border-zinc-900">
            <span className="w-4 shrink-0 text-right text-xs text-zinc-400 tabular-nums">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate">
              {watch.has(r.code) ? (
                <Link href={`/stocks/${r.code}`} className="font-medium hover:underline">
                  <span className="text-amber-500">★</span> {r.name}
                </Link>
              ) : (
                r.name
              )}
            </span>
            <span className={`shrink-0 tabular-nums ${changeColor(r.sum)}`}>{num(r.sum, 0)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// 기간 동안 종목별 순매수를 더해 상위·하위 10개
function rank(rows: StockFlow[], market: string, key: "foreigner" | "institution") {
  const sums = new Map<string, Ranked>();
  for (const r of rows) {
    if (r.market !== market || r[key] == null) continue;
    const cur = sums.get(r.code) ?? { code: r.code, name: r.name, sum: 0 };
    cur.sum += r[key]!;
    sums.set(r.code, cur);
  }
  const all = [...sums.values()].sort((a, b) => b.sum - a.sum);
  return { buy: all.slice(0, 10).filter((r) => r.sum > 0), sell: all.slice(-10).reverse().filter((r) => r.sum < 0) };
}

async function TopStocks({ range, days, who }: { range: Range; days: TopDays; who: Who }) {
  const [data, watchItems] = await Promise.all([getStockFlows(Number(days)), getWatchItems()]);
  const watch = new Set(watchItems.filter((w) => w.market === "KR").map((w) => w.ticker));
  const [label, key] = WHO[who];
  const href = (d: TopDays, w: Who) => `/flows?range=${range}&top=${d}&who=${w}`;
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">
          {label} 순매수 상위 종목
          {data && (
            <span className="ml-2 text-xs font-normal text-zinc-500">
              {data.from === data.to ? data.to : `${data.from} ~ ${data.to}`} · 억원
            </span>
          )}
        </h2>
        <div className="flex flex-wrap gap-1 text-sm">
          {(Object.keys(WHO) as Who[]).map((w) => (
            <Chip key={w} href={href(days, w)} active={w === who}>
              {WHO[w][0]}
            </Chip>
          ))}
          <span className="mx-1 border-l border-zinc-200 dark:border-zinc-800" />
          {(Object.keys(TOP_DAYS) as TopDays[]).map((d) => (
            <Chip key={d} href={href(d, who)} active={d === days}>
              {TOP_DAYS[d]}
            </Chip>
          ))}
        </div>
      </div>
      {data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {(["KOSPI", "KOSDAQ"] as const).map((m) => {
            const { buy, sell } = rank(data.rows, m, key);
            return (
              <Card key={m} title={m}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <RankList title="순매수" items={buy} watch={watch} />
                  <RankList title="순매도" items={sell} watch={watch} />
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Empty>아직 종목별 수급 데이터가 없음. 다음 수집(평일 16:40) 뒤에 채워짐.</Empty>
      )}
      <p className="text-xs text-zinc-400">
        코스피 시총 상위 200·코스닥 150종목 기준. 금액은 순매수 수량 × 종가로 추정. ★는 관심종목.
      </p>
    </section>
  );
}

export default async function FlowsPage({ searchParams }: PageProps<"/flows">) {
  const sp = await searchParams;
  const pick = <T extends string>(v: unknown, keys: readonly T[], def: T): T => (typeof v === "string" && (keys as readonly string[]).includes(v) ? (v as T) : def);
  const range = pick(sp.range, Object.keys(RANGES) as Range[], "6m");
  const top = pick(sp.top, Object.keys(TOP_DAYS) as TopDays[], "5");
  const who = pick(sp.who, Object.keys(WHO) as Who[], "f");
  const days = RANGES[range][1];
  const [kospi, kosdaq] = await Promise.all([getFlows("KOSPI", days), getFlows("KOSDAQ", days)]);
  return (
    <>
      <SetupNotice />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">수급</h1>
        <div className="flex flex-wrap gap-1 text-sm">
          {(Object.keys(RANGES) as Range[]).map((k) => (
            <Link
              key={k}
              href={`/flows?range=${k}&top=${top}&who=${who}`}
              className={`rounded-md px-2.5 py-1 ${k === range ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"}`}
            >
              {RANGES[k][0]}
            </Link>
          ))}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <MarketChart market="KOSPI" rows={kospi} />
        <MarketChart market="KOSDAQ" rows={kosdaq} />
      </div>
      <TopStocks range={range} days={top} who={who} />
    </>
  );
}
