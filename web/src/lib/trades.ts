// 매매 일지 계산: 매매 기록을 순서대로 쌓아 종목별 보유수량·매입단가(이동평균)와 매도별 실현손익을 구함.
// 매수 수수료는 매입단가에 넣고, 매도 수수료·세금은 실현손익에서 뺌.

export type Trade = {
  id: number;
  ticker: string;
  market: "KR" | "US";
  name: string;
  trade_date: string;
  side: "open" | "buy" | "sell";
  price: number;
  quantity: number;
  fee: number;
  fx: number | null;
  cash_applied: boolean;
  reason: string | null;
  created_at: string;
};

export type Position = { quantity: number; avgPrice: number | null };
export type Realized = { pnl: number; pnlKrw: number | null; returnPct: number | null; avgPrice: number };

const EPS = 1e-9;

// open(기초 잔고)을 맨 앞에, 나머지는 날짜·입력 순
function order(a: Trade, b: Trade) {
  const rank = (t: Trade) => (t.side === "open" ? 0 : 1);
  return rank(a) - rank(b) || a.trade_date.localeCompare(b.trade_date) || a.id - b.id;
}

export function buildLedger(trades: Trade[], currentFx: number | null = null) {
  const positions = new Map<string, Position>();
  const realized = new Map<number, Realized>();
  let error: string | null = null;
  for (const t of [...trades].sort(order)) {
    const p = positions.get(t.ticker) ?? { quantity: 0, avgPrice: null };
    const q = Number(t.quantity);
    const price = Number(t.price);
    const fee = Number(t.fee ?? 0);
    if (t.side === "sell") {
      if (q > p.quantity + EPS) {
        error ??= `${t.name} ${t.trade_date} 매도 ${q}주가 그때 보유수량 ${p.quantity}주보다 많음`;
        continue;
      }
      const avg = p.avgPrice ?? 0;
      const pnl = (price - avg) * q - fee;
      const toKrw = t.market === "US" ? (t.fx ?? currentFx) : 1;
      realized.set(t.id, {
        pnl,
        pnlKrw: toKrw != null ? pnl * toKrw : null,
        returnPct: avg ? (pnl / (avg * q)) * 100 : null,
        avgPrice: avg,
      });
      const left = p.quantity - q;
      positions.set(t.ticker, left < EPS ? { quantity: 0, avgPrice: null } : { quantity: left, avgPrice: p.avgPrice });
    } else {
      const cost = (p.avgPrice ?? 0) * p.quantity + price * q + fee;
      const quantity = p.quantity + q;
      positions.set(t.ticker, { quantity, avgPrice: cost / quantity });
    }
  }
  return { positions, realized, error };
}

// 현금 변화(원): 매수는 빠지고 매도는 들어옴. 기초 잔고는 현금과 무관
export function cashDelta(t: Pick<Trade, "side" | "price" | "quantity" | "fee" | "fx" | "market">): number {
  if (t.side === "open") return 0;
  const toKrw = t.market === "US" ? (t.fx ?? 0) : 1;
  const gross = Number(t.price) * Number(t.quantity);
  const fee = Number(t.fee ?? 0);
  return (t.side === "buy" ? -(gross + fee) : gross - fee) * toKrw;
}

// 현금 입금·출금 (원)
export type CashFlow = {
  id: number;
  flow_date: string;
  kind: "deposit" | "withdraw";
  amount: number;
  memo: string | null;
  cash_applied: boolean;
  created_at: string;
};

export const flowDelta = (f: Pick<CashFlow, "kind" | "amount">) => (f.kind === "deposit" ? 1 : -1) * Number(f.amount);

// 수수료·세금 자동 계산 (요율은 %, 포트폴리오에서 바꿀 수 있음. 기본값은 나무증권 온라인)
export type FeeRates = { kr: number; us: number };
export const DEFAULT_FEE_RATES: FeeRates = { kr: 0.0036396, us: 0.25 }; // 국내: 유관기관 제비용 포함, 미국: 표준
export const KR_SELL_TAX_PCT = 0.2; // 2026년부터 코스피(거래세 0.05+농특세 0.15)·코스닥 모두 0.20%

// 국내는 원 단위 버림, 미국은 센트 반올림. 미국 매도 SEC fee는 0.001% 안팎이라 뺌
export function estimateFee(market: "KR" | "US", side: "buy" | "sell", price: number, quantity: number, rates: FeeRates) {
  const gross = price * quantity;
  if (!(gross > 0)) return 0;
  if (market === "KR") return Math.floor((gross * rates.kr) / 100) + (side === "sell" ? Math.floor((gross * KR_SELL_TAX_PCT) / 100) : 0);
  return Math.round(gross * rates.us) / 100;
}

// 수익률은 시간가중(TWR): 순자산 기록 사이 구간마다 수익률을 구해 곱해 나감. 구간 안 입금·출금은 절반만 원금에 더함
// (구간 수익률 = (기말 − 기초 − 입출금) / (기초 + 입출금/2)). 입출금 규모·시점과 무관하게 운용 성과만 봄.
// 입출금은 flow_date 기준으로 그날 기록 구간에 넣음.
export const RETURN_FIRST_YEAR = 2026;
export type Snapshot = { snap_date: string; net_worth: number };
export type YearReturn = {
  year: number;
  start: number;
  startDate: string;
  end: number;
  endDate: string;
  netFlow: number;
  gain: number;
  returnPct: number | null;
  live: boolean; // 올해: 기말 = 지금 순자산
  partial: boolean; // 기초가 전년 말이 아니라 그해 첫 기록
};

// 순자산 기록 + 오늘 실시간 순자산 (오늘 기록은 실시간 값으로 대체)
export function withLive(snapshots: Snapshot[], netWorth: number, today: string): Snapshot[] {
  const snaps = snapshots.filter((s) => s.snap_date < today).sort((a, b) => a.snap_date.localeCompare(b.snap_date));
  return [...snaps, { snap_date: today, net_worth: netWorth }];
}

export type GrowthPoint = { date: string; netWorth: number; invested: number; netFlow: number; returnPct: number };

// 자산 변동 그래프용: 시점별 순자산, 원금(첫 기록 순자산 + 이후 순입금), 첫 기록부터 누적 TWR(%)
export function growthSeries(points: Snapshot[], flows: CashFlow[]): GrowthPoint[] {
  if (!points.length) return [];
  const out: GrowthPoint[] = [];
  let index = 1;
  let netFlow = 0;
  const first = Number(points[0].net_worth);
  points.forEach((p, i) => {
    const v1 = Number(p.net_worth);
    if (i > 0) {
      const prev = points[i - 1];
      const v0 = Number(prev.net_worth);
      const f = flows.filter((x) => x.flow_date > prev.snap_date && x.flow_date <= p.snap_date).reduce((s, x) => s + flowDelta(x), 0);
      const denom = v0 + f / 2;
      if (denom > 0) index *= 1 + (v1 - v0 - f) / denom;
      netFlow += f;
    }
    out.push({ date: p.snap_date, netWorth: v1, invested: first + netFlow, netFlow, returnPct: (index - 1) * 100 });
  });
  return out;
}

export function yearlyReturns(snapshots: Snapshot[], flows: CashFlow[], netWorth: number, today: string): YearReturn[] {
  const points = withLive(snapshots, netWorth, today);
  const out: YearReturn[] = [];
  const thisYear = Number(today.slice(0, 4));
  for (let year = RETURN_FIRST_YEAR; year <= thisYear; year++) {
    const prior = points.filter((s) => s.snap_date < `${year}-01-01`).at(-1);
    const inYear = points.filter((s) => s.snap_date.startsWith(`${year}-`));
    const span = prior ? [prior, ...inYear] : inYear;
    if (span.length < 2) continue;
    const g = growthSeries(span, flows).at(-1)!;
    const base = span[0];
    const close = span.at(-1)!;
    const start = Number(base.net_worth);
    const end = Number(close.net_worth);
    out.push({
      year,
      start,
      startDate: base.snap_date,
      end,
      endDate: close.snap_date,
      netFlow: g.netFlow,
      gain: end - start - g.netFlow,
      returnPct: g.returnPct,
      live: year === thisYear,
      partial: !prior,
    });
  }
  return out.reverse();
}
