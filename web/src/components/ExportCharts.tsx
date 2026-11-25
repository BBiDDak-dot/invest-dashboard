import { num } from "@/lib/format";
import type { MacroRow } from "@/lib/queries";
import { BarChart } from "./BarChart";
import { Empty } from "./Card";
import { LineChart } from "./LineChart";

// 화면 순서 (collector/exports.py ITEMS·COMBOS의 key)
const ORDER = ["DRAM_ALL", "DRAM", "DRAM_MODULE", "NAND", "MCP", "SSD", "COSMETIC_BASIC", "COSMETIC", "RAMEN", "TRANSFORMER", "CABLE", "SHIP", "BATTERY"];
// HS코드 표시용 (수집기와 같게 유지)
const HS: Record<string, string> = {
  DRAM_ALL: "8542.32-1010 + 8473.30-4060",
  DRAM: "8542.32-1010",
  DRAM_MODULE: "8473.30-4060",
  NAND: "8542.32-1030",
  MCP: "8542.32-3000",
  SSD: "8523.51-1000",
  COSMETIC_BASIC: "3304.99-1000",
  COSMETIC: "3303·3304·3305·3307",
  RAMEN: "1902.30-1010",
  TRANSFORMER: "8504.22·8504.23",
  CABLE: "8544",
  SHIP: "8901",
  BATTERY: "8507.60",
};
const LAST = "#e5484d"; // 최근 달 강조

export type ExportItem = { key: string; group: string; name: string; labels: string[]; usd: (number | null)[]; price: (number | null)[] };

export function buildExportItems(rows: MacroRow[]): ExportItem[] {
  const keys = [...new Set(rows.map((r) => r.series_id.split(":")[1]))].sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));
  return keys.flatMap((key) => {
    const usd = rows.find((r) => r.series_id === `EXP:${key}:USD`);
    const kg = rows.find((r) => r.series_id === `EXP:${key}:KG`);
    if (!usd || usd.history.length === 0) return [];
    const [group, name] = usd.name.includes("|") ? usd.name.split("|") : ["기타", usd.name];
    const tons = new Map(kg?.history.map((h) => [h.date, h.value]));
    const labels = usd.history.map((h) => h.date.slice(0, 7));
    return [{
      key,
      group,
      name,
      labels,
      usd: usd.history.map((h) => h.value),
      // 백만$ ÷ 톤 → $/kg
      price: usd.history.map((h) => {
        const t = tons.get(h.date);
        return t ? (h.value * 1e6) / (t * 1e3) : null;
      }),
    }];
  });
}

function yoy(v: (number | null)[]) {
  const a = v.at(-1);
  const b = v.at(-13);
  return a != null && b ? (a / b - 1) * 100 : null;
}

function Pct({ v, label }: { v: number | null; label: string }) {
  if (v == null) return null;
  return (
    <span className="ml-2 text-xs font-normal text-zinc-500">
      {label} <span className={v >= 0 ? "text-[var(--series-3)]" : "text-[var(--series-2)]"}>{v >= 0 ? "+" : ""}{num(v, 1)}%</span>
    </span>
  );
}

function priceDecimals(p: (number | null)[]) {
  const last = p.filter((x): x is number => x != null).at(-1) ?? 0;
  return last >= 100 ? 0 : last >= 10 ? 1 : 2;
}

export function ExportItemCard({ item }: { item: ExportItem }) {
  const ym = item.labels.at(-1);
  const lastPrice = item.price.at(-1);
  const d = priceDecimals(item.price);
  return (
    <section id={item.key} className="min-w-0 scroll-mt-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-medium">
          {item.name} <span className="text-xs font-normal text-zinc-400">HS {HS[item.key] ?? ""}</span>
        </h2>
        <span className="text-xs text-zinc-500">{ym} 기준</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="min-w-0">
          <div className="mb-1 text-sm text-zinc-500">수출 금액 (백만달러)</div>
          <div className="mb-2 text-xl font-semibold tabular-nums">
            {num(item.usd.at(-1), 0)} <span className="text-xs font-normal text-zinc-500">백만$</span>
            <Pct v={yoy(item.usd)} label="YoY" />
          </div>
          <BarChart labels={item.labels} values={item.usd} name="수출 금액(백만$)" height={220} decimals={0} posColor="var(--series-1)" lastColor={LAST} />
        </div>
        <div className="min-w-0">
          <div className="mb-1 text-sm text-zinc-500">중량 기준 수출 단가 ($/kg)</div>
          <div className="mb-2 text-xl font-semibold tabular-nums">
            {lastPrice == null ? "-" : num(lastPrice, d)} <span className="text-xs font-normal text-zinc-500">$/kg</span>
            <Pct v={yoy(item.price)} label="YoY" />
          </div>
          <LineChart labels={item.labels} series={[{ name: "단가($/kg)", color: "var(--series-1)", values: item.price }]} height={220} decimals={d} />
        </div>
      </div>
    </section>
  );
}

export function ExportSections({ items }: { items: ExportItem[] }) {
  if (items.length === 0) {
    return (
      <Empty>
        수집된 수출 데이터 없음. data.go.kr에서 &quot;관세청_품목별 국가별 수출입실적(GW)&quot; 활용신청 후 받은 일반 인증키를 GitHub Secrets에 DATA_GO_KR_KEY로 넣고 수집(only=&quot;수출 데이터&quot;)을
        돌리면 표시됨.
      </Empty>
    );
  }
  const groups = [...new Set(items.map((i) => i.group))];
  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
        {items.map((i) => (
          <a key={i.key} href={`#${i.key}`} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
            {i.name}
          </a>
        ))}
      </nav>
      {groups.map((g) => (
        <div key={g} className="space-y-4">
          <h2 className="text-sm font-medium text-zinc-500">{g}</h2>
          {items.filter((i) => i.group === g).map((i) => (
            <ExportItemCard key={i.key} item={i} />
          ))}
        </div>
      ))}
    </div>
  );
}
