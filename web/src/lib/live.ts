import "server-only";
import type { Price } from "./db";

// 화면을 열 때마다 현재가를 가져옴. 국내는 네이버 실시간 시세, 해외·환율은 Yahoo.
// 같은 주소는 30초 동안 캐시하고, 실패하면 수집기가 저장한 종가(DB)를 그대로 씀
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36";
const opts = () => ({ headers: { "User-Agent": UA }, next: { revalidate: 30 }, signal: AbortSignal.timeout(4000) });

type NaverQuote = { itemCode: string; closePriceRaw: string; fluctuationsRatioRaw: string; localTradedAt: string };

async function naver(codes: string[]): Promise<Price[]> {
  if (!codes.length) return [];
  const res = await fetch(`https://polling.finance.naver.com/api/realtime/domestic/stock/${codes.join(",")}`, opts());
  if (!res.ok) return [];
  const { datas } = (await res.json()) as { datas: NaverQuote[] };
  return datas
    .filter((d) => Number(d.closePriceRaw) > 0)
    .map((d) => ({
      ticker: d.itemCode,
      date: d.localTradedAt.slice(0, 10),
      close: Number(d.closePriceRaw),
      change_pct: Number(d.fluctuationsRatioRaw),
    }));
}

type YahooMeta = { regularMarketPrice?: number; chartPreviousClose?: number; regularMarketTime?: number; gmtoffset?: number };

async function yahoo(symbol: string, ticker = symbol): Promise<Price | null> {
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=5m`, opts());
  if (!res.ok) return null;
  const m = ((await res.json()) as { chart: { result?: { meta: YahooMeta }[] } }).chart.result?.[0]?.meta;
  if (!m?.regularMarketPrice || !m.regularMarketTime) return null;
  return {
    ticker,
    date: new Date((m.regularMarketTime + (m.gmtoffset ?? 0)) * 1000).toISOString().slice(0, 10),
    close: m.regularMarketPrice,
    change_pct: m.chartPreviousClose ? (m.regularMarketPrice / m.chartPreviousClose - 1) * 100 : null,
  };
}

const settle = async <T>(p: Promise<T>, fallback: T) => {
  try {
    return await p;
  } catch {
    return fallback;
  }
};

export async function liveQuotes(items: { ticker: string; market: "KR" | "US" }[]): Promise<Map<string, Price>> {
  const kr = items.filter((i) => i.market === "KR").map((i) => i.ticker);
  const us = items.filter((i) => i.market === "US").map((i) => i.ticker);
  const [k, u] = await Promise.all([settle(naver(kr), []), Promise.all(us.map((t) => settle(yahoo(t), null)))]);
  return new Map([...k, ...u].filter((p): p is Price => !!p).map((p) => [p.ticker, p]));
}

// 원/달러 환율 현재값
export const liveFx = () => settle(yahoo("KRW=X"), null);
