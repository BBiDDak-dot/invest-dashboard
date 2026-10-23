import Link from "next/link";
import { Card, Empty } from "@/components/Card";
import { SetupNotice } from "@/components/SetupNotice";
import { DeleteTradeButton, TradeForm } from "@/components/TradeForm";
import { changeColor, kstToday, num, pct } from "@/lib/format";
import { getFx, getTrades, getWatchItems } from "@/lib/queries";
import { buildLedger } from "@/lib/trades";

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

export default async function JournalPage() {
  const [trades, fx, items] = await Promise.all([getTrades(), getFx(), getWatchItems()]);
  const rate = fx?.value ?? null;
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
    <>
      <SetupNotice />
      <h1 className="text-lg font-semibold">매매 일지</h1>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="누적 실현손익" value={`${signedWon(sumKrw(sells))}원`} color={changeColor(sumKrw(sells))} />
        <Kpi
          label={`${year}년 실현손익`}
          value={`${signedWon(sumKrw(sells.filter((t) => t.trade_date.startsWith(year))))}원`}
          color={changeColor(sumKrw(sells.filter((t) => t.trade_date.startsWith(year))))}
        />
        <Kpi label="매도 승률" value={sells.length ? `${num((wins / sells.length) * 100, 1)}%` : "-"} sub={`${wins}승 ${sells.length - wins}패`} />
        <Kpi label="매매 기록" value={`${trades.filter((t) => t.side !== "open").length}건`} sub={<Link href="/portfolio" className="hover:underline">포트폴리오 보기</Link>} />
      </div>

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
    </>
  );
}
