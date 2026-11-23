import type { MacroRow } from "@/lib/queries";
import { Empty } from "./Card";
import { LineChart } from "./LineChart";

const short = (name: string) => name.replace(/ 고점 대비 하락률\(MDD\)$/, "");
const ym = (d: string) => d.slice(2, 7).replace("-", ".");

// 4대 지수 고점 대비 하락률(%)을 지수별 차트로. 장기(최대 20년) 흐름을 봄
export function MddChart({ rows, height = 220 }: { rows: MacroRow[]; height?: number }) {
  if (rows.length === 0) return <Empty>MDD 데이터가 아직 없음. 수집기가 한 번 돌면 표시됨.</Empty>;
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        {rows.map((r) => {
          const h = r.history.filter((o) => o.value != null);
          const last = h.at(-1);
          const worst = h.reduce((m, o) => (m == null || o.value! < m.value! ? o : m), null as (typeof h)[number] | null);
          const low = Math.min(-20, Math.floor(((worst?.value ?? -20) - 5) / 10) * 10);
          return (
            <div key={r.series_id} className="min-w-0 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-sm font-medium">{short(r.name)}</div>
                <div className="text-xs text-zinc-500">{last?.date}</div>
              </div>
              <div className="mb-2 text-xl font-semibold tabular-nums">
                {last ? `${last.value!.toFixed(1)}%` : "-"}
                {worst && h[0] && (
                  <span className="ml-2 text-xs font-normal text-zinc-500">
                    {ym(h[0].date)} 이후 최저 {worst.value!.toFixed(1)}% ({ym(worst.date)})
                  </span>
                )}
              </div>
              <LineChart
                labels={h.map((o) => o.date)}
                series={[{ name: "고점 대비 %", color: "var(--series-1)", values: h.map((o) => o.value) }]}
                height={height}
                decimals={1}
                domain={[low, 0]}
              />
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-zinc-400">
        MDD = 종가가 그날까지의 사상 최고 종가보다 몇 % 아래인지 (0%면 신고가). 고점은 Yahoo에 있는 전체 이력에서 찾음. 최근 3년은 일별, 그 전은 주별
        값. 보통 −10%면 조정, −20%면 약세장으로 봄.
      </p>
    </>
  );
}
