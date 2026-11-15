import "server-only";
import { select, selectAll } from "./db";
import { daysAgo } from "./queries";

export type BpsRow = { fy_end: string; bps: number; estimate: boolean; source: string | null; updated_at: string };

export type PbrBand = {
  mode: "fwd" | "trailing"; // trailing = 컨센서스가 없어 최근 실적 BPS로 그림
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
export function fwdBpsAt(t: number, pts: { d: number; v: number }[], horizonDays = 365): { v: number; flat: boolean } | null {
  const target = t + horizonDays * DAY;
  if (pts.length === 0 || target < pts[0].d) return null;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (target <= b.d) return { v: a.v + ((b.v - a.v) * (target - a.d)) / (b.d - a.d), flat: false };
  }
  const last = pts.at(-1)!;
  // 12M Fwd: 마지막 결산일이 오늘 이후면(추정치) 그 값으로 대신함. 이미 지난 실적뿐이면 밴드를 그리지 않음.
  // trailing(horizon 0): 마지막 실적 BPS를 그대로 씀.
  return last.d >= t || horizonDays === 0 ? { v: last.v, flat: horizonDays > 0 } : null;
}

// 밴드 배수 5개: 5년 최저~최고 PBR을 고르게 나눈 값(단위에 맞춰 반올림)
export function bandMultiples(min: number, max: number): number[] {
  const unit = max < 1 ? 0.05 : max < 5 ? 0.1 : 0.5;
  const lo = Math.floor(min / unit) * unit;
  const hi = Math.ceil(max / unit) * unit;
  const step = Math.max(unit, Math.ceil((hi - lo) / 4 / unit - 1e-9) * unit);
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
  // 컨센서스(오늘 이후 결산 추정치)가 없으면 12M Fwd 대신 실적 BPS 기준 밴드
  const mode = bps.some((b) => b.estimate && b.fy_end >= today) ? "fwd" : "trailing";
  let flatTail = false;
  const fwd = weekly.map((p) => {
    const r = fwdBpsAt(Date.parse(p.date), pts, mode === "fwd" ? 365 : 0);
    if (r?.flat) flatTail = true;
    return r ? Math.round(r.v) : null;
  });
  const pbrs = weekly.map((p, i) => (fwd[i] ? Number(p.close) / fwd[i]! : null)).filter((v): v is number => v != null);
  const lastI = weekly.length - 1;
  const cur = lastI >= 0 && fwd[lastI] ? { date: weekly[lastI].date, close: Number(weekly[lastI].close), bps: fwd[lastI]!, pbr: Number(weekly[lastI].close) / fwd[lastI]! } : null;
  const stats = pbrs.length ? { min: Math.min(...pbrs), max: Math.max(...pbrs), avg: pbrs.reduce((a, b) => a + b, 0) / pbrs.length } : null;

  return {
    mode,
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
