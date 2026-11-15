import { LineChart } from "@/components/LineChart";
import { num } from "@/lib/format";
import type { PbrBand } from "@/lib/pbrBand";

// 밴드 선은 낮은 배수→높은 배수로 점점 진해지는 회청색, 주가는 주황으로 구분
const BAND_COLORS = ["#b8c4d6", "#93a5c0", "#6e86aa", "#4a6894", "#26497e"];

export function PbrBandChart({ band }: { band: PbrBand | null }) {
  if (!band || !band.stats || band.multiples.length === 0) {
    return (
      <p className="py-4 text-sm text-zinc-500">
        컨센서스 BPS가 없어 밴드를 그릴 수 없음. 수집기가 다음 수집 때 네이버·FnGuide에서 다시 찾음 (증권사 추정치가 없는 종목은 표시 안 됨).
      </p>
    );
  }
  const { current, stats } = band;
  const est = band.bps.filter((b) => b.estimate);
  const updated = band.bps.map((b) => b.updated_at).sort().at(-1)?.slice(0, 10);
  const series = [
    ...band.multiples.map((m, i) => ({
      name: `${m.toFixed(2).replace(/0$/, "")}x`,
      color: BAND_COLORS[i],
      values: band.fwdBps.map((b) => (b == null ? null : Math.round(b * m))),
    })),
    { name: "주가", color: "var(--series-2)", values: band.close },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        {[
          ["현재 12M Fwd PBR", current ? `${num(current.pbr, 2)}x` : "-"],
          ["5년 위치", current ? `하위 ${num(current.percentile, 0)}%` : "-"],
          ["5년 평균 / 범위", `${num(stats.avg, 2)}x · ${num(stats.min, 2)}~${num(stats.max, 2)}`],
          ["12M Fwd BPS", current ? `${num(current.bps, 0)}원` : "-"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-md bg-zinc-50 p-2.5 dark:bg-zinc-900">
            <div className="text-xs text-zinc-500">{k}</div>
            <div className="mt-0.5 font-semibold tabular-nums">{v}</div>
          </div>
        ))}
      </div>
      <LineChart labels={band.labels} series={series} height={280} decimals={0} />
      <p className="text-xs leading-relaxed text-zinc-500">
        12M Fwd BPS = 12개월 뒤 시점의 BPS를 결산기 BPS 사이에서 보간한 값(연간 BPS를 남은 개월 수로 가중). 지난 구간은 실제 BPS로 계산한 사후 값이라
        당시 컨센서스와 다를 수 있음. 추정치: {est.length ? est.map((b) => `${b.fy_end.slice(0, 4)}E ${num(b.bps, 0)}원`).join(", ") : "없음(실적 BPS만 사용)"}
        {band.flatTail && " · 마지막 추정치 이후 구간은 그 값을 그대로 씀"} · 출처 {band.bps.at(-1)?.source === "fnguide" ? "FnGuide" : "네이버 증권"}
        {updated && `, ${updated} 수집`}.
      </p>
    </div>
  );
}
