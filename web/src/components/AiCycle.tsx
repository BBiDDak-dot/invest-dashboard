import { num } from "@/lib/format";
import type { MacroRow } from "@/lib/queries";
import { BarChart } from "./BarChart";
import { Empty } from "./Card";
import { LineChart } from "./LineChart";

// 4색 팔레트 뒤로 이어 쓰는 색 (기타는 회색)
const COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "#c99a06", "#d9467f", "#0e9f9f"];
const OTHER = "#9ca3af";

const find = (rows: MacroRow[], id: string) => rows.find((r) => r.series_id === id);

// 같은 날짜 축으로 맞춤
function align(rows: MacroRow[]) {
  const labels = [...new Set(rows.flatMap((r) => r.history.map((h) => h.date)))].sort();
  return {
    labels,
    values: rows.map((r) => {
      const m = new Map(r.history.map((h) => [h.date, h.value]));
      return labels.map((d) => m.get(d) ?? null);
    }),
  };
}

// 몇 칸 전 값 대비 변화율
function change(row: MacroRow | undefined, back: number) {
  const h = row?.history ?? [];
  const last = h.at(-1)?.value;
  const prev = h.at(-1 - back)?.value;
  return last != null && prev ? (last / prev - 1) * 100 : null;
}

function Pct({ v, label }: { v: number | null; label: string }) {
  if (v == null) return null;
  return (
    <span className="ml-2 text-xs font-normal text-zinc-500">
      {label} <span className={v >= 0 ? "text-[var(--series-3)]" : "text-[var(--series-2)]"}>{v >= 0 ? "+" : ""}{num(v, 1)}%</span>
    </span>
  );
}

function Box({ title, date, children, wide }: { title: string; date?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`min-w-0 rounded-md border border-zinc-200 p-3 dark:border-zinc-800 ${wide ? "md:col-span-2" : ""}`}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-zinc-500">{date}</div>
      </div>
      {children}
    </div>
  );
}

const quarterLabel = (d: string) => `'${d.slice(2, 4)}.${Math.ceil(Number(d.slice(5, 7)) / 3)}Q`;

export function OpenRouterCards({ rows }: { rows: MacroRow[] }) {
  const tokens = find(rows, "AI:OR_TOKENS");
  if (!tokens) {
    return (
      <Empty>
        OpenRouter 데이터 없음. openrouter.ai에서 무료 API 키를 만든 뒤 GitHub Secrets에 OPENROUTER_API_KEY로 넣으면 다음 수집부터 표시됨.
      </Empty>
    );
  }
  const shares = rows
    .filter((r) => r.series_id.startsWith("AI:OR_SHARE:"))
    .sort((a, b) => (a.series_id.endsWith(":other") ? 1 : b.series_id.endsWith(":other") ? -1 : (b.history.at(-1)?.value ?? 0) - (a.history.at(-1)?.value ?? 0)));
  const { labels, values } = align(shares);
  const last = tokens.history.at(-1);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Box title="주간 토큰 사용량 (조 토큰)" date={last && `${last.date} 주`}>
        <div className="mb-2 text-xl font-semibold tabular-nums">
          {num(last?.value, 2)} <span className="text-xs font-normal text-zinc-500">조 토큰/주</span>
          <Pct v={change(tokens, 4)} label="4주" />
          <Pct v={change(tokens, 52)} label="1년" />
        </div>
        <LineChart labels={tokens.history.map((h) => h.date)} series={[{ name: "주간 토큰", color: "var(--series-1)", values: tokens.history.map((h) => h.value) }]} height={240} decimals={2} />
      </Box>
      <Box title="개발사별 토큰 점유율 (%)" date={labels.at(-1) && `${labels.at(-1)} 주`}>
        <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {shares.map((s, i) => (
            <span key={s.series_id} className="tabular-nums">
              <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: s.series_id.endsWith(":other") ? OTHER : COLORS[i % COLORS.length] }} />
              {s.name} {num(s.history.at(-1)?.value, 1)}%
            </span>
          ))}
        </div>
        <LineChart
          labels={labels}
          series={shares.map((s, i) => ({ name: s.name, color: s.series_id.endsWith(":other") ? OTHER : COLORS[i % COLORS.length], values: values[i] }))}
          height={240}
          decimals={1}
        />
      </Box>
    </div>
  );
}

export function CapexCards({ rows }: { rows: MacroRow[] }) {
  const total = find(rows, "AI:CAPEX:TOTAL");
  const cos = rows.filter((r) => r.series_id.startsWith("AI:CAPEX:") && r.series_id !== "AI:CAPEX:TOTAL").sort((a, b) => (b.history.at(-1)?.value ?? 0) - (a.history.at(-1)?.value ?? 0));
  if (!total) return <Empty>수집된 CAPEX 데이터 없음.</Empty>;
  const { labels, values } = align(cos);
  const last = total.history.at(-1);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Box title="빅테크 5사 분기 CAPEX 합계 (십억$)" date={last && quarterLabel(last.date)}>
        <div className="mb-2 text-xl font-semibold tabular-nums">
          {num(last?.value, 1)} <span className="text-xs font-normal text-zinc-500">십억$</span>
          <Pct v={change(total, 4)} label="YoY" />
        </div>
        <BarChart labels={total.history.map((h) => quarterLabel(h.date))} values={total.history.map((h) => h.value)} name="CAPEX 합계" height={240} decimals={1} />
      </Box>
      <Box title="회사별 분기 CAPEX (십억$)" date={labels.at(-1) && quarterLabel(labels.at(-1)!)}>
        <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {cos.map((s, i) => (
            <span key={s.series_id} className="tabular-nums">
              <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
              {s.name.replace(" CAPEX", "")} {num(s.history.at(-1)?.value, 1)}
              <Pct v={change(s, 4)} label="" />
            </span>
          ))}
        </div>
        <LineChart labels={labels.map(quarterLabel)} series={cos.map((s, i) => ({ name: s.name, color: COLORS[i % COLORS.length], values: values[i] }))} height={240} decimals={1} />
      </Box>
    </div>
  );
}

export function TsmcCard({ rows }: { rows: MacroRow[] }) {
  const rev = find(rows, "AI:TSMC_REV");
  const yoy = find(rows, "AI:TSMC_YOY");
  if (!rev) return <Empty>수집된 TSMC 월매출 없음.</Empty>;
  const last = rev.history.at(-1);
  const lastYoy = yoy?.history.at(-1)?.value ?? null;
  const ym = (d: string) => d.slice(0, 7);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Box title="TSMC 월매출 (십억 대만달러)" date={last && ym(last.date)}>
        <div className="mb-2 text-xl font-semibold tabular-nums">
          {num(last?.value, 1)} <span className="text-xs font-normal text-zinc-500">십억 NT$</span>
          <Pct v={lastYoy} label="YoY" />
        </div>
        <BarChart labels={rev.history.map((h) => ym(h.date))} values={rev.history.map((h) => h.value)} name="월매출" height={220} decimals={1} />
      </Box>
      {yoy && (
        <Box title="TSMC 월매출 전년 대비 (%)" date={yoy.history.at(-1) && ym(yoy.history.at(-1)!.date)}>
          <div className="mb-2 text-xl font-semibold tabular-nums">{num(lastYoy, 1)}%</div>
          <BarChart labels={yoy.history.map((h) => ym(h.date))} values={yoy.history.map((h) => h.value)} name="YoY" height={220} decimals={1} posColor="var(--series-3)" />
        </Box>
      )}
    </div>
  );
}
