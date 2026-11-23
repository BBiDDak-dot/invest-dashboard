import type { MacroObservation } from "./db";

// 지표 추세 해석: 지표마다 오를 때·내릴 때 투자적 의미를 적어 두고,
// 최근 3개월 변화로 지금 방향을 판단해 해당 해석을 강조함
type Meaning = {
  up: string;
  down: string;
  // 이 정도 넘게 움직여야 상승/하락으로 봄 (abs=같은 단위 차이, pct=변화율 %)
  threshold: { abs: number } | { pct: number };
  // 수준 자체가 의미 있는 지표 (예: PMI 50, 공포탐욕 25/75)
  level?: (v: number) => string | null;
};

const fearGreedLevel = (v: number) =>
  v <= 25 ? "극단적 공포 구간: 역사적으로 분할 매수 기회였던 경우가 많음" :
  v >= 75 ? "극단적 탐욕 구간: 과열, 신규 매수는 신중히" :
  null;

const fearGreed: Meaning = {
  up: "투자심리 개선, 위험자산 선호 회복. 너무 높아지면 과열 신호",
  down: "투자심리 위축, 위험 회피. 너무 낮아지면 역발상 매수 구간",
  threshold: { abs: 10 },
  level: fearGreedLevel,
};

const credit: Meaning = {
  up: "빚내서 투자하는 개인 증가. 상승장 연료지만 급락 시 반대매매로 낙폭이 커질 수 있음",
  down: "레버리지 축소, 과열 해소. 급감은 반대매매·투매가 지나간 흔적일 수 있음",
  threshold: { pct: 5 },
};

const fper: Meaning = {
  up: "이익 전망 대비 주가가 더 오름 → 비싸짐(기대 선반영). 이익 하향이 겹치면 위험",
  down: "주가 하락 또는 이익 전망 상향 → 싸짐. 이익 전망이 유지되면 매력 증가",
  threshold: { pct: 3 },
};

const fpbr: Meaning = {
  up: "순자산 대비 주가 상승 → 밸류 부담 증가",
  down: "순자산 대비 주가 하락 → 저평가 매력 증가 (1배 근처는 역사적 바닥권)",
  threshold: { pct: 3 },
};

const tper: Meaning = {
  up: "확정 이익 대비 주가가 더 오름 → 비싸짐. Fwd PER보다 많이 높으면 시장이 이익 급증을 기대하는 중",
  down: "주가 하락 또는 실적 증가 → 싸짐. 이익이 꺾이는 중이면 낮아 보여도 함정일 수 있음",
  threshold: { pct: 3 },
};

const tpbr: Meaning = {
  up: "장부 순자산 대비 주가 상승 → 밸류 부담 증가",
  down: "장부 순자산 대비 주가 하락 → 저평가 매력 증가 (국내는 1배 근처가 역사적 바닥권)",
  threshold: { pct: 3 },
};

const MEANINGS: Record<string, Meaning> = {
  "YF:^TNX": {
    up: "할인율 상승 → 성장주·장기채에 부담, 대출·주택 위축. 경기 호조나 물가 우려가 원인",
    down: "할인율 하락 → 성장주·채권에 우호적. 경기 둔화 우려로 내리는 경우도 있어 원인 확인 필요",
    threshold: { abs: 0.2 },
  },
  "FRED:DFEDTARU": {
    up: "긴축(금리 인상): 물가 잡기 우선, 유동성 축소 → 주식·채권 밸류에 부담",
    down: "완화(금리 인하): 유동성 확대 → 위험자산 우호적. 경기 침체 대응 인하면 주의",
    threshold: { abs: 0.01 },
  },
  "FRED:T10YIE": {
    up: "시장이 물가 재상승을 예상 → 금리 인하 여지 축소, 실물자산·원자재 강세 경향",
    down: "물가 둔화 기대 → 금리 인하 여지 확대. 너무 빠른 하락은 경기 둔화 신호",
    threshold: { abs: 0.1 },
  },
  "FRED:CPILFESL": {
    up: "기조 물가 재가속 → 연준 긴축 장기화 우려, 금리 상승 압력",
    down: "기조 물가 둔화 → 금리 인하 명분 강화, 주식·채권에 우호적",
    threshold: { abs: 0.2 },
  },
  "ISM:MANUFACTURING_PMI": {
    up: "제조업 경기 개선 → 경기민감주·원자재 유리. 50 위면 확장",
    down: "제조업 경기 둔화 → 방어주·채권 선호. 50 아래면 위축",
    threshold: { abs: 1.5 },
    level: (v) => (v >= 50 ? "50 이상: 제조업 확장 국면" : "50 미만: 제조업 위축 국면"),
  },
  "YF:CL=F": {
    up: "수요 강세 또는 공급 차질 → 에너지주 유리, 물가 상승 압력(금리에 부담)",
    down: "수요 둔화 또는 공급 증가 → 물가 부담 완화, 정유·항공 등 원가 개선. 급락은 경기 둔화 신호",
    threshold: { pct: 7 },
  },
  "YF:KRW=X": {
    up: "원화 약세(달러 강세) → 수출주 환율 효과, 외국인 자금 이탈 압력, 해외 자산 원화 평가액 증가",
    down: "원화 강세 → 외국인 자금 유입 우호, 수입 물가 안정, 해외 자산 원화 환산액 감소",
    threshold: { pct: 2 },
  },
  "CNN:FEAR_GREED": fearGreed,
  "FG:NASDAQ": fearGreed,
  "FG:KOSPI": fearGreed,
  "FG:KOSDAQ": fearGreed,
  "KOFIA:CREDIT_KOSPI": credit,
  "KOFIA:CREDIT_KOSDAQ": credit,
  "VAL:KOSPI_FPER": fper,
  "VAL:KOSDAQ_FPER": fper,
  "VAL:SPX_FPER": fper,
  "VAL:NDX_FPER": fper,
  "VAL:KOSPI_FPBR": fpbr,
  "VAL:KOSDAQ_FPBR": fpbr,
  "VAL:KOSPI_TPER": tper,
  "VAL:KOSDAQ_TPER": tper,
  "VAL:SPX_TPER": tper,
  "VAL:NDX_TPER": tper,
  "VAL:KOSPI_TPBR": tpbr,
  "VAL:KOSDAQ_TPBR": tpbr,
  "VAL:SPX_TPBR": tpbr,
};

export type Trend = {
  dir: "up" | "down" | "flat";
  since: string; // 비교 기준 날짜
  change: number; // abs면 같은 단위 차이, pct면 변화율 %
  isPct: boolean;
  up: string;
  down: string;
  level: string | null;
};

const LOOKBACK_DAYS = 90;
const MIN_DAYS = 21; // 이력이 이보다 짧으면 판단하지 않음

export function getTrend(seriesId: string, history: MacroObservation[]): Trend | null {
  const m = MEANINGS[seriesId];
  const last = history.at(-1);
  if (!m || !last || last.value === null) return null;
  const level = m.level ? m.level(last.value) : null;
  const t = new Date(last.date).getTime();
  const days = (d: string) => (t - new Date(d).getTime()) / 86400_000;
  // 3개월 전 이전의 가장 가까운 값. 이력이 짧으면 가장 오래된 값
  let base = [...history].reverse().find((h) => h.value !== null && days(h.date) >= LOOKBACK_DAYS);
  if (!base) base = history.find((h) => h.value !== null);
  const isPct = "pct" in m.threshold;
  if (!base || base.value === null || days(base.date) < MIN_DAYS) {
    return { dir: "flat", since: "", change: 0, isPct, up: m.up, down: m.down, level };
  }
  const change = isPct ? ((last.value - base.value) / Math.abs(base.value)) * 100 : last.value - base.value;
  const limit = "pct" in m.threshold ? m.threshold.pct : m.threshold.abs;
  const dir = change >= limit ? "up" : change <= -limit ? "down" : "flat";
  return { dir, since: base.date, change, isPct, up: m.up, down: m.down, level };
}
