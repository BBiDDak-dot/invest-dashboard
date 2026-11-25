import { PbrBandPlot } from "@/components/PbrBandPlot";
import { num } from "@/lib/format";
import type { PbrBand } from "@/lib/pbrBand";

// 밴드 선은 낮은 배수→높은 배수로 점점 진해지는 회청색, 주가는 주황으로 구분
const BAND_COLORS = ["#b8c4d6", "#93a5c0", "#6e86aa", "#4a6894", "#26497e"];

export function PbrBandChart({ band, name }: { band: PbrBand | null; name: string }) {
  if (!band || !band.stats || band.multiples.length === 0) {
    return (
      <p className="py-4 text-sm text-zinc-500">
        BPS 데이터가 아직 없음. 수집기(평일 16:40·06:30)가 네이버 증권 기업정보에서 가져온 뒤 표시됨.
      </p>
    );
  }
  const { current, stats } = band;
  const fwd = band.mode === "fwd";
  const label = fwd ? "12M Fwd" : "실적 기준";
  const est = band.bps.filter((b) => b.estimate);
  const updated = band.bps.map((b) => b.updated_at).sort().at(-1)?.slice(0, 10);
  const series = [
    ...band.multiples.map((m, i) => ({
      name: `${Number.isInteger(Math.round(m * 100) / 10) ? m.toFixed(1) : m.toFixed(2)}x`,
      color: BAND_COLORS[i],
      values: band.fwdBps.map((b) => (b == null ? null : Math.round(b * m))),
    })),
    { name: "주가", color: "var(--series-2)", values: band.close },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        {[
          [`현재 ${label} PBR`, current ? `${num(current.pbr, 2)}x` : "-"],
          [`${band.years}년 위치`, current ? `하위 ${num(current.percentile, 0)}%` : "-"],
          [`${band.years}년 평균 / 범위`, `${num(stats.avg, 2)}x · ${num(stats.min, 2)}~${num(stats.max, 2)}`],
          [`${label} BPS`, current ? `${num(current.bps, 0)}원` : "-"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-md bg-zinc-50 p-2.5 dark:bg-zinc-900">
            <div className="text-xs text-zinc-500">{k}</div>
            <div className="mt-0.5 font-semibold tabular-nums">{v}</div>
          </div>
        ))}
      </div>
      <PbrBandPlot labels={band.labels} series={series} name={name} />
      <p className="text-xs leading-relaxed text-zinc-500">
        {fwd ? (
          <>
            12M Fwd BPS = 12개월 뒤 시점의 BPS를 결산기 BPS 사이에서 보간한 값(연간 BPS를 남은 개월 수로 가중). 지난 구간은 실제 BPS로 계산한 사후 값이라
            당시 컨센서스와 다를 수 있음. 추정치: {est.filter((b) => b.fy_end.slice(0, 4) >= String(new Date().getFullYear())).map((b) => `${b.fy_end.slice(0, 4)}E ${num(b.bps, 0)}원`).join(", ")}
            {band.flatTail && " · 마지막 추정치 이후 구간은 그 값을 그대로 씀"}
          </>
        ) : (
          "증권사 컨센서스가 없어 12M Fwd 대신 결산기 실적 BPS를 이어 붙인 값으로 그림(최근 결산 이후는 마지막 실적 BPS)"
        )}
        {" · 출처 "}
        {band.bps.at(-1)?.source === "naver" ? "네이버 증권" : "네이버 증권 기업정보(와이즈리포트)"}
        {band.bps.some((b) => b.source === "dart") &&
          `, ${band.bps.filter((b) => b.source === "dart").map((b) => b.fy_end.slice(0, 4)).join("·").replace(/^(\d{4}).*·(\d{4})$/, "$1~$2")}년은 DART 사업보고서(지배주주 자본÷유통주식수, 분할 수정)`}
        {updated && `, ${updated} 수집`}.
      </p>
    </div>
  );
}
