"use client";

import { useEffect, useRef, useState } from "react";

export type ChartSeries = { name: string; color: string; values: (number | null)[] };

type Props = {
  labels: string[];
  series: ChartSeries[];
  height?: number;
  decimals?: number; // 서버 컴포넌트에서 함수를 넘길 수 없어 소수 자릿수만 받음
  domain?: [number, number]; // y축 범위 고정 (예: 공포탐욕지수 0~100)
};

const PAD = { top: 8, right: 8, bottom: 22, left: 56 };

// 보기 좋은 눈금 간격 (1, 2, 5 × 10^n)
function ticks(min: number, max: number, count = 4) {
  const raw = (max - min) / count || 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out = [];
  const end = Math.ceil(max / step) * step;
  for (let v = Math.floor(min / step) * step; v <= end + step * 0.001; v += step) out.push(Math.round(v / step) * step);
  return out;
}

// 단일 y축 선 그래프. 마우스를 올리면 해당 시점의 값을 보여줌.
export function LineChart({ labels, series, height = 200, decimals = 1, domain }: Props) {
  const format = (v: number) => v.toLocaleString("ko-KR", { maximumFractionDigits: decimals });
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0); // 실제 폭을 잰 뒤에 그림 (휴대폰에서 화면 밖으로 넘치지 않게)
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(200, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const all = series.flatMap((s) => s.values.filter((v): v is number => v != null));
  if (labels.length < 2 || all.length === 0) {
    return <p className="py-6 text-center text-sm text-zinc-500">데이터 없음</p>;
  }

  const yt = domain ? ticks(domain[0], domain[1]) : ticks(Math.min(...all), Math.max(...all));
  const lo = Math.min(yt[0], ...all);
  const hi = Math.max(yt.at(-1)!, ...all);
  const w = width - PAD.left - PAD.right;
  const h = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (i / (labels.length - 1)) * w;
  const y = (v: number) => PAD.top + h - ((v - lo) / (hi - lo || 1)) * h;

  const path = (values: (number | null)[]) =>
    values.reduce((d, v, i) => (v == null ? d : `${d}${d && values[i - 1] != null ? "L" : "M"}${x(i)},${y(v)}`), "");

  const xLabelIdx = Array.from(new Set([0, ...[1, 2, 3].map((k) => Math.round(((labels.length - 1) * k) / 4)), labels.length - 1]));

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - rect.left) / rect.width) * (labels.length - 1));
    setHover(Math.min(labels.length - 1, Math.max(0, i)));
  }

  return (
    <div ref={ref} className="relative w-full min-w-0">
      {series.length >= 2 && (
        <div className="mb-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
          {series.map((s) => (
            <span key={s.name} className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
      {width === 0 ? (
        <div style={{ height }} />
      ) : (
        <svg width={width} height={height} className="block overflow-visible">
          {yt.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--chart-zero)" : "var(--chart-grid)"} />
              <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-zinc-500 text-[10px] tabular-nums">
                {format(t)}
              </text>
            </g>
          ))}
          {xLabelIdx.map((i) => (
            <text
              key={i}
              x={x(i)}
              y={height - 6}
              textAnchor={i === 0 ? "start" : i === labels.length - 1 ? "end" : "middle"}
              className="fill-zinc-500 text-[10px]"
            >
              {/* 날짜는 축에 연-월만 표시 (툴팁은 전체 날짜) */}
              {/^\d{4}-\d{2}-\d{2}$/.test(labels[i]) ? labels[i].slice(0, 7) : labels[i]}
            </text>
          ))}
          {series.map((s) => (
            <path key={s.name} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {hover != null && (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + h} stroke="var(--chart-zero)" strokeDasharray="3 3" />
              {series.map((s) =>
                s.values[hover] == null ? null : (
                  <circle key={s.name} cx={x(hover)} cy={y(s.values[hover]!)} r={4} fill={s.color} stroke="var(--background)" strokeWidth={2} />
                ),
              )}
            </g>
          )}
          <rect
            x={PAD.left}
            y={PAD.top}
            width={w}
            height={h}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
      )}
      {hover != null && (
        <div
          className="pointer-events-none absolute top-6 z-10 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
          style={x(hover) > width / 2 ? { right: width - x(hover) + 8 } : { left: x(hover) + 8 }}
        >
          <div className="mb-0.5 text-zinc-500">{labels[hover]}</div>
          {series.map((s) => (
            <div key={s.name} className="flex items-center gap-1.5 tabular-nums text-zinc-900 dark:text-zinc-100">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
              {series.length >= 2 && <span className="text-zinc-500">{s.name}</span>}
              {s.values[hover] == null ? "-" : format(s.values[hover]!)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
