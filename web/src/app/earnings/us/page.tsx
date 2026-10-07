import Link from "next/link";
import { Card, Empty } from "@/components/Card";
import { EarningsNote } from "@/components/EarningsNote";
import { SetupNotice } from "@/components/SetupNotice";
import type { UsEarningsRow } from "@/lib/db";
import { num } from "@/lib/format";
import { countUsEarnings, daysAgo, getUsEarnings, getWatchItems } from "@/lib/queries";
import { chip, MarketTabs, Pct, qLabel, qSeason, recentQuarters } from "../shared";

const VIEWS = { grow: "동반 성장", all: "전체", memo: "메모" } as const;
const MINS = { "0": "0%↑", "10": "10%↑", "30": "30%↑" } as const;
// 분기 매출 규모 (백만 달러)
const SIZES = { "10": "전체", "100": "1억$↑", "1000": "10억$↑" } as const;
const SORTS = { date: "최신순", op: "영업이익 YoY순", rev: "매출 규모순" } as const;
type Params = { q: string; view: keyof typeof VIEWS; min: keyof typeof MINS; size: keyof typeof SIZES; sort: keyof typeof SORTS };
const DEFAULTS: Params = { q: "", view: "grow", min: "0", size: "100", sort: "date" };

// 항목별 판정: 전년 동기 대비 증가(흑자전환 포함) / 판단 불가(값이 없음) / 미달
function judge(now: number | null, prev: number | null, yoy: number | null, turn: string | null, min: number) {
  if (now == null || prev == null) return "none";
  return (yoy != null && yoy > min) || (turn ?? "").includes("흑자") ? "up" : "fail";
}

// 매출·영업이익·당기순이익이 모두 늘어난 곳. 없는 항목이 있으면 나머지 둘만으로 판단 (두 항목 이상 필요)
function grows(r: UsEarningsRow, p: Params) {
  const min = Number(p.min);
  const j = [
    judge(r.revenue, r.revenue_prev_y, r.revenue_yoy, null, min),
    judge(r.op, r.op_prev_y, r.op_yoy, r.op_turn, min),
    judge(r.ni, r.ni_prev_y, r.ni_yoy, r.ni_turn, min),
  ];
  return !j.includes("fail") && j.filter((x) => x === "up").length >= 2;
}

// 백만 달러 → 억 달러
const usd = (v: number | null) => (v == null ? "-" : `${num(v / 100, Math.abs(v) < 1000 ? 1 : 0)}억$`);

function Item({ r, watch }: { r: UsEarningsRow; watch: Set<string> }) {
  const opm = r.revenue && r.op != null ? (r.op / r.revenue) * 100 : null;
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        {watch.has(r.ticker) ? (
          <Link href={`/stocks/${r.ticker}`} className="font-medium hover:underline">
            <span className="text-amber-500">★</span> {r.name}
          </Link>
        ) : (
          <span className="font-medium">{r.name}</span>
        )}
        <span className="text-xs text-zinc-500">
          {r.ticker} · 회계분기 말 {r.end_date ?? "-"} · {r.derived_q4 ? "연간-3분기 계산" : (r.form ?? "보고서")} {r.filed ?? ""}
        </span>
        {r.url && (
          <a href={r.url} target="_blank" rel="noreferrer" className="text-xs text-zinc-400 underline hover:text-zinc-600">
            SEC 원문
          </a>
        )}
      </div>
      <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm tabular-nums sm:grid-cols-4">
        <div>
          <span className="text-xs text-zinc-500">매출액 </span>
          {usd(r.revenue)} <Pct v={r.revenue_yoy} />
          <div className="text-[11px] text-zinc-400">전년 동기 {usd(r.revenue_prev_y)}</div>
        </div>
        <div>
          <span className="text-xs text-zinc-500">영업이익 </span>
          {usd(r.op)} <Pct v={r.op_yoy} turn={r.op_turn} />
          <div className="text-[11px] text-zinc-400">전년 동기 {usd(r.op_prev_y)}</div>
        </div>
        <div>
          <span className="text-xs text-zinc-500">순이익 </span>
          {usd(r.ni)} <Pct v={r.ni_yoy} turn={r.ni_turn} />
          <div className="text-[11px] text-zinc-400">전년 동기 {usd(r.ni_prev_y)}</div>
        </div>
        <div>
          <span className="text-xs text-zinc-500">영업이익률 </span>
          {opm == null ? "-" : `${num(opm, 1)}%`}
        </div>
      </div>
      <EarningsNote id={r.id} note={r.note} us />
    </li>
  );
}

export default async function UsEarningsPage({ searchParams }: PageProps<"/earnings/us">) {
  const sp = await searchParams;
  const p = { ...DEFAULTS };
  for (const [k, opts] of [["view", VIEWS], ["min", MINS], ["size", SIZES], ["sort", SORTS]] as const) {
    const v = sp[k];
    if (typeof v === "string" && v in opts) (p as Record<string, string>)[k] = v;
  }
  const quarters = recentQuarters(daysAgo(0), 5);
  const [count, watchItems] = await Promise.all([countUsEarnings(quarters, Number(p.size)), getWatchItems()]);
  // 기본은 실적이 있는 가장 최근 분기 (발표 시즌 초반엔 막 시작한 분기 대신 바로 앞 분기)
  p.q = typeof sp.q === "string" && quarters.includes(sp.q) ? sp.q : (quarters.find((q) => (count.get(q) ?? 0) >= 50) ?? quarters[1]);
  const all = await getUsEarnings(p.q);
  const watch = new Set(watchItems.filter((w) => w.market === "US").map((w) => w.ticker));
  const href = (patch: Partial<Params>) => `/earnings/us?${new URLSearchParams({ ...p, ...patch })}`;
  const rows = all.filter((r) => (r.revenue ?? 0) >= Number(p.size));
  let shown = p.view === "grow" ? rows.filter((r) => grows(r, p)) : p.view === "memo" ? rows.filter((r) => r.note) : rows;
  if (p.sort === "op") shown = [...shown].sort((a, b) => (b.op_yoy ?? -Infinity) - (a.op_yoy ?? -Infinity));
  if (p.sort === "rev") shown = [...shown].sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0));
  const group = (label: string, opts: Record<string, string>, key: keyof Params) => (
    <div className="flex flex-wrap items-center gap-1 text-sm">
      <span className="mr-1 text-xs text-zinc-400">{label}</span>
      {Object.entries(opts).map(([k, v]) => (
        <Link key={k} href={href({ [key]: k })} scroll={false} className={chip(p[key] === k)}>
          {v}
        </Link>
      ))}
    </div>
  );

  return (
    <>
      <SetupNotice />
      <MarketTabs us />
      <Card title="분기 실적 (미국 상장사, SEC 10-Q·10-K)">
        <div className="mb-3 space-y-2">
          {group("보기", VIEWS, "view")}
          <div className="flex flex-wrap items-center gap-1 text-sm">
            <span className="mr-1 text-xs text-zinc-400">분기</span>
            {quarters.map((q) => (
              <Link key={q} href={href({ q })} scroll={false} className={chip(p.q === q)}>
                {qLabel(q)} <span className="text-[11px] opacity-60">{count.get(q) ?? 0}</span>
              </Link>
            ))}
          </div>
          {group("분기 매출", SIZES, "size")}
          {p.view === "grow" && group("최소 증가율", MINS, "min")}
          {group("정렬", SORTS, "sort")}
        </div>
        <p className="mb-2 text-xs text-zinc-500">
          {qLabel(p.q)} 실적 (통상 {qSeason(p.q, true)} 제출) · {shown.length}개 기업 (실적 {rows.length}개 기업 중)
          {p.view === "grow" && ` · 분기 매출액·영업이익·당기순이익이 모두 전년 동기 대비 ${p.min}% 넘게 늘어난 곳(이익은 흑자전환 포함, 없는 항목은 빼고 나머지 둘로 판단)`}
        </p>
        {shown.length === 0 ? (
          <Empty>{all.length === 0 ? "아직 수집된 실적이 없음. 수집기가 평일마다 SEC 데이터를 읽어 옴." : "조건에 맞는 기업이 없음."}</Empty>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
            {shown.slice(0, 500).map((r) => (
              <Item key={r.id} r={r} watch={watch} />
            ))}
          </ul>
        )}
        {shown.length > 500 && <p className="mt-2 text-xs text-zinc-500">앞 500개만 표시함. 조건을 좁히면 나머지도 보임.</p>}
        <p className="mt-3 text-xs text-zinc-400">
          SEC XBRL(us-gaap) 분기 실적을 달력 분기에 맞춘 값(회계연도가 다른 회사는 가장 가까운 회계 분기). 4분기 등 10-K에 연간만 있는 분기는 연간에서 세 분기를 뺀 값. 금액은 억 달러. 실적 보도자료(8-K)보다 10-Q 제출이 며칠~몇 주 늦을 수 있음. IFRS로 보고하는 외국 기업(20-F)과 영업이익을 따로 공시하지 않는 은행 등은 빠지거나 영업이익이 비어 있음.
        </p>
      </Card>
    </>
  );
}
