import "server-only";

type Chart = {
  chart: {
    result?: {
      meta: { gmtoffset: number };
      timestamp?: number[];
      indicators: { quote: { close: (number | null)[]; volume: (number | null)[] }[] };
    }[];
  };
};

// 종목 추가 직후 차트가 비지 않도록 1년치 종가를 바로 가져옴 (실패하면 다음 수집 때 채워짐)
export async function fetchYearPrices(ticker: string, market: "KR" | "US") {
  const symbols = market === "US" ? [ticker] : [`${ticker}.KS`, `${ticker}.KQ`];
  for (const symbol of symbols) {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1y&interval=1d`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
    });
    if (!res.ok) continue;
    const r = ((await res.json()) as Chart).chart.result?.[0];
    if (!r?.timestamp?.length) continue;
    const { close, volume } = r.indicators.quote[0];
    const rows = [];
    for (let i = 1; i < r.timestamp.length; i++) {
      const c = close[i];
      const prev = close[i - 1];
      if (c == null || prev == null) continue;
      rows.push({
        ticker,
        date: new Date((r.timestamp[i] + r.meta.gmtoffset) * 1000).toISOString().slice(0, 10),
        close: Math.round(c * 10000) / 10000,
        change_pct: Math.round((c / prev - 1) * 1e6) / 1e4,
        volume: volume[i] ?? null,
      });
    }
    return rows;
  }
  return [];
}
