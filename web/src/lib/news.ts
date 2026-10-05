// 네이버 증권 뉴스 (모바일 API). 수집기 없이 화면을 열 때 가져오고 10분간 캐시함.

export type NewsItem = {
  id: string;
  title: string;
  summary: string;
  source: string;
  time: string; // YYYYMMDDHHmm(ss)
  url: string;
  thumb: string | null;
};

export const NEWS_CATEGORIES = {
  main: { label: "주요 뉴스", category: "mainnews", note: "네이버 증권 편집 주요 뉴스" },
  rank: { label: "많이 본 뉴스", category: "ranknews", note: "네이버 증권 많이 본 뉴스" },
  flash: { label: "실시간 속보", category: "flashnews", note: "네이버 증권 실시간 속보" },
} as const;
export type NewsCategory = keyof typeof NEWS_CATEGORIES;

const HEADERS = { "User-Agent": "Mozilla/5.0" };

async function getJson(url: string): Promise<unknown> {
  const r = await fetch(url, { headers: HEADERS, next: { revalidate: 600 } });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

type ListRow = { tit?: string; subcontent?: string; ohnm?: string; oid?: string; aid?: string; dt?: string; thumbUrl?: string | null };

// 카테고리 뉴스 (주요·많이 본·속보)
export async function getCategoryNews(cat: NewsCategory, size = 30): Promise<NewsItem[]> {
  const rows = (await getJson(
    `https://m.stock.naver.com/api/news/list?category=${NEWS_CATEGORIES[cat].category}&pageSize=${size}&page=1`,
  )) as ListRow[];
  return rows
    .filter((r) => r.tit && r.oid && r.aid)
    .map((r) => ({
      id: `${r.oid}-${r.aid}`,
      title: r.tit!,
      summary: (r.subcontent ?? "").trim(),
      source: r.ohnm ?? "",
      time: r.dt ?? "",
      url: `https://n.news.naver.com/mnews/article/${r.oid}/${r.aid}`,
      thumb: r.thumbUrl ?? null,
    }));
}

type StockCluster = {
  items?: { officeId?: string; articleId?: string; officeName?: string; datetime?: string; title?: string; titleFull?: string; body?: string; mobileNewsUrl?: string; imageOriginLink?: string }[];
};

// 국내 종목 뉴스 (같은 사건을 묶은 묶음마다 대표 기사 하나)
export async function getStockNews(ticker: string, size = 10): Promise<NewsItem[]> {
  const rows = (await getJson(`https://m.stock.naver.com/api/news/stock/${ticker}?pageSize=${size}&page=1`)) as StockCluster[];
  return rows
    .map((c) => c.items?.[0])
    .filter((i): i is NonNullable<typeof i> => !!i?.title && !!i.mobileNewsUrl)
    .map((i) => ({
      id: `${i.officeId}-${i.articleId}`,
      title: i.titleFull || i.title!,
      summary: (i.body ?? "").trim(),
      source: i.officeName ?? "",
      time: i.datetime ?? "",
      url: i.mobileNewsUrl!,
      thumb: i.imageOriginLink ?? null,
    }));
}

// "20261005150500" → "10/05 15:05"
export function newsTime(t: string) {
  if (t.length < 12) return "";
  return `${t.slice(4, 6)}/${t.slice(6, 8)} ${t.slice(8, 10)}:${t.slice(10, 12)}`;
}
