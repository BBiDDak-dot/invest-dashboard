import type { Financial } from "@/lib/db";
import { moneyUnit, ttm } from "@/lib/finance";
import { LineChart } from "./LineChart";

// 4분기 누적(TTM) 매출·영업이익. 단위가 달라 한 축에 겹치지 않고 두 그래프로 나눔.
export function TtmCharts({ fin, height = 180 }: { fin: Financial[]; height?: number }) {
  const points = ttm(fin);
  if (points.length < 2) return <p className="text-sm text-zinc-500">재무 데이터가 아직 부족함 (수집 후 표시됨).</p>;
  const unit = moneyUnit(fin[0]?.currency);
  const labels = points.map((p) => p.period);
  const charts = [
    { title: "매출액 (4분기 누적)", values: points.map((p) => (p.revenue == null ? null : p.revenue / unit.div)) },
    { title: "영업이익 (4분기 누적)", values: points.map((p) => (p.operatingIncome == null ? null : p.operatingIncome / unit.div)) },
  ];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {charts.map((c) => (
        <div key={c.title}>
          <div className="mb-1 text-xs text-zinc-500">
            {c.title} · {unit.label}
          </div>
          <LineChart labels={labels} series={[{ name: c.title, color: "var(--series-1)", values: c.values }]} height={height} decimals={0} />
        </div>
      ))}
    </div>
  );
}
