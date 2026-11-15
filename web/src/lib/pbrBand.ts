import "server-only";
import { select, selectAll } from "./db";
import { daysAgo } from "./queries";

export type BpsRow = { fy_end: string; bps: number; estimate: boolean; source: string | null; updated_at: string };

export type PbrBand = {
  labels: string[]; // 주간 날짜
  close: number[];
  fwdBps: (number | null)[];
  multiples: number[]; // 밴드 배수 (예: 0.8, 1.0, 1.2 ...)
  current: { date: string; close: number; bps: number; pbr: number; percentile: number } | null;
  stats: { min: number; max: number; avg: number } | null;
  bps: BpsRow[];
  flatTail: boolean; // 마지막 추정치보다 먼 미래가 필요해 마지막 값을 그대로 쓴 구간이 있음
};

const DAY = 86400_000;
const YEARS = 5;

// 날짜 t의 12M Fwd BPS = (t + 12개월) 시점의 BPS를 결산일 BPS 사이에서 선형 보간.
// 12월 결산이면 FY1·FY2를 남은 개월 수로 가중한 값과 같음.
export function fwdBpsAt(t: number, pts: { d: number; v: number }[]): { v: number; flat: boolean } | null {
  const target = t + 365 * DAY;
  if (pts.length === 0 || target < pts[0].d) return null;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (target <= b.d) return { v: a.v + ((b.v - a.v) * (target - a.d)) / (b.d - a.d), flat: false };
  }
  const last = pts.at(-1)!;
  // 마지막 결산일이 오늘 이후면(추정치) 그 값으로 대신함. 이미 지난 실적뿐이면 밴드를 그리지 않음.
  return last.d >= t ? { v: last.v, flat: true } : null;
}

// 보기 좋은 배수 5개 (최저~최고 PBR을 덮도록)
export function bandMultiples(min: number, max: number): number[] {
  const raw = (max - min) / 4 || max * 0.1 || 0.1;
  const steps = [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10];
  const step = steps.find((s) => s >= raw) ?? raw;
  let lo = Math.floor(min / step) * step;
  if (lo + 4 * step < max) lo = max - 4 * step; // 반올림 때문에 최고점이 밖으로 나가면 위로 당김
  lo = Math.max(0, Math.round(lo / step) * step);
  return Array.from({ length: 5 }, (_, i) => Math.round((lo + i * step) * 100) / 100);
}

export async function getPbrBand(ticker: string, liveClose?: number): Promise<PbrBand | null> {
  const t = encodeURIComponent(ticker);
  const bps = await select<BpsRow>("bps_annual", `select=fy_end,bps,estimate,source,updated_at&ticker=eq.${t}&order=fy_end`).catch(() => null);
  if (!bps || bps.length === 0) return null;
  const prices = await selectAll<{ date: string; close: number }>(
    "prices",
    `select=date,close&ticker=eq.${t}&date=gte.${daysAgo(365 * YEARS)}&order=date`,
  );
  // 주간(그 주 마지막 거래일)으로 줄여 그림을 가볍게
  const weekly: { date: string; close: number }[] = [];
  for (const p of prices) {
    const wk = Math.floor((Date.parse(p.date) / DAY + 3) / 7); // 월요일 시작 주 번호
    const prev = weekly.at(-1);
    if (prev && Math.floor((Date.parse(prev.date) / DAY + 3) / 7) === wk) weekly[weekly.length - 1] = p;
    else weekly.push(p);
  }
  const today = new Date().toISOString().slice(0, 10);
  if (liveClose && weekly.length && weekly.at(-1)!.date < today) weekly.push({ date: today, close: liveClose });
  else if (liveClose && weekly.length) weekly[weekly.length - 1] = { date: weekly.at(-1)!.date, close: liveClose };

  const pts = bps.map((b) => ({ d: Date.parse(b.fy_end), v: Number(b.bps) })).filter((p) => p.v > 0);
  let flatTail = false;
  const fwd = weekly.map((p) => {
    const r = fwdBpsAt(Date.parse(p.date), pts);
    if (r?.flat) flatTail = true;
    return r ? Math.round(r.v) : null;
  });
  const pbrs = weekly.map((p, i) => (fwd[i] ? Number(p.close) / fwd[i]! : null)).filter((v): v is number => v != null);
  const lastI = weekly.length - 1;
  const cur = lastI >= 0 && fwd[lastI] ? { date: weekly[lastI].date, close: Number(weekly[lastI].close), bps: fwd[lastI]!, pbr: Number(weekly[lastI].close) / fwd[lastI]! } : null;
  const stats = pbrs.length ? { min: Math.min(...pbrs), max: Math.max(...pbrs), avg: pbrs.reduce((a, b) => a + b, 0) / pbrs.length } : null;

  return {
    labels: weekly.map((p) => p.date),
    close: weekly.map((p) => Number(p.close)),
    fwdBps: fwd,
    multiples: stats ? bandMultiples(stats.min, stats.max) : [],
    current: cur && { ...cur, percentile: (pbrs.filter((v) => v <= cur.pbr).length / pbrs.length) * 100 },
    stats,
    bps,
    flatTail,
  };
}
