import type { MacroRow } from "@/lib/queries";
import { Empty } from "./Card";
import { LineChart } from "./LineChart";

// 유가 선물 곡선: 근월물과 뒤 월물의 차이로 콘탱고·백워데이션을 판단하고 수급 해석을 붙임
const PRODUCTS = [
  { root: "CL", name: "WTI", kind: "crude" },
  { root: "BZ", name: "브렌트유", kind: "crude" },
  { root: "RB", name: "휘발유 RBOB", kind: "product" },
  { root: "HO", name: "경유 ULSD", kind: "product" },
] as const;

type State = { label: string; tone: "back" | "flat" | "contango"; strong: boolean };

// 월평균 스프레드(%/월)로 판단. 원유 보관·금융 비용이 대략 월 0.5~1%라서 −1%/월보다 깊으면 "재고를 쌓아두는 게 이득"인 수준
function classify(perMonth: number): State {
  if (perMonth >= 1) return { label: "강한 백워데이션", tone: "back", strong: true };
  if (perMonth >= 0.25) return { label: "백워데이션", tone: "back", strong: false };
  if (perMonth > -0.25) return { label: "평탄", tone: "flat", strong: false };
  if (perMonth > -1) return { label: "콘탱고", tone: "contango", strong: false };
  return { label: "강한 콘탱고", tone: "contango", strong: true };
}

const TONE_CLASS = {
  back: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  flat: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  contango: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
};

const MEANING = {
  back: "지금 당장 쓸 물량이 부족해 근월물에 웃돈이 붙음. 재고가 줄고 있거나 수요가 강한 상태(현물 타이트).",
  flat: "현물과 먼 월물 가격이 비슷함. 수급이 균형에 가깝거나 방향이 바뀌는 중일 수 있음.",
  contango: "지금 물량이 남아 근월물이 싸고 먼 월물이 비쌈. 재고가 쌓이는 중이거나 수요가 약한 상태(공급 여유).",
};

const pct = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
const monthLabel = (d: string) => `${d.slice(2, 4)}.${d.slice(5, 7)}`;

// 휘발유는 겨울(10~3월)엔 다음 여름용 규격이 비싸서, 경유는 겨울 난방 수요 때문에 계절적으로 곡선이 기울어짐
function seasonalNote(root: string, month: number) {
  if (root === "RB") {
    return month >= 10 || month <= 3
      ? "휘발유는 여름용 규격(증발 규제)이 더 비싸 겨울엔 봄·여름 월물이 높은 게 정상이라, 6개월 대신 차월물 기준으로 판단함."
      : "휘발유는 여름 성수기 뒤 겨울용 규격이 싸져서 이 시기엔 원래 백워데이션 쪽으로 기움. 차월물 기준으로 판단함.";
  }
  if (root === "HO") return "경유는 겨울 난방 수요로 12~2월물이 높게 붙는 계절성이 있음. 가을엔 콘탱고, 겨울이 지나면 백워데이션 쪽으로 기우는 경향.";
  return null;
}

type Item = {
  root: string;
  name: string;
  kind: "crude" | "product";
  curve: MacroRow;
  unit: string;
  state: State;
  perMonth: number;
  m1m2: number;
  m1m6: number;
  history?: MacroRow;
  basis: string;
};

// 원유와 제품의 조합으로 정제 쪽 해석
function overall(items: Item[]) {
  const crude = items.filter((i) => i.kind === "crude");
  const prod = items.filter((i) => i.kind === "product");
  if (!crude.length || !prod.length) return null;
  const avg = (xs: Item[]) => xs.reduce((s, i) => s + i.perMonth, 0) / xs.length;
  const c = classify(avg(crude)).tone;
  const p = classify(avg(prod)).tone;
  if (c === "back" && p === "back") return "원유·제품 모두 백워데이션: 에너지 전반의 현물이 타이트함. 재고가 줄고 유가 하방이 단단한 국면. 생산·정유 기업에 유리, 롱 선물 ETF는 롤오버 이익.";
  if (c === "back" && p !== "back") return "원유는 타이트한데 제품은 여유: 원료는 비싸고 최종 수요(휘발유·경유)는 약함. 정제마진이 눌릴 수 있는 조합.";
  if (c !== "back" && p === "back") return "원유는 여유인데 제품은 타이트: 정제 설비·제품 재고가 병목. 정제마진(크랙)이 강해지는 조합으로 정유주에 우호적.";
  if (c === "contango" && p === "contango") return "원유·제품 모두 콘탱고: 공급이 수요보다 많아 재고가 쌓이는 국면. 유가 반등 힘이 약하고 롱 선물 ETF는 롤오버 손실.";
  return "뚜렷한 쏠림 없이 균형에 가까움. 스프레드가 어느 쪽으로 벌어지는지 추세를 볼 것.";
}

export function OilCurve({ rows }: { rows: MacroRow[] }) {
  const byId = new Map(rows.map((r) => [r.series_id, r]));
  const items: Item[] = [];
  for (const p of PRODUCTS) {
    const curve = byId.get(`CURVE:${p.root}`);
    if (!curve || curve.history.length < 6) continue;
    const h = curve.history;
    const m1m2 = (h[0].value / h[1].value - 1) * 100;
    const m1m6 = (h[0].value / h[5].value - 1) * 100;
    const useM2 = p.root === "RB"; // 휘발유는 계절 규격 차이가 커서 차월물 기준
    const perMonth = useM2 ? m1m2 : m1m6 / 5;
    items.push({
      ...p,
      curve,
      unit: curve.unit ?? "",
      state: classify(perMonth),
      perMonth,
      m1m2,
      m1m6,
      history: byId.get(`CURVE:${p.root}:${useM2 ? "M1M2" : "M1M6"}`),
      basis: useM2 ? "근월물 ÷ 차월물" : "근월물 ÷ 6개월물",
    });
  }
  if (items.length === 0) return <Empty>선물 곡선이 아직 수집되지 않음. 수집기를 한 번 실행하면 표시됨.</Empty>;

  const month = new Date().getMonth() + 1;
  const summary = overall(items);
  return (
    <>
      {summary && (
        <div className="mb-4 rounded-md bg-zinc-50 p-3 text-sm dark:bg-zinc-900">
          <div className="mb-1 flex flex-wrap gap-1.5">
            {items.map((i) => (
              <span key={i.root} className={`rounded px-1.5 py-0.5 text-xs ${TONE_CLASS[i.state.tone]}`}>
                {i.name} {i.state.label}
              </span>
            ))}
          </div>
          <p>{summary}</p>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((i) => {
          const h = i.curve.history;
          const hist = i.history?.history ?? [];
          const note = seasonalNote(i.root, month);
          return (
            <div key={i.root} className="min-w-0 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-sm font-medium">{i.name} 선물 곡선</div>
                <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${TONE_CLASS[i.state.tone]}`}>{i.state.label}</span>
              </div>
              <div className="mb-1 text-xs text-zinc-500 tabular-nums">
                근월물 {h[0].value.toFixed(2)} {i.unit} · 차월물 대비 {pct(i.m1m2)} · 6개월물 대비 {pct(i.m1m6)}
              </div>
              <p className="mb-2 text-xs text-zinc-600 dark:text-zinc-400">{MEANING[i.state.tone]}</p>
              <LineChart
                labels={h.map((o) => monthLabel(o.date))}
                series={[{ name: `${i.name} (${i.unit})`, color: "var(--series-1)", values: h.map((o) => o.value) }]}
                height={180}
                decimals={2}
              />
              {hist.length >= 2 && (
                <>
                  <div className="mt-3 mb-1 text-xs text-zinc-500">
                    스프레드 추이 ({i.basis} − 1, +면 백워데이션)
                  </div>
                  <LineChart
                    labels={hist.map((o) => o.date)}
                    series={[{ name: "스프레드 %", color: "var(--series-2)", values: hist.map((o) => o.value) }]}
                    height={140}
                    decimals={2}
                  />
                </>
              )}
              {note && <p className="mt-2 text-xs text-zinc-400">{note}</p>}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-zinc-400">
        곡선 가로축은 인도월(근월물→12개월 뒤). 오른쪽으로 내려가면 백워데이션(현물 부족), 올라가면 콘탱고(공급 여유). 판정은 월평균 스프레드
        기준: +0.25%/월 이상 백워데이션, −0.25%/월 이하 콘탱고, ±1%/월을 넘으면 &ldquo;강한&rdquo;(원유 보관·금융 비용이 대략 월 0.5~1%라 그보다 깊은
        콘탱고는 재고를 쌓아두는 게 이득인 수준). 출처: Yahoo NYMEX 개별 월물 종가.
      </p>
    </>
  );
}
