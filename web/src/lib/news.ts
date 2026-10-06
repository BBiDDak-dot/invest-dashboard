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

// ---------- 일반 언론사 기사 (산업 클리핑) ----------
// 사이트마다 구조가 달라서, 본문일 가능성이 큰 영역을 찾은 뒤 문단(<p>)과 사진만 뽑음

export const isClipId = (id: string) => /^[0-9a-f]{20}$/.test(id);

const BODY_HINT =
  /<(article|div|section)[^>]+(?:itemprop="articleBody"|(?:class|id)="[^"]*(?:article[-_]?body|articleBody|article[-_]?content|article[-_]?view|article[-_]?txt|news[-_]?body|news[-_]?content|art[-_]?body|entry[-_]?content|post[-_]?content|story[-_]?body|view[-_]?cont|cont[-_]?body|article_txt|body[-_]?text)[^"]*")[^>]*>/i;

// 여는 태그 위치부터 짝이 맞는 닫는 태그까지 잘라냄
function element(html: string, start: number, tag: string) {
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
  re.lastIndex = start;
  let depth = 0;
  for (let m; (m = re.exec(html)); ) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index);
  }
  return html.slice(start);
}

const absolute = (src: string, base: string) => {
  try {
    return new URL(decode(src), base).href;
  } catch {
    return null;
  }
};

function blocksOf(region: string, base: string): ArticleBlock[] {
  const out: ArticleBlock[] = [];
  const re = /<p\b[^>]*>([\s\S]*?)<\/p>|<img\b([^>]*)>|<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/gi;
  for (let m; (m = re.exec(region)); ) {
    if (m[2] !== undefined) {
      const src = m[2].match(/(?:data-src|data-original|src)="([^"]+)"/)?.[1];
      const abs = src && !src.startsWith("data:") && !/logo|icon|banner|blank|pixel|\.gif/i.test(src) ? absolute(src, base) : null;
      if (abs) out.push({ kind: "img", src: abs });
    } else if (m[3] !== undefined) {
      const t = strip(m[3]).trim();
      if (t) out.push({ kind: "caption", text: t });
    } else {
      for (const line of strip(m[1].replace(/<br\s*\/?>/gi, "\n")).split("\n")) {
        const t = line.trim();
        if (t) out.push({ kind: "text", text: t });
      }
    }
  }
  // <p> 없이 <br>로만 문단을 나누는 사이트(한국경제 등)는 줄 단위로 다시 뽑음
  if (textLen(out) < 300) {
    const flat = region
      .replace(/<img\b[^>]*>/gi, "")
      .replace(/<figcaption\b[\s\S]*?<\/figcaption>/gi, "")
      .replace(/<br\s*\/?>|<\/(p|div|li|h\d)>/gi, "\n");
    const lines = strip(flat).split("\n").map((t) => t.trim()).filter(Boolean);
    const alt: ArticleBlock[] = [...out.filter((b) => b.kind === "img"), ...lines.map((text) => ({ kind: "text" as const, text }))];
    if (textLen(alt) > textLen(out)) return alt;
  }
  return out;
}

const textLen = (b: ArticleBlock[]) => b.reduce((n, x) => n + (x.kind === "text" ? x.text.length : 0), 0);

// 일부 언론사는 브라우저가 아닌 요청을 막아서 브라우저처럼 보냄
const BROWSER = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
};
const JUNK = /^(ⓒ|©|Copyright|무단\s?전재|ADVERTISEMENT$|광고$|FTC: We use|Your personalized solar quotes|Charge your electric vehicle at home|If you’re considering going solar)/i;
const HANGUL = /[가-힣]/;

// 국내 기사 뒤에 붙는 번역본(영문·불어 등)은 잘라냄: 한글 기사인데 한글 없는 긴 문단이 나오면 거기까지
function trimTranslations(blocks: ArticleBlock[]) {
  const texts = blocks.filter((b) => b.kind === "text") as { text: string }[];
  if (!texts[0] || !HANGUL.test(texts.slice(0, 3).map((t) => t.text).join(""))) return blocks;
  const cut = blocks.findIndex((b) => b.kind === "text" && b.text.length >= 60 && !HANGUL.test(b.text));
  return cut > 0 ? blocks.slice(0, cut) : blocks;
}

export async function getPageArticle(url: string): Promise<Omit<Article, "item"> | null> {
  const r = await fetch(url, { headers: BROWSER, next: { revalidate: 86400 } });
  if (!r.ok) throw new Error(`${r.status}`);
  const buf = await r.arrayBuffer();
  // 일부 국내 사이트는 EUC-KR
  let html = new TextDecoder("utf-8").decode(buf);
  const charset = (r.headers.get("content-type") ?? "").match(/charset=([\w-]+)/i)?.[1] ?? html.slice(0, 3000).match(/charset="?([\w-]+)/i)?.[1];
  if (charset && !/utf-?8/i.test(charset)) {
    try {
      html = new TextDecoder(charset).decode(buf);
    } catch {}
  }
  html = html.replace(/<(script|style|noscript|nav|header|footer|aside|form|button|iframe)\b[\s\S]*?<\/\1>/gi, "").replace(/<!--[\s\S]*?-->/g, "");

  const candidates: string[] = [];
  // itemprop="articleBody"가 가장 정확해서 먼저 봄 (감싸는 큰 영역보다 우선)
  const prop = html.match(/<(article|div|section)[^>]+itemprop="articleBody"[^>]*>/i);
  if (prop?.index !== undefined) candidates.push(element(html, prop.index, prop[1]));
  const hint = html.match(BODY_HINT);
  if (hint?.index !== undefined) candidates.push(element(html, hint.index, hint[1]));
  const art = html.search(/<article\b/i);
  if (art >= 0) candidates.push(element(html, art, "article"));
  candidates.push(html.match(/<body\b[\s\S]*$/i)?.[0] ?? html);

  for (const c of candidates) {
    let blocks = blocksOf(c, url);
    // 본문 밖 짧은 문단(메뉴, 저작권 안내 등) 정리: 전체 페이지에서 뽑을 땐 짧은 줄을 버림
    if (c === candidates[candidates.length - 1]) blocks = blocks.filter((b) => b.kind !== "text" || b.text.length >= 40);
    blocks = trimTranslations(blocks.filter((b) => b.kind !== "text" || !JUNK.test(b.text)));
    if (textLen(blocks) >= 300) return { lead: null, blocks };
  }
  return null;
}
