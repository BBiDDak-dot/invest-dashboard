import {
  inList,
  select,
  type Disclosure,
  type Financial,
  type MacroObservation,
  type MacroSeries,
  type MarketFlow,
  type Price,
  type Report,
  type WatchItem,
} from "./db";

const FX_SERIES = "YF:KRW=X"; // 원/달러 환율 (관심종목 화면 상단에도 표시)

const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);

export type Ratios = { debtRatio: number | null; reserveRatio: number | null };
export type WatchRow = WatchItem & { latest?: Price; history: number[]; upside: number | null } & Ratios;

// 최신 분기 재무상태표로 부채비율·유보율 계산
export function ratios(fin: Financial[]): Ratios {
  const bs = [...fin].reverse().find((f) => f.total_equity);
  if (!bs?.total_equity) return { debtRatio: null, reserveRatio: null };
  return {
    debtRatio: bs.total_liabilities != null ? (bs.total_liabilities / bs.total_equity) * 100 : null,
    reserveRatio: bs.capital_stock ? ((bs.total_equity - bs.capital_stock) / bs.capital_stock) * 100 : null,
  };
}

export async function getWatchItems(): Promise<WatchItem[]> {
  return select<WatchItem>("watchlist", "select=*&order=sort_order,group_name.nullslast,market,ticker");
}

export async function getWatchlist(): Promise<WatchRow[]> {
  const [items, latest, fins] = await Promise.all([
    getWatchItems(),
    select<Price>("latest_prices", "select=ticker,date,close,change_pct"),
    select<Financial>("financials_quarterly", `select=*&period_end=gte.${daysAgo(800)}&order=period_end`),
  ]);
  const byTicker = new Map(latest.map((p) => [p.ticker, p]));
  // 종목별로 따로 조회 (PostgREST 기본 최대 1000행 제한 때문)
  const histories = await Promise.all(items.map((i) => getPrices(i.ticker, 365)));
  return items.map((i, n) => {
    const p = byTicker.get(i.ticker);
    return {
      ...i,
      latest: p,
      history: histories[n].map((h) => h.close),
      upside: p && i.target_price ? (i.target_price / p.close - 1) * 100 : null,
      ...ratios(fins.filter((f) => f.ticker === i.ticker)),
    };
  });
}

export async function getWatchItem(ticker: string): Promise<WatchItem | undefined> {
  return (await select<WatchItem>("watchlist", `select=*&ticker=eq.${encodeURIComponent(ticker)}`))[0];
}

export async function getPrices(ticker: string, days: number): Promise<Price[]> {
  return select<Price>(
    "prices",
    `select=ticker,date,close,change_pct&ticker=eq.${encodeURIComponent(ticker)}&date=gte.${daysAgo(days)}&order=date`,
  );
}

export async function getFinancials(tickers: string[]): Promise<Financial[]> {
  if (tickers.length === 0) return [];
  return select<Financial>("financials_quarterly", `select=*&ticker=${inList(tickers)}&order=period_end`);
}

export async function getFx(): Promise<MacroObservation | undefined> {
  return (await select<MacroObservation>("macro_observations", `select=*&series_id=eq.${encodeURIComponent(FX_SERIES)}&order=date.desc&limit=1`))[0];
}

export type MacroRow = MacroSeries & { history: MacroObservation[] };

// 화면 표시 순서 (없는 지표는 뒤로)
const MACRO_ORDER = [
  "YF:^TNX",
  "FRED:DFEDTARU",
  "FRED:T10YIE",
  "FRED:CPILFESL",
  "ISM:MANUFACTURING_PMI",
  "YF:CL=F",
  FX_SERIES,
];

export async function getMacro(days = 365 * 3): Promise<MacroRow[]> {
  const series = await select<MacroSeries>("macro_series", "select=*");
  const rank = (id: string) => (MACRO_ORDER.indexOf(id) + 1 || 99);
  series.sort((a, b) => rank(a.series_id) - rank(b.series_id));
  return Promise.all(
    series.map(async (s) => {
      const history = await select<MacroObservation>(
        "macro_observations",
        `select=series_id,date,value&series_id=eq.${encodeURIComponent(s.series_id)}&date=gte.${daysAgo(days)}&order=date`,
      );
      return { ...s, history };
    }),
  );
}

export async function getDisclosures(limit = 20, ticker?: string): Promise<Disclosure[]> {
  const filter = ticker ? `&ticker=eq.${encodeURIComponent(ticker)}` : "";
  return select<Disclosure>("disclosures", `select=*${filter}&order=date.desc&limit=${limit}`);
}

export async function getFlows(market: MarketFlow["market"], days: number): Promise<MarketFlow[]> {
  return select<MarketFlow>("market_flows", `select=*&market=eq.${market}&date=gte.${daysAgo(days)}&order=date`);
}

export async function getReports(limit = 60): Promise<Omit<Report, "summary">[]> {
  return select("reports", `select=id,created_at,report_date,file_names,title,model&order=created_at.desc&limit=${limit}`);
}

export async function getReport(id: string): Promise<Report | undefined> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return undefined;
  return (await select<Report>("reports", `select=*&id=eq.${id}`))[0];
}
