import Link from "next/link";
import { Card } from "@/components/Card";
import { ClipList } from "@/components/ClipList";
import { NewsList } from "@/components/NewsList";
import { getCategoryNews, getStockNews, NEWS_CATEGORIES, type NewsCategory, type NewsItem } from "@/lib/news";
import type { NewsClip, NewsNote } from "@/lib/db";
import { getNewsClips, getNewsNotes, getWatchItems } from "@/lib/queries";

type Tab = "industry" | NewsCategory | "mine" | "notes";
const TABS: Record<Tab, string> = {
  industry: "산업 클리핑",
  ...Object.fromEntries(Object.entries(NEWS_CATEGORIES).map(([k, v]) => [k, v.label])),
  mine: "내 종목",
  notes: "내 메모",
} as Record<Tab, string>;

// 메모해 둔 기사를 뉴스 목록 형태로
const noteToItem = (n: NewsNote): NewsItem => ({
  id: n.id,
  title: n.title,
  summary: n.summary ?? "",
  source: n.source ?? "",
  time: n.news_time ?? "",
  url: n.url,
  thumb: null,
});

const pill = (on: boolean) =>
  `rounded-md px-3 py-1 ${on ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"}`;

// ---------- 산업 클리핑 ----------

const CLIP_CATS = ["수요", "상용화", "사업모델", "생산성", "경쟁·공급망", "제도"] as const;
const CLIP_DAYS = { "2": "이틀", "7": "1주" } as const;
const REGIONS = ["국내", "해외"] as const;
const COMPANY_CAP = 2; // 한 회사 기사는 최대 2건 (특정 대형주 쏠림 방지)

type ClipParams = { cat: string; region: string; ind: string; days: keyof typeof CLIP_DAYS };

// 구체적 사례(3점)를 먼저, 같은 점수 안에서는 산업을 번갈아 놓아 한 산업이 위를 다 차지하지 않게 함
function arrange(clips: NewsClip[]) {
  const perCompany = new Map<string, number>();
  const kept = clips.filter((c) => {
    const names = c.companies ?? [];
    if (names.some((n) => (perCompany.get(n) ?? 0) >= COMPANY_CAP)) return false;
    names.forEach((n) => perCompany.set(n, (perCompany.get(n) ?? 0) + 1));
    return true;
  });
  const out: NewsClip[] = [];
  for (const score of [3, 2]) {
    const byInd = new Map<string, NewsClip[]>();
    for (const c of kept.filter((c) => (c.score ?? 0) === score)) {
      const k = c.industry ?? "기타";
      byInd.set(k, [...(byInd.get(k) ?? []), c]);
    }
    const queues = [...byInd.values()];
    for (let i = 0; queues.some((q) => q.length > i); i++) queues.forEach((q) => q[i] && out.push(q[i]));
  }
  return { list: out, hidden: clips.length - kept.length };
}

async function IndustryClips({ sp, notes }: { sp: Record<string, string | string[] | undefined>; notes?: Map<string, string> }) {
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const p: ClipParams = {
    cat: (CLIP_CATS as readonly string[]).includes(str(sp.cat)) ? str(sp.cat) : "",
    region: (REGIONS as readonly string[]).includes(str(sp.region)) ? str(sp.region) : "",
    ind: str(sp.ind),
    days: str(sp.days) in CLIP_DAYS ? (str(sp.days) as ClipParams["days"]) : "2",
  };
  const all = await getNewsClips(Number(p.days)).catch(() => null);
  if (!all) return <p className="text-sm text-zinc-500">클리핑 테이블이 아직 없음. supabase/migrations/010_news_clips.sql을 실행할 것.</p>;
  const filtered = all.filter((c) => (!p.cat || c.category === p.cat) && (!p.region || c.region === p.region) && (!p.ind || c.industry === p.ind));
  const { list, hidden } = arrange(filtered);
  const industries = [...new Set(all.map((c) => c.industry).filter((x): x is string => !!x && x !== "기타"))].sort();
  const href = (patch: Partial<ClipParams>) => {
    const q = new URLSearchParams(Object.entries({ tab: "industry", ...p, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/news?${q}`;
  };
  const chips = (label: string, key: keyof ClipParams, opts: [string, string][]) => (
    <div className="flex flex-wrap items-center gap-1 text-sm">
      <span className="mr-1 text-xs text-zinc-400">{label}</span>
      {opts.map(([v, text]) => (
        <Link key={v || "all"} href={href({ [key]: v })} scroll={false} className={pill(p[key] === v)}>
          {text}
        </Link>
      ))}
    </div>
  );
  return (
    <>
      <div className="mb-3 space-y-2">
        {chips("유형", "cat", [["", "전체"], ...CLIP_CATS.map((c) => [c, c] as [string, string])])}
        {chips("지역", "region", [["", "전체"], ...REGIONS.map((r) => [r, r] as [string, string])])}
        {industries.length > 0 && chips("산업", "ind", [["", "전체"], ...industries.map((i) => [i, i] as [string, string])])}
        {chips("기간", "days", Object.entries(CLIP_DAYS))}
      </div>
      <p className="mb-2 text-xs text-zinc-500">
        {list.length}건{hidden > 0 && ` (같은 회사 기사 ${hidden}건은 ${COMPANY_CAP}건까지만 남김)`}
      </p>
      <ClipList clips={list} notes={notes} empty={all.length === 0 ? "아직 수집된 기사가 없음. 수집기가 평일 06:30·16:40에 모음." : "조건에 맞는 기사가 없음."} />
    </>
  );
}

// 내 종목: TOP PICK·보유 중인 국내 종목의 뉴스를 최신순으로 합침
async function myNews(): Promise<{ items: NewsItem[]; names: Map<string, string>; count: number }> {
  const items = await getWatchItems().catch(() => []);
  const mine = items.filter((i) => i.market === "KR" && (i.starred || (i.quantity ?? 0) > 0));
  const names = new Map<string, string>();
  const lists = await Promise.all(
    mine.map(async (i) => {
      const news = await getStockNews(i.ticker, 5).catch(() => []);
      news.forEach((n) => names.set(n.id, names.has(n.id) ? names.get(n.id)! : i.name));
      return news;
    }),
  );
  const seen = new Set<string>();
  const merged = lists
    .flat()
    .filter((n) => (seen.has(n.id) ? false : (seen.add(n.id), true)))
    .sort((a, b) => b.time.localeCompare(a.time))
    .slice(0, 40);
  return { items: merged, names, count: mine.length };
}

export default async function NewsPage({ searchParams }: PageProps<"/news">) {
  const sp = await searchParams;
  const t = sp.tab;
  const tab: Tab = typeof t === "string" && t in TABS ? (t as Tab) : "industry";
  // 006 SQL을 아직 안 돌렸으면 null → 메모 칸을 숨김
  const noteRows = await getNewsNotes().catch(() => null);
  const notes = noteRows ? new Map(noteRows.map((n) => [n.id, n.note])) : undefined;
  let body: React.ReactNode;
  if (tab === "industry") {
    body = <IndustryClips sp={sp} notes={notes} />;
  } else if (tab === "notes") {
    body = !noteRows ? (
      <p className="text-sm text-zinc-500">메모 테이블이 아직 없음. supabase/migrations/006_news_notes.sql을 실행할 것.</p>
    ) : (
      <NewsList items={noteRows.map(noteToItem)} thumbs={false} notes={notes} empty="아직 메모한 기사가 없음. 기사 아래 ✎ 메모를 눌러 남길 것." />
    );
  } else if (tab === "mine") {
    const { items, names, count } = await myNews();
    body =
      count === 0 ? (
        <p className="text-sm text-zinc-500">TOP PICK이나 보유 중인 국내 종목이 없음.</p>
      ) : (
        <NewsList items={items} thumbs={false} tag={(n) => names.get(n.id)} notes={notes} />
      );
  } else {
    const items = await getCategoryNews(tab).catch(() => []);
    body = <NewsList items={items} notes={notes} />;
  }
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">뉴스</h1>
        <div className="flex flex-wrap gap-1 text-sm">
          {(Object.keys(TABS) as Tab[]).map((k) => (
            <Link key={k} href={k === "industry" ? "/news" : `/news?tab=${k}`} className={pill(k === tab)}>
              {TABS[k]}
            </Link>
          ))}
        </div>
      </div>
      <Card
        title={
          tab === "industry"
            ? "산업 변화 클리핑 · 국내·해외 산업 매체에서 수요·상용화·사업모델·생산성·경쟁·제도 변화를 보여 주는 기사"
            : tab === "notes" ? "메모한 기사 (최근 메모순)" : tab === "mine" ? "TOP PICK·보유 국내 종목 뉴스 (최신순)" : `${NEWS_CATEGORIES[tab].note} · 10분마다 갱신`
        }
      >
        {body}
      </Card>
    </>
  );
}
