import Link from "next/link";
import { Card, Empty } from "@/components/Card";
import type { Disclosure, SignalDisclosure } from "@/lib/db";
import { getDisclosuresSince, getSignalDisclosures, getWatchItems } from "@/lib/queries";

// 수집기(collector/disclosures.py)의 분류와 같은 순서
const CATEGORIES = ["실적", "수주·계약", "내부자 매수", "자사주", "증자·CB", "M&A·지배구조", "5% 지분"];
const DAYS = 14;
const NOISY = "5% 지분"; // 운용사 정기 보고가 대부분이라 전체 보기에선 뺌 (칩을 누르면 볼 수 있음)

const pill = (on: boolean) =>
  `rounded-md px-3 py-1 ${on ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"}`;
const chip = (on: boolean) =>
  `rounded-full border px-2.5 py-0.5 text-xs ${on ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900" : "border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900"}`;
const badge = "mr-1.5 rounded bg-zinc-100 px-1.5 py-0.5 align-middle text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";

function byDate<T extends { date: string }>(rows: T[]) {
  const m = new Map<string, T[]>();
  for (const r of rows) m.set(r.date, [...(m.get(r.date) ?? []), r]);
  return [...m];
}

function weekday(d: string) {
  return "일월화수목금토"[new Date(`${d}T00:00:00Z`).getUTCDay()];
}

function DateGroups<T extends { date: string; id: string }>({ rows, render }: { rows: T[]; render: (r: T) => React.ReactNode }) {
  return (
    <div className="space-y-4">
      {byDate(rows).map(([date, list]) => (
        <section key={date}>
          <h3 className="mb-1 text-xs font-medium text-zinc-500">
            {date} ({weekday(date)}) · {list.length}건
          </h3>
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
            {list.map((r) => (
              <li key={r.id} className="py-2 text-sm">
                {render(r)}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function SignalRow({ d, watched }: { d: SignalDisclosure; watched: boolean }) {
  const noteColor = d.direction === "buy" ? "text-red-600" : d.direction === "sell" ? "text-blue-600" : "text-zinc-500";
  return (
    <div className={watched ? "-mx-2 rounded bg-amber-50 px-2 py-1 dark:bg-amber-950/30" : ""}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className={badge}>{d.category}</span>
        {watched && d.stock_code ? (
          <Link href={`/stocks/${d.stock_code}`} className="font-medium hover:underline">
            ★ {d.corp_name}
          </Link>
        ) : (
          <span className="font-medium">{d.corp_name}</span>
        )}
        <span className="text-xs text-zinc-400">{d.market}</span>
      </div>
      <a href={d.url} target="_blank" rel="noreferrer" className="mt-0.5 block text-zinc-700 hover:underline dark:text-zinc-300">
        {d.title}
      </a>
      {d.note && <div className={`text-xs ${noteColor}`}>{d.note}</div>}
    </div>
  );
}

export default async function DisclosuresPage({ searchParams }: PageProps<"/disclosures">) {
  const sp = await searchParams;
  const tab = sp.tab === "mine" ? "mine" : "signal";
  const cat = typeof sp.cat === "string" && CATEGORIES.includes(sp.cat) ? sp.cat : undefined;
  const items = await getWatchItems().catch(() => []);
  const names = new Map(items.map((i) => [i.ticker, i.name]));

  let body: React.ReactNode;
  if (tab === "mine") {
    const rows: Disclosure[] = await getDisclosuresSince(60).catch(() => []);
    body = (
      <Card title="관심종목 공시 전체 (최근 60일, 국내 DART·미국 SEC)">
        {rows.length === 0 ? (
          <Empty>최근 공시가 없음. 수집기가 돌면 채워짐.</Empty>
        ) : (
          <DateGroups
            rows={rows}
            render={(d) => (
              <>
                <Link href={`/stocks/${encodeURIComponent(d.ticker)}`} className="mr-2 font-medium hover:underline">
                  {names.get(d.ticker) ?? d.ticker}
                </Link>
                <a href={d.url} target="_blank" rel="noreferrer" className="text-zinc-700 hover:underline dark:text-zinc-300">
                  {d.title}
                </a>
              </>
            )}
          />
        )}
      </Card>
    );
  } else {
    let rows: SignalDisclosure[] | null = null;
    try {
      rows = await getSignalDisclosures(DAYS, cat);
    } catch {
      rows = null; // 005 SQL 미실행
    }
    const watched = new Set(items.map((i) => i.ticker));
    const counts = rows ? new Map(CATEGORIES.map((c) => [c, rows!.filter((r) => r.category === c).length])) : null;
    if (rows && !cat) rows = rows.filter((r) => r.category !== NOISY);
    body = (
      <Card title={`투자 시그널 공시 (코스피·코스닥 전체, 최근 ${DAYS}일)`}>
        <div className="mb-3 flex flex-wrap gap-1.5">
          <Link href="/disclosures" className={chip(!cat)}>
            전체
          </Link>
          {CATEGORIES.map((c) => (
            <Link key={c} href={`/disclosures?cat=${encodeURIComponent(c)}`} className={chip(c === cat)}>
              {c}
              {!cat && counts?.get(c) ? <span className="ml-1 opacity-60">{counts.get(c)}</span> : null}
            </Link>
          ))}
        </div>
        {rows === null ? (
          <Empty>공시 테이블이 아직 없음. supabase/migrations/005_signal_disclosures.sql을 실행할 것.</Empty>
        ) : rows.length === 0 ? (
          <Empty>해당하는 공시가 없음. 수집기가 돌면 채워짐.</Empty>
        ) : (
          <>
            <p className="mb-3 text-xs text-zinc-500">★ 노란 줄은 내 관심종목. 내부자는 매수만 모음. 정정·배당·위험 공시는 뺐고, 5% 지분 공시는 칩을 눌러야 보임.</p>
            <DateGroups rows={rows} render={(d) => <SignalRow d={d} watched={!!d.stock_code && watched.has(d.stock_code)} />} />
          </>
        )}
      </Card>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">전자공시</h1>
        <div className="flex flex-wrap gap-1 text-sm">
          <Link href="/disclosures" className={pill(tab === "signal")}>
            시그널 공시
          </Link>
          <Link href="/disclosures?tab=mine" className={pill(tab === "mine")}>
            내 종목
          </Link>
        </div>
      </div>
      {body}
    </>
  );
}
