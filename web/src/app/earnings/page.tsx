import Link from "next/link";
import { Card, Empty } from "@/components/Card";
import { EarningsNote } from "@/components/EarningsNote";
import { SetupNotice } from "@/components/SetupNotice";
import type { EarningsRow } from "@/lib/db";
import { num } from "@/lib/format";
import { daysAgo, getEarnings, getWatchItems } from "@/lib/queries";
import { chip, MarketTabs, Pct, qLabel, qSeason, recentQuarters } from "./shared";

const VIEWS = { grow: "동반 성장", all: "전체", memo: "메모" } as const;
const MINS = { "0": "0%↑", "10": "10%↑", "30": "30%↑" } as const;
const SORTS = { date: "최신순", op: "영업이익 YoY순" } as const;
type Params = { q: string; view: keyof typeof VIEWS; min: keyof typeof MINS; sort: keyof typeof SORTS };
const DEFAULTS: Params = { q: "", view: "grow", min: "0", sort: "date" };

// 같은 회사·같은 분기 공시가 여러 건(잠정실적, 정기보고서, 정정)이면 가장 먼저 나온 공시 하나만.
// 같은 날 여러 건이면 연결 기준을 고름
function firstDisclosures(rows: EarningsRow[]) {
  const first = new Map<string, EarningsRow>();
  const earlier = (a: EarningsRow, b: EarningsRow) =>
    a.date !== b.date ? a.date < b.date : a.consolidated !== b.consolidated ? !!a.consolidated : a.id < b.id;
  for (const r of rows) {
    const k = `${r.stock_code ?? r.corp_name}|${r.period ?? r.date}`;
    const cur = first.get(k);
    if (!cur || earlier(r, cur)) first.set(k, r);
  }
  return [...first.values()];
}

// 공시 종류: 잠정실적 / 분기보고서 / 반기보고서 / 사업보고서
const kind = (title: string) => (title.includes("잠정") ? "잠정실적" : (title.match(/분기보고서|반기보고서|사업보고서/)?.[0] ?? "공시"));

// 기준: 분기 실적의 전년 동기 대비(YoY). 영업이익이 적자→흑자로 돌아선 경우도 성장으로 봄
const turned = (r: EarningsRow) => (r.op_turn ?? "").includes("흑자");

function grows(r: EarningsRow, p: Params) {
  const min = Number(p.min);
  return r.revenue_yoy != null && r.revenue_yoy > min && ((r.op_yoy != null && r.op_yoy > min) || turned(r));
}

function Item({ r, watch }: { r: EarningsRow; watch: Set<string> }) {
  const opm = r.revenue && r.op != null ? (r.op / r.revenue) * 100 : null;
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        {r.stock_code && watch.has(r.stock_code) ? (
          <Link href={`/stocks/${r.stock_code}`} className="font-medium hover:underline">
            <span className="text-amber-500">★</span> {r.corp_name}
          </Link>
        ) : (
          <span className="font-medium">{r.corp_name}</span>
        )}
        <span className="text-xs text-zinc-500">
          {r.market} · {r.period ?? "-"} · {r.consolidated ? "연결" : "별도"} · {kind(r.title)} {r.date}
        </span>
        <a href={r.url} target="_blank" rel="noreferrer" className="text-xs text-zinc-400 underline hover:text-zinc-600">
          공시 원문
        </a>
      </div>
      <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm tabular-nums sm:grid-cols-3">
        <div>
          <span className="text-xs text-zinc-500">매출액 </span>
          {num(r.revenue, 0)}억 <Pct v={r.revenue_yoy} />
          <div className="text-[11px] text-zinc-400">전년 동기 {num(r.revenue_prev_y, 0)}억</div>
        </div>
        <div>
          <span className="text-xs text-zinc-500">영업이익 </span>
          {num(r.op, 0)}억 <Pct v={r.op_yoy} turn={r.op_turn} />
          <div className="text-[11px] text-zinc-400">전년 동기 {num(r.op_prev_y, 0)}억</div>
        </div>
        <div>
          <span className="text-xs text-zinc-500">영업이익률 </span>
          {opm == null ? "-" : `${num(opm, 1)}%`}
        </div>
      </div>
      <EarningsNote id={r.id} note={r.note} />
    </li>
  );
}

export default async function EarningsPage({ searchParams }: PageProps<"/earnings">) {
  const sp = await searchParams;
  const p = { ...DEFAULTS };
  for (const [k, opts] of [["view", VIEWS], ["min", MINS], ["sort", SORTS]] as const) {
    const v = sp[k];
    if (typeof v === "string" && v in opts) (p as Record<string, string>)[k] = v;
  }
  const quarters = recentQuarters(daysAgo(0), 5);
  // 다섯 분기 전 실적 발표가 시작된 시점부터 읽으면 됨 (정정 공시가 늦게 나와도 최초 공시만 쓰므로 충분)
  const [all, watchItems] = await Promise.all([getEarnings(5 * 92 + 31), getWatchItems()]);
  const watch = new Set(watchItems.filter((w) => w.market === "KR").map((w) => w.ticker));
  const firsts = firstDisclosures(all);
  const count = new Map<string, number>();
  for (const r of firsts) if (r.period) count.set(r.period, (count.get(r.period) ?? 0) + 1);
  // 기본은 공시가 있는 가장 최근 분기 (발표 시즌 초반엔 바로 앞 분기가 아니라 막 시작한 분기)
  p.q = typeof sp.q === "string" && quarters.includes(sp.q) ? sp.q : (quarters.find((q) => count.get(q)) ?? quarters[0]);
  const href = (patch: Partial<Params>) => `/earnings?${new URLSearchParams({ ...p, ...patch })}`;
  const rows = firsts.filter((r) => r.period === p.q);
  let shown = p.view === "grow" ? rows.filter((r) => grows(r, p)) : p.view === "memo" ? rows.filter((r) => r.note) : rows;
  if (p.sort === "op") shown = [...shown].sort((a, b) => (b.op_yoy ?? -Infinity) - (a.op_yoy ?? -Infinity));
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
      <MarketTabs us={false} />
      <Card title="분기 실적 최초 공시 (코스피·코스닥)">
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
          {p.view === "grow" && group("최소 증가율", MINS, "min")}
          {group("정렬", SORTS, "sort")}
        </div>
        <p className="mb-2 text-xs text-zinc-500">
          {qLabel(p.q)} 실적 (통상 {qSeason(p.q)} 발표) · {shown.length}개 기업 (실적 공시 {rows.length}개 기업 중)
          {p.view === "grow" && ` · 분기 매출액과 영업이익이 모두 전년 동기 대비 ${p.min}% 넘게 늘었거나 영업이익이 흑자전환한 곳`}
        </p>
        {shown.length === 0 ? (
          <Empty>
            {all.length === 0 ? "아직 수집된 실적 공시가 없음. 수집기가 평일마다 새 공시를 읽어 옴." : "조건에 맞는 기업이 없음."}
          </Empty>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
            {shown.map((r) => (
              <Item key={r.id} r={r} watch={watch} />
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-zinc-400">
          DART 영업(잠정)실적 공시와 분기·반기·사업보고서 중 회사·분기마다 가장 먼저 나온 공시의 해당 분기(3개월) 실적. 4분기는 연간에서 3분기 누적을 뺀 값. 금액은 억원. 자회사 실적 공시와 12월 결산이 아닌 회사의 정기보고서는 제외.
        </p>
      </Card>
    </>
  );
}
