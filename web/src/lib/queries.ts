import {
  select,
  type Disclosure,
  type MacroObservation,
  type MacroSeries,
  type Price,
  type WatchItem,
} from "./db";

export type WatchRow = WatchItem & { latest?: Price };

export async function getWatchlist(): Promise<WatchRow[]> {
  const [items, prices] = await Promise.all([
    select<WatchItem>("watchlist", "select=ticker,market,name&order=market,ticker"),
    select<Price>("latest_prices", "select=ticker,date,close,change_pct"),
  ]);
  const byTicker = new Map(prices.map((p) => [p.ticker, p]));
  return items.map((i) => ({ ...i, latest: byTicker.get(i.ticker) }));
}

export type MacroRow = MacroSeries & { history: MacroObservation[] };

export async function getMacro(points = 24): Promise<MacroRow[]> {
  const series = await select<MacroSeries>("macro_series", "select=*&order=country,series_id");
  return Promise.all(
    series.map(async (s) => {
      const obs = await select<MacroObservation>(
        "macro_observations",
        `select=series_id,date,value&series_id=eq.${encodeURIComponent(s.series_id)}&order=date.desc&limit=${points}`,
      );
      return { ...s, history: obs.reverse() };
    }),
  );
}

export async function getDisclosures(limit = 20): Promise<Disclosure[]> {
  return select<Disclosure>("disclosures", `select=*&order=date.desc&limit=${limit}`);
}
