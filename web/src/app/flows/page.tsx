import Link from "next/link";
import { Card } from "@/components/Card";
import { LineChart } from "@/components/LineChart";
import { SetupNotice } from "@/components/SetupNotice";
import type { MarketFlow } from "@/lib/db";
import { changeColor, num } from "@/lib/format";
import { getFlows } from "@/lib/queries";

const RANGES = { "1m": ["1개월", 31], "3m": ["3개월", 92], "6m": ["6개월", 183], "1y": ["1년", 365] } as const;
type Range = keyof typeof RANGES;

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

export default async function FlowsPage({ searchParams }: PageProps<"/flows">) {
  const r = (await searchParams).range;
  const range: Range = typeof r === "string" && r in RANGES ? (r as Range) : "6m";
  const days = RANGES[range][1];
  const [kospi, kosdaq] = await Promise.all([getFlows("KOSPI", days), getFlows("KOSDAQ", days)]);
  return (
    <>
      <SetupNotice />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">수급</h1>
        <div className="flex gap-1 text-sm">
          {(Object.keys(RANGES) as Range[]).map((k) => (
            <Link
              key={k}
              href={`/flows?range=${k}`}
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
    </>
  );
}
