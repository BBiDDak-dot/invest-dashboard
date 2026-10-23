import Link from "next/link";
import { Card, Empty } from "@/components/Card";
import { CashFlowForm, DeleteCashFlowButton, DeleteTradeButton, TradeForm } from "@/components/TradeForm";
import { changeColor, kstToday, num, pct } from "@/lib/format";
import { buildLedger, flowDelta, type CashFlow, type Trade } from "@/lib/trades";

const th = "px-2 py-2 font-normal whitespace-nowrap";
const td = "px-2 py-2 text-right tabular-nums whitespace-nowrap";

const SIDE = {
  open: { label: "기초", cls: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300" },
  buy: { label: "매수", cls: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300" },
  sell: { label: "매도", cls: "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300" },
};

function signedWon(v: number | null | undefined) {
  if (v == null) return "-";
  return `${v > 0 ? "+" : ""}${num(v, 0)}`;
}

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: React.ReactNode; color?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${color ?? ""}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-zinc-500 tabular-nums">{sub}</div>}
    </div>
  );
}

type Option = { ticker: string; name: string; market: "KR" | "US"; avg_price?: number | null; quantity?: number | null };

// 포트폴리오 탭 안의 매매 일지: 기록 폼, 실현손익 요약, 매매 내역
export function TradeJournal({
  trades,
  flows,
  items,
  rate,
  netWorth,
}: {
  trades: Trade[];
  flows: CashFlow[];
  items: Option[];
  rate: number | null;
  netWorth: number;
}) {
  const deposits = flows.filter((f) => f.kind === "deposit").reduce((s, f) => s + Number(f.amount), 0);
  const withdraws = flows.filter((f) => f.kind === "withdraw").reduce((s, f) => s + Number(f.amount), 0);
  const netIn = deposits - withdraws;
  // 입금을 빠짐없이 기록했을 때만 의미 있음: 지금 순자산이 넣은 돈보다 얼마나 늘었나
  const gain = flows.length && netIn > 0 ? netWorth - netIn : null;
  const { realized } = buildLedger(trades, rate);
  const year = kstToday().slice(0, 4);
  const sells = trades.filter((t) => t.side === "sell" && realized.has(t.id));
  const sumKrw = (list: typeof sells) => list.reduce((s, t) => s + (realized.get(t.id)?.pnlKrw ?? 0), 0);
  const wins = sells.filter((t) => (realized.get(t.id)?.pnl ?? 0) > 0).length;

  // 종목별 실현손익
  const byTicker = new Map<string, { name: string; pnlKrw: number; count: number; wins: number }>();
  for (const t of sells) {
    const r = realized.get(t.id)!;
    const g = byTicker.get(t.ticker) ?? { name: t.name, pnlKrw: 0, count: 0, wins: 0 };
    g.pnlKrw += r.pnlKrw ?? 0;
    g.count += 1;
    g.wins += r.pnl > 0 ? 1 : 0;
    byTicker.set(t.ticker, g);
  }
  const tickerRows = [...byTicker].sort((a, b) => b[1].pnlKrw - a[1].pnlKrw);

  return (
    <section id="journal" className="scroll-mt-4 space-y-4">
      <h2 className="pt-2 text-lg font-semibold">매매 일지</h2>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="순입금 (입금−출금)" value={`${num(netIn, 0)}원`} sub={`입금 ${num(deposits, 0)} · 출금 ${num(withdraws, 0)}`} />
        <Kpi
          label="투자 손익 (순자산−순입금)"
          value={gain == null ? "-" : `${signedWon(gain)}원`}
          sub={gain == null ? "입금을 기록하면 계산됨" : pct((gain / netIn) * 100)}
          color={changeColor(gain)}
        />
        <Kpi label="누적 실현손익" value={`${signedWon(sumKrw(sells))}원`} color={changeColor(sumKrw(sells))} />
        <Kpi
          label={`${year}년 실현손익`}
          value={`${signedWon(sumKrw(sells.filter((t) => t.trade_date.startsWith(year))))}원`}
          color={changeColor(sumKrw(sells.filter((t) => t.trade_date.startsWith(year))))}
        />
        <Kpi label="매도 승률" value={sells.length ? `${num((wins / sells.length) * 100, 1)}%` : "-"} sub={`${wins}승 ${sells.length - wins}패`} />
      </div>

      <Card title="현금 입금·출금">
        <CashFlowForm today={kstToday()} />
        {flows.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-zinc-500">
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  <th className={th}>날짜</th>
                  <th className={th}>구분</th>
                  <th className={`${th} text-right`}>금액(원)</th>
                  <th className={th}>메모</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody>
                {flows.map((f) => {
                  const label = f.kind === "deposit" ? "입금" : "출금";
                  return (
                    <tr key={f.id} className="border-b border-zinc-100 dark:border-zinc-900">
                      <td className="px-2 py-1.5 whitespace-nowrap text-zinc-500 tabular-nums">{f.flow_date}</td>
                      <td className="px-2 py-1.5">
                        <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${f.kind === "deposit" ? SIDE.buy.cls : SIDE.sell.cls}`}>{label}</span>
                      </td>
                      <td className={`${td} py-1.5`}>{signedWon(flowDelta(f))}</td>
                      <td className="px-2 py-1.5 text-xs text-zinc-600 dark:text-zinc-400">{f.memo ?? ""}</td>
                      <td className="px-2 py-1.5">
                        <DeleteCashFlowButton id={f.id} label={`${f.flow_date} ${label} ${num(Number(f.amount), 0)}원`} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-zinc-400">입금·출금을 기록하면 현금 잔고가 바로 바뀜. 이미 현금에 들어가 있는 지난 입금은 &quot;현금에 반영&quot;을 끄고 기록하면 순입금 계산에만 쓰임.</p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="매매 기록하기">
          <TradeForm options={items} fx={rate} today={kstToday()} />
        </Card>
        <Card title="종목별 실현손익">
          {tickerRows.length === 0 ? (
            <Empty>아직 매도 기록이 없음.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-zinc-500">
                  <tr className="border-b border-zinc-200 dark:border-zinc-800">
                    <th className={th}>종목명</th>
                    <th className={`${th} text-right`}>실현손익(원)</th>
                    <th className={`${th} text-right`}>매도</th>
                    <th className={`${th} text-right`}>승</th>
                  </tr>
                </thead>
                <tbody>
                  {tickerRows.map(([ticker, g]) => (
                    <tr key={ticker} className="border-b border-zinc-100 dark:border-zinc-900">
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <Link href={`/stocks/${encodeURIComponent(ticker)}`} className="hover:underline">
                          {g.name}
                        </Link>
                      </td>
                      <td className={`${td} py-1.5 ${changeColor(g.pnlKrw)}`}>{signedWon(g.pnlKrw)}</td>
                      <td className={`${td} py-1.5`}>{g.count}</td>
                      <td className={`${td} py-1.5`}>{g.wins}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card title="매매 내역">
        {trades.length === 0 ? (
          <Empty>아직 기록이 없음. 위에서 매수·매도를 기록하면 포트폴리오가 같이 바뀜.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-zinc-500">
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  <th className={th}>날짜</th>
                  <th className={th}>종목명</th>
                  <th className={th}>구분</th>
                  <th className={`${th} text-right`}>단가</th>
                  <th className={`${th} text-right`}>수량</th>
                  <th className={`${th} text-right`}>금액</th>
                  <th className={`${th} text-right`}>수수료·세금</th>
                  <th className={`${th} text-right`}>실현손익(원)</th>
                  <th className={`${th} text-right`}>수익률</th>
                  <th className={th}>매매 이유</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody>
                {trades.map((t) => {
                  const r = realized.get(t.id);
                  const s = SIDE[t.side];
                  const unit = t.market === "US" ? "$" : "";
                  return (
                    <tr key={t.id} className="border-b border-zinc-100 align-top dark:border-zinc-900">
                      <td className="px-2 py-2 whitespace-nowrap text-zinc-500 tabular-nums">{t.trade_date}</td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        <Link href={`/stocks/${encodeURIComponent(t.ticker)}`} className="font-medium hover:underline">
                          {t.name}
                        </Link>
                      </td>
                      <td className="px-2 py-2">
                        <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>
                      </td>
                      <td className={td}>
                        {unit}
                        {num(t.price)}
                      </td>
                      <td className={td}>{num(t.quantity, 4)}</td>
                      <td className={td}>
                        {unit}
                        {num(t.price * t.quantity, t.market === "US" ? 2 : 0)}
                      </td>
                      <td className={td}>{t.fee ? `${unit}${num(t.fee)}` : "-"}</td>
                      <td className={`${td} ${changeColor(r?.pnlKrw)}`}>{r ? signedWon(r.pnlKrw) : ""}</td>
                      <td className={`${td} ${changeColor(r?.returnPct)}`}>{r ? pct(r.returnPct) : ""}</td>
                      <td className="min-w-56 max-w-96 px-2 py-2 text-xs leading-relaxed whitespace-pre-line text-zinc-700 dark:text-zinc-300">{t.reason ?? ""}</td>
                      <td className="px-2 py-2">
                        <DeleteTradeButton id={t.id} label={`${t.trade_date} ${t.name} ${s.label}`} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-zinc-500">
          매입단가는 이동평균(매수 수수료 포함), 실현손익은 매도 시점 평단 기준에서 매도 수수료·세금을 뺀 값임. 해외 실현손익은 매도 때 입력한 환율로 환산함. 잘못 기록했으면 지우고 다시 기록할 것.
        </p>
      </Card>
    </section>
  );
}
