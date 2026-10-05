import type { Financial } from "@/lib/db";
import { moneyUnit, quarterRows } from "@/lib/finance";
import { changeColor, num, pct } from "@/lib/format";

// 최근 8개 분기 매출·영업이익·영업이익률·전년 동기 대비
export function QuarterTable({ fin }: { fin: Financial[] }) {
  const rows = quarterRows(fin);
  if (!rows.length) return null;
  const unit = moneyUnit(fin[0]?.currency);
  const th = "px-2 py-1.5 font-normal whitespace-nowrap text-right";
  const td = "px-2 py-1.5 text-right tabular-nums whitespace-nowrap";
  const money = (v: number | null) => (v == null ? "-" : num(v / unit.div, 0));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-zinc-500">
          <tr className="border-b border-zinc-200 dark:border-zinc-800">
            <th className={`${th} text-left`}>분기 ({unit.label})</th>
            <th className={th}>매출액</th>
            <th className={th}>YoY</th>
            <th className={th}>영업이익</th>
            <th className={th}>YoY</th>
            <th className={th}>영업이익률</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.period} className="border-b border-zinc-100 dark:border-zinc-900">
              <td className="px-2 py-1.5 tabular-nums text-zinc-500">{r.period}</td>
              <td className={td}>{money(r.revenue)}</td>
              <td className={`${td} text-xs ${changeColor(r.revenueYoy)}`}>{pct(r.revenueYoy)}</td>
              <td className={`${td} ${changeColor(r.operatingIncome && r.operatingIncome < 0 ? -1 : 0)}`}>{money(r.operatingIncome)}</td>
              <td className={`${td} text-xs ${changeColor(r.opYoy)}`}>{pct(r.opYoy)}</td>
              <td className={td}>{r.margin == null ? "-" : `${num(r.margin, 1)}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
