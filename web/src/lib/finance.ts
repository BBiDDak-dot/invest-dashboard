import type { Financial } from "./db";

export type TtmPoint = { period: string; revenue: number | null; operatingIncome: number | null };

const monthIndex = (d: string) => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7));

// 연속된 4개 분기 합계(TTM). 중간에 빠진 분기가 있으면 그 시점은 건너뜀.
export function ttm(fin: Financial[]): TtmPoint[] {
  const q = [...fin].sort((a, b) => a.period_end.localeCompare(b.period_end));
  const out: TtmPoint[] = [];
  for (let i = 3; i < q.length; i++) {
    const w = q.slice(i - 3, i + 1);
    const contiguous = w.every((f, k) => k === 0 || Math.abs(monthIndex(f.period_end) - monthIndex(w[k - 1].period_end) - 3) <= 1);
    if (!contiguous) continue;
    const sum = (key: "revenue" | "operating_income") =>
      w.every((f) => f[key] != null) ? w.reduce((s, f) => s + (f[key] as number), 0) : null;
    out.push({ period: w[3].period_end.slice(0, 7), revenue: sum("revenue"), operatingIncome: sum("operating_income") });
  }
  return out;
}

// 표시 단위: 원화는 억원, 달러는 백만달러
export function moneyUnit(currency: string | null | undefined) {
  return currency === "USD" ? { div: 1e6, label: "백만달러" } : { div: 1e8, label: "억원" };
}
