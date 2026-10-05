import { num } from "@/lib/format";
import { isFearGreed, type MacroRow } from "@/lib/queries";
import { Empty } from "./Card";
import { LineChart } from "./LineChart";

// 투자 지표: 지표마다 축이 있는 큰 선 그래프, 2열 배치
export function MacroGrid({ rows }: { rows: MacroRow[] }) {
  if (rows.length === 0) return <Empty>수집된 지표가 없음. 수집기를 한 번 실행하면 표시됨.</Empty>;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {rows.map((s) => {
        const last = s.history.at(-1);
        const first = s.history[0];
        return (
          <div key={s.series_id} className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-sm font-medium">{s.name}</div>
              <div className="text-xs text-zinc-500">{last?.date}</div>
            </div>
            <div className="mb-2 text-xl font-semibold tabular-nums">
              {num(last?.value)} <span className="text-xs font-normal text-zinc-500">{s.unit}</span>
              {first && last && (
                <span className="ml-2 text-xs font-normal text-zinc-500">
                  {first.date.slice(0, 7)} {num(first.value)}
                </span>
              )}
            </div>
            <LineChart
              labels={s.history.map((h) => h.date)}
              series={[{ name: s.name, color: "var(--series-1)", values: s.history.map((h) => h.value) }]}
              height={240}
              decimals={2}
              domain={isFearGreed(s.series_id) ? [0, 100] : undefined}
            />
          </div>
        );
      })}
    </div>
  );
}
