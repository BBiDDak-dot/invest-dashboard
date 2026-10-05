import Link from "next/link";
import { Card } from "@/components/Card";
import { NewsList } from "@/components/NewsList";
import { getCategoryNews, getStockNews, NEWS_CATEGORIES, type NewsCategory, type NewsItem } from "@/lib/news";
import type { NewsNote } from "@/lib/db";
import { getNewsNotes, getWatchItems } from "@/lib/queries";

type Tab = NewsCategory | "mine" | "notes";
const TABS: Record<Tab, string> = {
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
  const t = (await searchParams).tab;
  const tab: Tab = typeof t === "string" && t in TABS ? (t as Tab) : "main";
  // 006 SQL을 아직 안 돌렸으면 null → 메모 칸을 숨김
  const noteRows = await getNewsNotes().catch(() => null);
  const notes = noteRows ? new Map(noteRows.map((n) => [n.id, n.note])) : undefined;
  let body: React.ReactNode;
  if (tab === "notes") {
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
            <Link key={k} href={k === "main" ? "/news" : `/news?tab=${k}`} className={pill(k === tab)}>
              {TABS[k]}
            </Link>
          ))}
        </div>
      </div>
      <Card
        title={
          tab === "notes" ? "메모한 기사 (최근 메모순)" : tab === "mine" ? "TOP PICK·보유 국내 종목 뉴스 (최신순)" : `${NEWS_CATEGORIES[tab].note} · 10분마다 갱신`
        }
      >
        {body}
      </Card>
    </>
  );
}
