import Link from "next/link";
import { Card } from "@/components/Card";
import { SetupNotice } from "@/components/SetupNotice";
import { Sparkline } from "@/components/Sparkline";
import { changeColor, num, pct } from "@/lib/format";
import { getPortfolio, getWatchItems, type Holding } from "@/lib/queries";
import { CashForm, HoldingForm } from "./HoldingForms";

const th = "px-2 py-2 font-normal whitespace-nowrap";
const td = "px-2 py-2 text-right tabular-nums whitespace-nowrap";
const textCell = "px-2 py-2 align-top text-xs leading-relaxed whitespace-pre-line min-w-56 max-w-72";

function Rows({ label, rows }: { label: string; rows: Holding[] }) {
  if (rows.length === 0) return null;
  return rows.map((h, i) => (
    <tr key={h.ticker} className="border-b border-zinc-100 align-top dark:border-zinc-900">
      {i === 0 && (
        <td rowSpan={rows.length} className="border-r border-zinc-100 px-2 py-2 text-center align-middle whitespace-nowrap dark:border-zinc-900">
          {label}
        </td>
      )}
      <td className="px-2 py-2 text-zinc-500 tabular-nums">{h.ticker}</td>
      <td className="px-2 py-2 whitespace-nowrap">{h.sector ?? "-"}</td>
      <td className="px-2 py-2 whitespace-nowrap">
        <Link href={`/stocks/${encodeURIComponent(h.ticker)}`} className="font-medium hover:underline">
          {h.name}
        </Link>
      </td>
      <td className={td}>{num(h.avg_price)}</td>
      <td className={td}>{num(h.latest?.close)}</td>
      <td className={td}>{num(h.quantity, 4)}</td>
      <td className={td}>{num(h.evalKrw, 0)}</td>
      <td className={`${td} ${changeColor(h.returnPct)}`}>{pct(h.returnPct)}</td>
      <td className={td}>{num(h.target_price)}</td>
      <td className={`${td} font-medium`}>{h.weight == null ? "-" : `${num(h.weight, 1)}%`}</td>
      <td className={`${td} ${changeColor(h.upside)}`}>{pct(h.upside)}</td>
      <td className="px-2 py-2 text-zinc-500">
        <Sparkline values={h.history} width={120} height={32} />
      </td>
      <td className={textCell}>{h.idea ?? "-"}</td>
      <td className={textCell}>{h.sell_signal ?? "-"}</td>
    </tr>
  ));
}

export default async function PortfolioPage() {
  const [{ holdings, cash, fx, total }, options] = await Promise.all([getPortfolio(), getWatchItems()]);
  const kr = holdings.filter((h) => h.market === "KR");
  const us = holdings.filter((h) => h.market === "US");
  return (
    <>
      <SetupNotice />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-semibold">포트폴리오</h1>
        <div className="flex gap-6 text-sm text-zinc-500">
          <span>
            환율 <span className="font-medium text-zinc-900 tabular-nums dark:text-zinc-100">{num(fx?.value)}</span>
          </span>
          <span>
            순자산 <span className="text-base font-semibold text-zinc-900 tabular-nums dark:text-zinc-100">{num(total, 0)}</span>원
          </span>
        </div>
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
                <th className={`${th} text-right`}>수익률</th>
                <th className={`${th} text-right`}>1년 목표주가</th>
                <th className={`${th} text-right`}>포트 내 비중</th>
                <th className={`${th} text-right`}>상승여력</th>
                <th className={th}>1년 차트</th>
                <th className={th}>투자시나리오</th>
                <th className={th}>매도 시그널</th>
              </tr>
            </thead>
            <tbody>
              <Rows label="국내" rows={kr} />
              <Rows label="해외" rows={us} />
              {holdings.length === 0 && (
                <tr>
                  <td colSpan={15} className="py-4 text-center text-sm text-zinc-500">
                    보유 종목이 없음. 아래에서 종목과 수량을 입력할 것.
                  </td>
                </tr>
              )}
              <tr className="border-t border-zinc-200 dark:border-zinc-800">
                <td colSpan={4} className="px-2 py-2 text-right">
                  현금
                </td>
                <td colSpan={4} className="px-2 py-2">
                  <CashForm cash={cash} />
                </td>
                <td colSpan={2} />
                <td className={`${td} font-medium`}>{total ? `${num((cash / total) * 100, 1)}%` : "-"}</td>
                <td colSpan={4} />
              </tr>
              <tr className="border-t border-zinc-200 font-semibold dark:border-zinc-800">
                <td colSpan={7} className="px-2 py-2 text-right">
                  순자산
                </td>
                <td className={td}>{num(total, 0)}</td>
                <td colSpan={7} />
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="보유 종목 입력·수정">
        <HoldingForm options={options} />
      </Card>
    </>
  );
}

