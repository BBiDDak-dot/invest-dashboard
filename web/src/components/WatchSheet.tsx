import Link from "next/link";
import { changeColor, num, pct } from "@/lib/format";
import type { Holding, WatchRow } from "@/lib/queries";
import { Empty } from "./Card";
import { EditCell, StarButton } from "./EditCell";
import { Sparkline } from "./Sparkline";

const th = "px-2 py-2 font-normal whitespace-nowrap";
const td = "px-2 py-2";
const numCell = "px-2 py-2 text-right tabular-nums whitespace-nowrap";
const textCell = "px-2 py-2 align-top text-xs leading-relaxed min-w-56 max-w-72";
const dash = <span className="text-zinc-400">-</span>;

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

function LongText({ text }: { text: string | null | undefined }) {
  return text ? <span className="line-clamp-4 whitespace-pre-line">{text}</span> : dash;
}

// 자동 계산값이면 회색 "자동" 표시
function RatioCell({ r, field }: { r: WatchRow; field: "debt_ratio" | "reserve_ratio" }) {
  const manual = r[field];
  const auto = field === "debt_ratio" ? r.autoDebtRatio : r.autoReserveRatio;
  const shown = manual ?? auto;
  return (
    <td className={numCell}>
      <EditCell ticker={r.ticker} field={field} value={manual} kind="num" placeholder={auto == null ? "" : `자동 ${num(auto, 0)}`}>
        {shown == null ? dash : `${num(shown, 0)}%`}
        {manual == null && auto != null && <div className="text-[10px] text-zinc-400">자동</div>}
      </EditCell>
    </td>
  );
}

function Row({ r, holdings }: { r: WatchRow; holdings?: Map<string, Holding> }) {
  return (
    <tr className="border-b border-zinc-100 align-top dark:border-zinc-900">
      <td className="px-1 py-2 text-center">
        <StarButton ticker={r.ticker} starred={!!r.starred} />
      </td>
      <td className={`${td} whitespace-nowrap`}>
        <EditCell ticker={r.ticker} field="group_name" value={r.group_name}>
          {r.group_name ?? dash}
        </EditCell>
      </td>
      <td className={`${td} text-zinc-500 tabular-nums`}>{r.ticker}</td>
      <td className={`${td} whitespace-nowrap`}>
        <EditCell ticker={r.ticker} field="sector" value={r.sector}>
          {r.sector ?? dash}
        </EditCell>
      </td>
      <td className={`${td} whitespace-nowrap`}>
        <Link href={`/stocks/${encodeURIComponent(r.ticker)}`} className="font-medium hover:underline">
          {r.name}
        </Link>
      </td>
      <td className={numCell}>
        {num(r.latest?.close)}
        <div className={`text-xs ${changeColor(r.latest?.change_pct)}`}>{pct(r.latest?.change_pct)}</div>
      </td>
      {holdings && <HeldCell h={holdings.get(r.ticker)} />}
      <td className={numCell}>
        <EditCell ticker={r.ticker} field="target_price" value={r.target_price} kind="num">
          {r.target_price == null ? dash : num(r.target_price)}
        </EditCell>
      </td>
      <td className={`${numCell} ${changeColor(r.upside)}`}>{pct(r.upside)}</td>
      <td className={numCell}>
        <EditCell ticker={r.ticker} field="fwd_pe" value={r.fwd_pe} kind="num">
          {r.fwd_pe == null ? dash : num(r.fwd_pe, 1)}
        </EditCell>
      </td>
      <RatioCell r={r} field="debt_ratio" />
      <RatioCell r={r} field="reserve_ratio" />
      <td className={`${td} text-zinc-500`}>
        <Sparkline values={r.history} width={120} height={32} />
      </td>
      <td className={textCell}>
        <EditCell ticker={r.ticker} field="idea" value={r.idea} kind="long">
          <LongText text={r.idea} />
        </EditCell>
      </td>
      <td className={textCell}>
        <EditCell ticker={r.ticker} field="risk" value={r.risk} kind="long">
          <LongText text={r.risk} />
        </EditCell>
      </td>
      <td className={textCell}>
        <EditCell ticker={r.ticker} field="sell_signal" value={r.sell_signal} kind="long">
          <LongText text={r.sell_signal} />
        </EditCell>
      </td>
    </tr>
  );
}

// 섹터별로 묶기 (섹터 순서는 표에서 처음 나오는 순서)
function bySector(rows: WatchRow[]) {
  const groups = new Map<string, WatchRow[]>();
  for (const r of rows) {
    const k = r.sector?.trim() || "미분류";
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return [...groups];
}

// 관심종목 스프레드시트와 같은 열 구성. 칸을 누르면 바로 편집됨
export function WatchSheet({
  rows,
  holdings,
  empty,
  groupBySector = false,
}: {
  rows: WatchRow[];
  holdings?: Map<string, Holding>;
  empty?: string;
  groupBySector?: boolean;
}) {
  if (rows.length === 0) return <Empty>{empty ?? "등록된 종목이 없음. 위 검색창에서 종목을 추가할 것."}</Empty>;
  const cols = holdings ? 16 : 15;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-zinc-500">
          <tr className="border-b border-zinc-200 dark:border-zinc-800">
            <th className={`${th} px-1 text-center`} title="톱픽">
              ★
            </th>
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
          {groupBySector
            ? bySector(rows).map(([sector, list]) => {
                const ups = list.map((r) => r.upside).filter((u): u is number => u != null);
                const avgUp = ups.length ? ups.reduce((a, b) => a + b, 0) / ups.length : null;
                return [
                  <tr key={`s-${sector}`} className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50">
                    <td colSpan={cols} className="px-2 py-1.5 text-xs">
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200">{sector}</span>
                      <span className="ml-2 text-zinc-500">
                        {list.length}종목 · 평균 상승여력 <span className={changeColor(avgUp)}>{pct(avgUp)}</span>
                      </span>
                    </td>
                  </tr>,
                  ...list.map((r) => <Row key={r.ticker} r={r} holdings={holdings} />),
                ];
              })
            : rows.map((r) => <Row key={r.ticker} r={r} holdings={holdings} />)}
        </tbody>
      </table>
    </div>
  );
}
