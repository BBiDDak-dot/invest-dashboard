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

// ---------- 기사 전문 (네이버 뉴스 기사 페이지를 읽어 본문만 추림) ----------

export type ArticleBlock = { kind: "text" | "caption"; text: string } | { kind: "img"; src: string };
export type Article = { item: NewsItem; lead: string | null; blocks: ArticleBlock[] };

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " ", "#x3D": "=",
  hellip: "…", middot: "·", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", ndash: "–", mdash: "—",
};
const decode = (s: string) =>
  s
    .replace(/&(#39|#x3D|[a-z]+);/g, (m, k) => ENTITIES[k] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
const strip = (s: string) => decode(s.replace(/<[^>]+>/g, ""));
const meta = (html: string, prop: string) =>
  html.match(new RegExp(`<meta[^>]+(?:property|name)="${prop}"[^>]+content="([^"]*)"`))?.[1] ?? null;

export const isArticleId = (id: string) => /^\d{3}-\d{10}$/.test(id);

export async function getArticle(id: string): Promise<Article | null> {
  if (!isArticleId(id)) return null;
  const [oid, aid] = id.split("-");
  const url = `https://n.news.naver.com/mnews/article/${oid}/${aid}`;
  const r = await fetch(url, { headers: HEADERS, next: { revalidate: 86400 } });
  if (!r.ok) throw new Error(`${r.status}`);
  const html = await r.text();
  const body = html.match(/<article[^>]*id="dic_area"[^>]*>([\s\S]*?)<\/article>/)?.[1];
  if (!body) return null;

  const lead = body.match(/<strong class="media_end_summary">([\s\S]*?)<\/strong>/)?.[1];
  // 사진은 표시용 자리표시로 바꾸고, 줄바꿈 태그는 줄바꿈으로, 나머지 태그는 지움
  const flat = body
    .replace(/<strong class="media_end_summary">[\s\S]*?<\/strong>/, "")
    .replace(/<img[^>]+data-src="([^"]+)"[^>]*>/g, (_, src) => `\n@@IMG ${decode(src)}\n`)
    .replace(/<em class="img_desc">([\s\S]*?)<\/em>/g, (_, t) => `\n@@CAP ${strip(t)}\n`)
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<\/(p|div)>/g, "\n");
  const blocks: ArticleBlock[] = [];
  for (const raw of strip(flat).split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("@@IMG ")) blocks.push({ kind: "img", src: line.slice(6) });
    else if (line.startsWith("@@CAP ")) blocks.push({ kind: "caption", text: line.slice(6) });
    else blocks.push({ kind: "text", text: line });
  }

  const time = html.match(/media_end_head_info_datestamp_time[^>]+data-date-time="([^"]+)"/)?.[1] ?? "";
  return {
    item: {
      id,
      title: decode(meta(html, "og:title") ?? strip(html.match(/media_end_head_headline[^>]*>([\s\S]*?)<\//)?.[1] ?? "")),
      summary: decode(meta(html, "og:description") ?? ""),
      source: decode(meta(html, "og:article:author") ?? meta(html, "twitter:creator") ?? ""),
      time: time.replace(/\D/g, "").slice(0, 12),
      url,
      thumb: null,
    },
    lead: lead ? strip(lead.replace(/<br\s*\/?>/g, "\n")).trim() : null,
    blocks,
  };
}
