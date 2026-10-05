import Link from "next/link";
import { changeColor, num, pct } from "@/lib/format";
import type { Holding, WatchRow } from "@/lib/queries";
import { Empty } from "./Card";
import { Sparkline } from "./Sparkline";

const th = "px-2 py-2 font-normal whitespace-nowrap";
const textCell = "px-2 py-2 align-top text-xs leading-relaxed whitespace-pre-line min-w-56 max-w-72";

function HeldCell({ h }: { h: Holding | undefined }) {
  if (!h) return <td className="px-2 py-2 text-right text-zinc-400">-</td>;
  return (
    <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
      <Link href="/portfolio" className="hover:underline">
        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium dark:bg-zinc-800">{h.weight == null ? "보유" : `${num(h.weight, 1)}%`}</span>
      </Link>
      <div className={`text-xs ${changeColor(h.returnPct)}`}>{pct(h.returnPct)}</div>
    </td>
  );
}

// 관심종목 스프레드시트와 같은 열 구성
export function WatchSheet({ rows, holdings, empty }: { rows: WatchRow[]; holdings?: Map<string, Holding>; empty?: string }) {
  if (rows.length === 0) return <Empty>{empty ?? "등록된 종목이 없음. 위 검색창에서 종목을 추가할 것."}</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-zinc-500">
          <tr className="border-b border-zinc-200 dark:border-zinc-800">
            <th className={th}>구분</th>
            <th className={th}>종목코드</th>
            <th className={th}>섹터</th>
            <th className={th}>종목명</th>
            <th className={`${th} text-right`}>현재가</th>
            {holdings && <th className={`${th} text-right`}>보유 (비중·수익률)</th>}
            <th className={`${th} text-right`}>1년 목표주가</th>
            <th className={`${th} text-right`}>상승여력</th>
            <th className={`${th} text-right`}>12M Fwd P/E</th>
            <th className={`${th} text-right`}>부채비율</th>
            <th className={`${th} text-right`}>유보율</th>
            <th className={th}>1년 차트</th>
            <th className={th}>투자아이디어</th>
            <th className={th}>리스크</th>
            <th className={th}>매도 시그널</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.ticker} className="border-b border-zinc-100 align-top dark:border-zinc-900">
              <td className="px-2 py-2 whitespace-nowrap">{r.group_name ?? "-"}</td>
              <td className="px-2 py-2 text-zinc-500 tabular-nums">{r.ticker}</td>
              <td className="px-2 py-2 whitespace-nowrap">{r.sector ?? "-"}</td>
              <td className="px-2 py-2 whitespace-nowrap">
                <Link href={`/stocks/${encodeURIComponent(r.ticker)}`} className="font-medium hover:underline">
                  {r.name}
                </Link>
              </td>
              <td className="px-2 py-2 text-right tabular-nums">
                {num(r.latest?.close)}
                <div className={`text-xs ${changeColor(r.latest?.change_pct)}`}>{pct(r.latest?.change_pct)}</div>
              </td>
              {holdings && <HeldCell h={holdings.get(r.ticker)} />}
              <td className="px-2 py-2 text-right tabular-nums">{num(r.target_price)}</td>
              <td className={`px-2 py-2 text-right tabular-nums ${changeColor(r.upside)}`}>{pct(r.upside)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{num(r.fwd_pe, 1)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{r.debtRatio == null ? "-" : `${num(r.debtRatio, 0)}%`}</td>
              <td className="px-2 py-2 text-right tabular-nums">{r.reserveRatio == null ? "-" : `${num(r.reserveRatio, 0)}%`}</td>
              <td className="px-2 py-2 text-zinc-500">
                <Sparkline values={r.history} width={120} height={32} />
              </td>
              <td className={textCell}>{r.idea ?? "-"}</td>
              <td className={textCell}>{r.risk ?? "-"}</td>
              <td className={textCell}>{r.sell_signal ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
