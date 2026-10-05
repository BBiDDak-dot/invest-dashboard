import Link from "next/link";
import { Card } from "@/components/Card";
import { SetupNotice } from "@/components/SetupNotice";
import { EditCell, StarButton } from "@/components/EditCell";
import { Sparkline } from "@/components/Sparkline";
import { changeColor, num, pct } from "@/lib/format";
import { StockSearch } from "@/components/StockSearch";
import { getPortfolio, type Holding, type WatchRow } from "@/lib/queries";
import { CashForm, HoldingForm } from "./HoldingForms";

const th = "px-2 py-2 font-normal whitespace-nowrap";
const td = "px-2 py-2 text-right tabular-nums whitespace-nowrap";
const textCell = "px-2 py-2 align-top text-xs leading-relaxed min-w-56 max-w-72";
const COLS = 16;

type Sum = { evalKrw: number; costKrw: number; pnlKrw: number; returnPct: number | null; weight: number };

function summarize(rows: Holding[], total: number): Sum {
  const evalKrw = rows.reduce((s, h) => s + (h.evalKrw ?? 0), 0);
  // 수익률은 매입단가가 있는 종목끼리만 계산
  const known = rows.filter((h) => h.pnlKrw != null && h.costKrw);
  const costKrw = known.reduce((s, h) => s + h.costKrw!, 0);
  const pnlKrw = known.reduce((s, h) => s + h.pnlKrw!, 0);
  return { evalKrw, costKrw, pnlKrw, returnPct: costKrw ? (pnlKrw / costKrw) * 100 : null, weight: total ? (evalKrw / total) * 100 : 0 };
}

function signedWon(v: number | null | undefined) {
  if (v == null) return "-";
  return `${v > 0 ? "+" : ""}${num(v, 0)}`;
}

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${color ?? ""}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-zinc-500 tabular-nums">{sub}</div>}
    </div>
  );
}

// 텍스트 칸: 3줄까지만 보임. 누르면 전체 내용이 편집창에 열림
function Clamp({ text }: { text: string | null | undefined }) {
  if (!text) return <span className="text-zinc-400">-</span>;
  return <span className="line-clamp-3 whitespace-pre-line">{text}</span>;
}

function WeightCell({ weight, max }: { weight: number | null; max: number }) {
  if (weight == null) return <td className={td}>-</td>;
  return (
    <td className={td}>
      <div className="flex items-center justify-end gap-2">
        <div className="h-1.5 w-14 rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div className="h-1.5 rounded-full bg-[var(--series-1)]" style={{ width: `${max ? (weight / max) * 100 : 0}%` }} />
        </div>
        <span className="w-12 font-medium">{num(weight, 1)}%</span>
      </div>
    </td>
  );
}

function Rows({ label, rows, total, max }: { label: string; rows: Holding[]; total: number; max: number }) {
  if (rows.length === 0) return null;
  const s = summarize(rows, total);
  return (
    <>
      {rows.map((h, i) => {
        const reached = h.upside != null && h.upside <= 0;
        return (
          <tr key={h.ticker} className="border-b border-zinc-100 align-top dark:border-zinc-900">
            {i === 0 && (
              <td rowSpan={rows.length + 1} className="border-r border-zinc-100 px-2 py-2 text-center align-middle whitespace-nowrap dark:border-zinc-900">
                {label}
              </td>
            )}
            <td className="px-2 py-2 text-zinc-500 tabular-nums">{h.ticker}</td>
            <td className="px-2 py-2 whitespace-nowrap">
              <EditCell ticker={h.ticker} field="sector" value={h.sector}>
                {h.sector ?? "-"}
              </EditCell>
            </td>
            <td className="px-2 py-2 whitespace-nowrap">
              <span className="mr-1 align-middle">
                <StarButton ticker={h.ticker} starred={!!h.starred} />
              </span>
              <Link href={`/stocks/${encodeURIComponent(h.ticker)}`} className="font-medium hover:underline">
                {h.name}
              </Link>
            </td>
            <td className={td}>
              <EditCell ticker={h.ticker} field="avg_price" value={h.avg_price} kind="num">
                {num(h.avg_price)}
              </EditCell>
            </td>
            <td className={td}>{num(h.latest?.close)}</td>
            <td className={td}>
              <EditCell ticker={h.ticker} field="quantity" value={h.quantity} kind="num">
                {num(h.quantity, 4)}
              </EditCell>
            </td>
            <td className={td}>{num(h.evalKrw, 0)}</td>
            <td className={`${td} ${changeColor(h.pnlKrw)}`}>{signedWon(h.pnlKrw)}</td>
            <td className={`${td} ${changeColor(h.returnPct)}`}>{pct(h.returnPct)}</td>
            <WeightCell weight={h.weight} max={max} />
            <td className={td}>
              <EditCell ticker={h.ticker} field="target_price" value={h.target_price} kind="num">
                {num(h.target_price)}
              </EditCell>
            </td>
            <td className={td}>
              {reached ? (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                  목표 도달 {pct(h.upside)}
                </span>
              ) : (
                <span className={changeColor(h.upside)}>{pct(h.upside)}</span>
              )}
            </td>
            <td className="px-2 py-2 text-zinc-500">
              <Sparkline values={h.history} width={110} height={30} />
            </td>
            <td className={textCell}>
              <EditCell ticker={h.ticker} field="idea" value={h.idea} kind="long">
                <Clamp text={h.idea} />
              </EditCell>
            </td>
            <td className={textCell}>
              <EditCell ticker={h.ticker} field="sell_signal" value={h.sell_signal} kind="long">
                <Clamp text={h.sell_signal} />
              </EditCell>
            </td>
          </tr>
        );
      })}
      <tr className="border-b border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
        <td colSpan={6} className="px-2 py-1.5 text-right text-xs">
          {label} 소계
        </td>
        <td className={`${td} py-1.5 font-medium`}>{num(s.evalKrw, 0)}</td>
        <td className={`${td} py-1.5 ${changeColor(s.pnlKrw)}`}>{signedWon(s.pnlKrw)}</td>
        <td className={`${td} py-1.5 ${changeColor(s.returnPct)}`}>{pct(s.returnPct)}</td>
        <td className={`${td} py-1.5 font-medium`}>{num(s.weight, 1)}%</td>
        <td colSpan={5} />
      </tr>
    </>
  );
}

// 국내·해외·현금 비중을 한 줄 막대로
function AllocationBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const sum = parts.reduce((s, p) => s + p.value, 0);
  if (!sum) return null;
  return (
    <div>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <div key={p.label} className={p.color} style={{ width: `${(p.value / sum) * 100}%` }} title={`${p.label} ${num((p.value / sum) * 100, 1)}%`} />
          ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-zinc-600 dark:text-zinc-400">
        {parts.map((p) => (
          <span key={p.label} className="flex items-center gap-1.5">
            <span className={`inline-block h-2.5 w-2.5 rounded-sm ${p.color}`} />
            {p.label} <span className="font-medium text-zinc-900 tabular-nums dark:text-zinc-100">{num((p.value / sum) * 100, 1)}%</span>
            <span className="tabular-nums">({num(p.value, 0)}원)</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function SectorBars({ rows, total }: { rows: Holding[]; total: number }) {
  const map = new Map<string, number>();
  for (const h of rows) map.set(h.sector || "미분류", (map.get(h.sector || "미분류") ?? 0) + (h.evalKrw ?? 0));
  const list = [...map].sort((a, b) => b[1] - a[1]);
  if (!list.length || !total) return null;
  const max = list[0][1];
  return (
    <div className="space-y-1.5">
      {list.map(([sector, v]) => (
        <div key={sector} className="grid grid-cols-[7rem_1fr_3.5rem] items-center gap-2 text-xs">
          <span className="truncate text-zinc-600 dark:text-zinc-400">{sector}</span>
          <div className="h-2.5 rounded-r bg-zinc-100 dark:bg-zinc-800">
            <div className="h-2.5 rounded-r bg-[var(--series-1)]" style={{ width: `${(v / max) * 100}%` }} />
          </div>
          <span className="text-right font-medium tabular-nums">{num((v / total) * 100, 1)}%</span>
        </div>
      ))}
    </div>
  );
}

function Candidates({ rows }: { rows: WatchRow[] }) {
  const list = [...rows].sort((a, b) => (b.upside ?? -Infinity) - (a.upside ?? -Infinity));
  if (!list.length) return <p className="text-sm text-zinc-500">관심종목을 모두 보유 중임.</p>;
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-zinc-500">
        <tr className="border-b border-zinc-200 dark:border-zinc-800">
          <th className={th}>종목명</th>
          <th className={th}>섹터</th>
          <th className={`${th} text-right`}>현재가</th>
          <th className={`${th} text-right`}>목표주가</th>
          <th className={`${th} text-right`}>상승여력</th>
          <th className={th}>1년</th>
        </tr>
      </thead>
      <tbody>
        {list.map((r) => (
          <tr key={r.ticker} className="border-b border-zinc-100 dark:border-zinc-900">
            <td className="px-2 py-1.5 whitespace-nowrap">
              <Link href={`/stocks/${encodeURIComponent(r.ticker)}`} className="font-medium hover:underline">
                {r.name}
              </Link>
            </td>
            <td className="px-2 py-1.5 text-xs whitespace-nowrap text-zinc-500">{r.sector ?? "-"}</td>
            <td className={`${td} py-1.5`}>{num(r.latest?.close)}</td>
            <td className={`${td} py-1.5`}>{num(r.target_price)}</td>
            <td className={`${td} py-1.5 ${changeColor(r.upside)}`}>{pct(r.upside)}</td>
            <td className="px-2 py-1.5 text-zinc-500">
              <Sparkline values={r.history} width={80} height={24} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function PortfolioPage() {
  const { rows, holdings, cash, fx, total } = await getPortfolio();
  const held = new Set(holdings.map((h) => h.ticker));
  const candidates = rows.filter((r) => !held.has(r.ticker));
  const kr = holdings.filter((h) => h.market === "KR");
  const us = holdings.filter((h) => h.market === "US");
  const all = summarize(holdings, total);
  const krSum = summarize(kr, total);
  const usSum = summarize(us, total);
  const maxWeight = Math.max(0, ...holdings.map((h) => h.weight ?? 0));
  const reached = holdings.filter((h) => h.upside != null && h.upside <= 0);
  return (
    <>
      <SetupNotice />
      <h1 className="text-lg font-semibold">포트폴리오</h1>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="순자산" value={`${num(total, 0)}원`} sub={`주식 ${num(all.evalKrw, 0)} · 현금 ${num(cash, 0)}`} />
        <Kpi label="평가손익" value={`${signedWon(all.pnlKrw)}원`} sub={`매입금액 ${num(all.costKrw, 0)}원`} color={changeColor(all.pnlKrw)} />
        <Kpi label="총수익률" value={pct(all.returnPct)} sub={`국내 ${pct(krSum.returnPct)} · 해외 ${pct(usSum.returnPct)}`} color={changeColor(all.returnPct)} />
        <Kpi label="원/달러 환율" value={num(fx?.value)} sub={fx ? `${fx.date} 기준` : undefined} />
      </div>

      {reached.length > 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          목표주가 도달: {reached.map((h) => h.name).join(", ")}. 매도 시그널 점검이 필요함.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="자산 배분">
          <AllocationBar
            parts={[
              { label: "국내 주식", value: krSum.evalKrw, color: "bg-[var(--series-1)]" },
              { label: "해외 주식", value: usSum.evalKrw, color: "bg-[var(--series-2)]" },
              { label: "현금", value: cash, color: "bg-zinc-300 dark:bg-zinc-600" },
            ]}
          />
          <div className="mt-4 flex items-center gap-2 text-sm">
            <span className="text-zinc-500">현금</span>
            <CashForm cash={cash} />
          </div>
        </Card>
        <Card title="섹터 비중 (순자산 대비)">
          <SectorBars rows={holdings} total={total} />
        </Card>
      </div>

      <Card title="보유 종목">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-zinc-500">
              <tr className="border-b border-zinc-200 dark:border-zinc-800">
                <th className={th}>구분</th>
                <th className={th}>종목코드</th>
                <th className={th}>섹터</th>
                <th className={th}>종목명</th>
                <th className={`${th} text-right`}>매입단가</th>
                <th className={`${th} text-right`}>현재가</th>
                <th className={`${th} text-right`}>보유주식수</th>
                <th className={`${th} text-right`}>평가금액(원)</th>
                <th className={`${th} text-right`}>평가손익(원)</th>
                <th className={`${th} text-right`}>수익률</th>
                <th className={`${th} text-right`}>포트 내 비중</th>
                <th className={`${th} text-right`}>1년 목표주가</th>
                <th className={`${th} text-right`}>상승여력</th>
                <th className={th}>1년 차트</th>
                <th className={th}>투자시나리오</th>
                <th className={th}>매도 시그널</th>
              </tr>
            </thead>
            <tbody>
              <Rows label="국내" rows={kr} total={total} max={maxWeight} />
              <Rows label="해외" rows={us} total={total} max={maxWeight} />
              {holdings.length === 0 && (
                <tr>
                  <td colSpan={COLS} className="py-4 text-center text-sm text-zinc-500">
                    보유 종목이 없음. 아래에서 종목과 수량을 입력할 것.
                  </td>
                </tr>
              )}
              <tr className="border-b border-zinc-100 dark:border-zinc-900">
                <td colSpan={7} className="px-2 py-2 text-right">
                  현금
                </td>
                <td className={td}>{num(cash, 0)}</td>
                <td colSpan={2} />
                <td className={`${td} font-medium`}>{total ? `${num((cash / total) * 100, 1)}%` : "-"}</td>
                <td colSpan={5} />
              </tr>
              <tr className="border-t border-zinc-300 font-semibold dark:border-zinc-700">
                <td colSpan={7} className="px-2 py-2 text-right">
                  순자산
                </td>
                <td className={td}>{num(total, 0)}</td>
                <td className={`${td} ${changeColor(all.pnlKrw)}`}>{signedWon(all.pnlKrw)}</td>
                <td className={`${td} ${changeColor(all.returnPct)}`}>{pct(all.returnPct)}</td>
                <td className={td}>100%</td>
                <td colSpan={5} />
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-zinc-500">해외 종목의 매입금액·손익은 현재 환율로 환산함. 섹터·매입단가·수량·목표주가·투자시나리오·매도 시그널은 칸을 누르면 바로 편집됨.</p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="매수 후보 (관심종목 중 미보유, 상승여력 순)">
          <Candidates rows={candidates} />
        </Card>
        <Card title="보유 종목 입력·수정">
          <div className="space-y-4">
            <HoldingForm options={rows} />
            <div>
              <div className="mb-1.5 text-xs text-zinc-500">관심종목에 없는 종목은 여기서 추가하면 양쪽에 같이 들어감</div>
              <StockSearch />
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
