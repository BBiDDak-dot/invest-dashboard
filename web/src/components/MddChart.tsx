import type { MacroRow } from "@/lib/queries";
import { Empty } from "./Card";
import { LineChart } from "./LineChart";

const COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];
const short = (name: string) => name.replace(/ 고점 대비 하락률\(MDD\)$/, "");

// 4대 지수 고점 대비 하락률(%)을 한 차트에 겹쳐 그림. 단위가 같아 축 하나로 비교 가능
export function MddChart({ rows }: { rows: MacroRow[] }) {
  if (rows.length === 0) return <Empty>MDD 데이터가 아직 없음. 수집기가 한 번 돌면 표시됨.</Empty>;
  // 한국·미국 휴장일이 달라 날짜를 합친 뒤 빈 날은 직전 값으로 채움
  const labels = Array.from(new Set(rows.flatMap((r) => r.history.map((h) => h.date)))).sort();
  const series = rows.map((r, i) => {
    const byDate = new Map(r.history.map((h) => [h.date, h.value]));
    let prev: number | null = null;
    const values = labels.map((d) => {
      const v = byDate.get(d);
      if (v != null) prev = v;
      return prev;
    });
    return { name: short(r.name), color: COLORS[i % COLORS.length], values };
  });
  return (
    <>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {rows.map((r, i) => {
          const last = r.history.at(-1);
          const worst = r.history.reduce((m, h) => (h.value != null && (m == null || h.value < m.value!) ? h : m), null as (typeof r.history)[number] | null);
          return (
            <div key={r.series_id} className="rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
              <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                {short(r.name)}
              </div>
              <div className="text-lg font-semibold tabular-nums">{last?.value == null ? "-" : `${last.value.toFixed(1)}%`}</div>
              {worst && (
                <div className="text-xs text-zinc-500 tabular-nums">
                  3년 최저 {worst.value!.toFixed(1)}% ({worst.date.slice(2, 7).replace("-", ".")})
                </div>
              )}
            </div>
          );
        })}
      </div>
      <LineChart labels={labels} series={series} height={280} decimals={1} />
      <p className="mt-3 text-xs text-zinc-400">
        MDD = 종가가 그날까지의 사상 최고 종가보다 몇 % 아래인지 (0%면 신고가). 고점은 Yahoo에 있는 전체 이력에서 찾음. 보통 −10%면 조정, −20%면
        약세장으로 봄.
      </p>
    </>
  );
}
