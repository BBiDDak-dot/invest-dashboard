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

// 표시 단위: 원화는 억원, 달러는 백만달러, 위안화는 억위안 (GRT 등 외국 기업은 자국 통화로 공시)
export function moneyUnit(currency: string | null | undefined) {
  if (currency === "USD") return { div: 1e6, label: "백만달러" };
  if (currency === "CNY") return { div: 1e8, label: "억위안" };
  if (!currency || currency === "KRW") return { div: 1e8, label: "억원" };
  return { div: 1e6, label: `백만 ${currency}` };
}

export type QuarterRow = {
  period: string;
  revenue: number | null;
  operatingIncome: number | null;
  margin: number | null; // 영업이익률 %
  revenueYoy: number | null; // 매출 전년 동기 대비 %
  opYoy: number | null;
};

// 분기별 표: 최근 분기부터, 전년 동기(12개월 전) 대비 증감률 포함
export function quarterRows(fin: Financial[], limit = 8): QuarterRow[] {
  const q = [...fin].filter((f) => f.revenue != null || f.operating_income != null).sort((a, b) => a.period_end.localeCompare(b.period_end));
  const byMonth = new Map(q.map((f) => [monthIndex(f.period_end), f]));
  const yoy = (now: number | null, prev: number | null | undefined) =>
    now != null && prev != null && prev > 0 ? (now / prev - 1) * 100 : null;
  return q
    .map((f) => {
      const prev = byMonth.get(monthIndex(f.period_end) - 12);
      return {
        period: f.period_end.slice(0, 7),
        revenue: f.revenue,
        operatingIncome: f.operating_income,
        margin: f.revenue && f.operating_income != null ? (f.operating_income / f.revenue) * 100 : null,
        revenueYoy: yoy(f.revenue, prev?.revenue),
        opYoy: yoy(f.operating_income, prev?.operating_income),
      };
    })
    .reverse()
    .slice(0, limit);
}
