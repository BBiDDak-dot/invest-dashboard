import { num } from "@/lib/format";
import type { MacroRow } from "@/lib/queries";
import { Empty } from "./Card";
import { Sparkline } from "./Sparkline";

export function MacroGrid({ rows }: { rows: MacroRow[] }) {
  if (rows.length === 0) return <Empty>수집된 지표가 없음. 수집기를 한 번 실행하면 표시됨.</Empty>;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((s) => {
        const last = s.history.at(-1);
        return (
          <div key={s.series_id} className="rounded-md bg-zinc-50 p-3 dark:bg-zinc-900">
            <div className="text-xs text-zinc-500">
              {s.country} · {s.name}
            </div>
            <div className="mt-1 text-lg font-semibold tabular-nums">
              {num(last?.value)} <span className="text-xs font-normal text-zinc-500">{s.unit}</span>
            </div>
            <div className="text-zinc-400">
              <Sparkline values={s.history.map((h) => h.value)} />
            </div>
            <div className="text-xs text-zinc-400">{last?.date}</div>
          </div>
        );
      })}
    </div>
  );
}
