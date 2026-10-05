import { changeColor, num, pct } from "@/lib/format";
import type { WatchRow } from "@/lib/queries";
import { Empty } from "./Card";

export function WatchTable({ rows }: { rows: WatchRow[] }) {
  if (rows.length === 0) return <Empty>등록된 종목이 없음. Supabase의 watchlist 테이블에 종목을 추가하면 표시됨.</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-zinc-500">
          <tr>
            <th className="py-1 font-normal">종목</th>
            <th className="py-1 font-normal">시장</th>
            <th className="py-1 text-right font-normal">종가</th>
            <th className="py-1 text-right font-normal">등락</th>
            <th className="py-1 text-right font-normal">기준일</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.ticker} className="border-t border-zinc-100 dark:border-zinc-900">
              <td className="py-1.5">
                {r.name} <span className="text-zinc-400">{r.ticker}</span>
              </td>
              <td>{r.market}</td>
              <td className="text-right tabular-nums">{num(r.latest?.close)}</td>
              <td className={`text-right tabular-nums ${changeColor(r.latest?.change_pct)}`}>{pct(r.latest?.change_pct)}</td>
              <td className="text-right text-zinc-500">{r.latest?.date ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
