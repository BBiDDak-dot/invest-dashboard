import Link from "next/link";
import { changeColor, num, pct } from "@/lib/format";
import type { WatchRow } from "@/lib/queries";
import { Empty } from "./Card";
import { Sparkline } from "./Sparkline";

const th = "py-1.5 pr-3 font-normal whitespace-nowrap";
const td = "py-2 pr-3 tabular-nums whitespace-nowrap";

// 요약 화면: 관심종목 중 별표(톱픽) 종목만
export function TopPicks({ rows }: { rows: WatchRow[] }) {
  if (rows.length === 0)
    return (
      <Empty>
        톱픽이 없음.{" "}
        <Link href="/watchlist" className="underline">
          관심종목
        </Link>
        에서 종목 앞의 ☆를 눌러 지정할 것.
      </Empty>
    );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-zinc-500">
          <tr className="border-b border-zinc-200 dark:border-zinc-800">
            <th className={th}>종목</th>
            <th className={th}>섹터</th>
            <th className={`${th} text-right`}>현재가</th>
            <th className={`${th} text-right`}>등락</th>
            <th className={`${th} text-right`}>1년 목표주가</th>
            <th className={`${th} text-right`}>상승여력</th>
            <th className={th}>1년 차트</th>
            <th className={th}>매도 시그널</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.ticker} className="border-b border-zinc-100 dark:border-zinc-900">
              <td className="py-2 pr-3 whitespace-nowrap">
                <Link href={`/stocks/${encodeURIComponent(r.ticker)}`} className="font-medium hover:underline">
                  {r.name}
                </Link>{" "}
                <span className="text-xs text-zinc-400">{r.ticker}</span>
              </td>
              <td className="py-2 pr-3 whitespace-nowrap text-zinc-600 dark:text-zinc-400">{r.sector ?? "-"}</td>
              <td className={`${td} text-right`}>{num(r.latest?.close)}</td>
              <td className={`${td} text-right ${changeColor(r.latest?.change_pct)}`}>{pct(r.latest?.change_pct)}</td>
              <td className={`${td} text-right`}>{num(r.target_price)}</td>
              <td className={`${td} text-right font-medium ${changeColor(r.upside)}`}>{pct(r.upside)}</td>
              <td className="py-2 pr-3 text-zinc-500">
                <Sparkline values={r.history} width={100} height={28} />
              </td>
              <td className="max-w-64 py-2 text-xs text-zinc-600 dark:text-zinc-400">
                <span className="line-clamp-2">{r.sell_signal ?? "-"}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
