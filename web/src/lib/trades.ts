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
