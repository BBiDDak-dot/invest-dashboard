import Link from "next/link";
import { changeColor, num } from "@/lib/format";

// 통상의 실적 발표 기간: 1Q는 4월~5/15, 2Q는 7월~8/14, 3Q는 10월~11/14(분기·반기보고서 마감), 4Q는 1월~3/31(사업보고서 마감)
const SEASON = { 1: "4/1~5/15", 2: "7/1~8/14", 3: "10/1~11/14", 4: "1/1~3/31" } as const;
// 미국: 10-Q는 분기 끝나고 40~45일, 10-K는 60~90일 안에 제출
const US_SEASON = { 1: "4/10~5/15", 2: "7/10~8/14", 3: "10/10~11/14", 4: "1/15~3/31" } as const;

// 오늘 기준 발표가 시작된 가장 최근 분기부터 n개 (예: 10/6이면 26.3Q, 26.2Q, 26.1Q …)
export function recentQuarters(today: string, n: number) {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  let [yy, qq] = m <= 3 ? [y - 1, 4] : [y, Math.floor((m - 1) / 3)];
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(`${yy}.${qq}Q`);
    [yy, qq] = qq === 1 ? [yy - 1, 4] : [yy, qq - 1];
  }
  return out;
}

export const qLabel = (q: string) => `'${q.slice(2, 4)}.${q.slice(5)}`;
export const qSeason = (q: string, us = false) => (us ? US_SEASON : SEASON)[Number(q.slice(5, 6)) as 1 | 2 | 3 | 4];

export const chip = (on: boolean) =>
  `rounded-md px-2.5 py-1 ${on ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"}`;

export function Pct({ v, turn }: { v: number | null; turn?: string | null }) {
  if (turn) return <span className={turn.includes("흑자") ? "text-red-600" : "text-blue-600"}>{turn}</span>;
  if (v == null) return <span className="text-zinc-400">-</span>;
  return (
    <span className={changeColor(v)}>
      {v > 0 ? "+" : ""}
      {num(v, 1)}%
    </span>
  );
}

// 제목 옆 국내 / 미국 전환
export function MarketTabs({ us }: { us: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <h1 className="text-lg font-semibold">실적 스크리닝</h1>
      <div className="flex gap-1 text-sm">
        <Link href="/earnings" className={chip(!us)}>
          국내
        </Link>
        <Link href="/earnings/us" className={chip(us)}>
          미국
        </Link>
      </div>
    </div>
  );
}

type Growth = {
  revenue: number | null; revenue_prev_y: number | null; revenue_yoy: number | null;
  op: number | null; op_prev_y: number | null; op_yoy: number | null; op_turn: string | null;
  ni: number | null; ni_prev_y: number | null; ni_yoy: number | null; ni_turn: string | null;
};

// 항목별 판정: 전년 동기 대비 증가(흑자전환 포함) / 판단 불가(값이 없음) / 미달
function judge(now: number | null, prev: number | null, yoy: number | null, turn: string | null, min: number) {
  if (now == null || prev == null) return "none";
  return (yoy != null && yoy > min) || (turn ?? "").includes("흑자") ? "up" : "fail";
}

// 매출·영업이익·당기순이익이 모두 늘어난 곳. 없는 항목이 있으면 나머지 둘만으로 판단 (두 항목 이상 필요)
export function allGrow(r: Growth, min: number) {
  const j = [
    judge(r.revenue, r.revenue_prev_y, r.revenue_yoy, null, min),
    judge(r.op, r.op_prev_y, r.op_yoy, r.op_turn, min),
    judge(r.ni, r.ni_prev_y, r.ni_yoy, r.ni_turn, min),
  ];
  return !j.includes("fail") && j.filter((x) => x === "up").length >= 2;
}
