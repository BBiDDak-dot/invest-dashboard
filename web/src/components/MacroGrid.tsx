import { num } from "@/lib/format";
import { isFearGreed, type MacroRow } from "@/lib/queries";
import { Empty } from "./Card";
import { LineChart } from "./LineChart";
import { getTrend } from "@/lib/trend";
import { TrendNote } from "./TrendNote";
import { BarChart } from "./BarChart";

const TEN = "YF:^TNX";
const TWO = "FRED:DGS2";

// 10년물·2년물을 같은 날짜 축으로 맞춤. 2년물(FRED)은 하루 늦어 빈 날은 직전 값으로 채움 (마지막 발표일까지만)
function alignYields(ten: MacroRow, two: MacroRow) {
  const labels = ten.history.map((h) => h.date);
  const twoMap = new Map(two.history.map((h) => [h.date, h.value]));
  const twoLast = two.history.at(-1)?.date ?? "";
  const twoFirst = two.history[0]?.date ?? "9999";
  let prev: number | null = null;
  const twoVals = labels.map((d) => {
    const v = twoMap.get(d);
    if (v != null) prev = v;
    return d < twoFirst || d > twoLast ? null : prev;
  });
  const tenVals = ten.history.map((h) => h.value);
  const spread = labels.map((_, i) => (tenVals[i] != null && twoVals[i] != null ? Math.round((tenVals[i]! - twoVals[i]!) * 1000) / 1000 : null));
  return { labels, tenVals, twoVals, spread };
}

// 역전(금리차 < 0) 상태 해석
function inversionLevel(labels: string[], spread: (number | null)[]): string | null {
  const idx = spread.map((v, i) => [v, i] as const).filter(([v]) => v != null);
  const last = idx.at(-1);
  if (!last) return null;
  const ym = (i: number) => labels[i].slice(0, 7);
  if (last[0]! < 0) {
    let start = last[1];
    for (let k = idx.length - 1; k >= 0 && idx[k][0]! < 0; k--) start = idx[k][1];
    return `역전 중 (${ym(start)}~): 경기 침체 선행 신호. 과거엔 역전 해소(재스티프닝) 뒤 침체가 온 경우가 많음`;
  }
  const lastNeg = [...idx].reverse().find(([v]) => v! < 0);
  if (lastNeg) return `${ym(lastNeg[1])} 역전 해소 후 재스티프닝 국면: 과거엔 이 시기에 침체·실업 증가가 겹친 경우가 많아 경기 지표 확인 필요`;
  return "정상 구간(장기금리 > 단기금리): 경기 확장기의 일반적 모습";
}

function YieldCard({ ten, two }: { ten: MacroRow; two: MacroRow }) {
  const { labels, tenVals, twoVals, spread } = alignYields(ten, two);
  const lastSpreadIdx = spread.findLastIndex((v) => v != null);
  const lastSpread = spread[lastSpreadIdx];
  const tenTrend = getTrend(TEN, ten.history);
  const spreadHistory = labels.map((date, i) => ({ series_id: "SPREAD:10Y2Y", date, value: spread[i] })).filter((o) => o.value != null);
  const spreadTrend = getTrend("SPREAD:10Y2Y", spreadHistory as MacroRow["history"]);
  if (spreadTrend) spreadTrend.level = inversionLevel(labels, spread);
  return (
    <div className="min-w-0 rounded-md border border-zinc-200 p-3 md:col-span-2 dark:border-zinc-800">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-sm font-medium">미국 10년물·2년물 국채금리와 장단기 금리차</div>
        <div className="text-xs text-zinc-500">{labels.at(-1)}</div>
      </div>
      <div className="mb-2 flex flex-wrap gap-x-4 text-xl font-semibold tabular-nums">
        <span>
          <span className="text-xs font-normal text-zinc-500">10Y </span>
          {num(tenVals.at(-1))}%
        </span>
        <span>
          <span className="text-xs font-normal text-zinc-500">2Y </span>
          {num(two.history.at(-1)?.value)}%
        </span>
        <span className={lastSpread != null && lastSpread < 0 ? "text-[var(--series-2)]" : ""}>
          <span className="text-xs font-normal text-zinc-500">10Y−2Y </span>
          {lastSpread == null ? "-" : `${lastSpread > 0 ? "+" : ""}${num(lastSpread, 2)}%p`}
        </span>
      </div>
      <LineChart
        labels={labels}
        series={[
          { name: "10년물", color: "var(--series-1)", values: tenVals },
          { name: "2년물", color: "var(--series-2)", values: twoVals },
        ]}
        height={240}
        decimals={2}
      />
      <div className="mt-3 mb-1 text-xs text-zinc-600 dark:text-zinc-400">장단기 금리차 (10Y−2Y, %p) · 주황 음영 = 역전 구간</div>
      <BarChart labels={labels} values={spread} name="10Y−2Y" height={150} decimals={2} posColor="var(--series-3)" />
      <div className="grid gap-2 md:grid-cols-2">
        {tenTrend && <TrendNote trend={tenTrend} unit="%" />}
        {spreadTrend && <TrendNote trend={spreadTrend} unit="%" />}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-zinc-400">
        2년물은 앞으로 2년간 연준 기준금리 기대를, 10년물은 장기 성장·물가 기대를 주로 반영함. 평소엔 오래 빌려줄수록 금리가 높아 금리차가 +인데,
        0 아래(역전)는 시장이 &quot;곧 경기가 나빠져 금리를 내릴 것&quot;이라 본다는 뜻. 1980년 이후 미국 침체 전에는 거의 늘 역전이 있었고, 침체는 보통 역전 6~24개월 뒤,
        금리차가 다시 +로 올라서는(재스티프닝) 시점 전후에 시작됐음. 10년물은 Yahoo(^TNX), 2년물은 FRED(DGS2) 종가로 계산.
      </p>
    </div>
  );
}

// 투자 지표: 지표마다 축이 있는 큰 선 그래프, 2열 배치
export function MacroGrid({ rows }: { rows: MacroRow[] }) {
  if (rows.length === 0) return <Empty>수집된 지표가 없음. 수집기를 한 번 실행하면 표시됨.</Empty>;
  const ten = rows.find((r) => r.series_id === TEN);
  const two = rows.find((r) => r.series_id === TWO);
  const yieldCard = ten && two && two.history.length > 1;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {rows.map((s) => {
        if (yieldCard && s.series_id === TWO) return null;
        if (yieldCard && s.series_id === TEN) return <YieldCard key={TEN} ten={ten} two={two} />;
        const last = s.history.at(-1);
        const first = s.history[0];
        const trend = getTrend(s.series_id, s.history);
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
            {trend && <TrendNote trend={trend} unit={s.unit} />}
          </div>
        );
      })}
    </div>
  );
}
