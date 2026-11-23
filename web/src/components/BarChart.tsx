"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  labels: string[];
  values: (number | null)[];
  name: string;
  height?: number;
  decimals?: number;
  posColor?: string;
  negColor?: string;
};

// LineChart와 같은 여백이라 위아래로 놓으면 x축이 맞음
const PAD = { top: 8, right: 8, bottom: 22, left: 56 };

function ticks(min: number, max: number, count = 4) {
  const raw = (max - min) / count || 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out = [];
  const end = Math.ceil(max / step) * step;
  for (let v = Math.floor(min / step) * step; v <= end + step * 0.001; v += step) out.push(Math.round(v / step) * step);
  return out;
}

// 0 기준 막대 그래프. 0 아래(음수) 막대는 다른 색 + 배경 음영으로 구분
export function BarChart({ labels, values, name, height = 160, decimals = 2, posColor = "var(--series-1)", negColor = "var(--series-2)" }: Props) {
  const format = (v: number) => v.toLocaleString("ko-KR", { maximumFractionDigits: decimals });
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(200, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const all = values.filter((v): v is number => v != null);
  if (labels.length < 2 || all.length === 0) return <p className="py-6 text-center text-sm text-zinc-500">데이터 없음</p>;

  const yt = ticks(Math.min(0, ...all), Math.max(0, ...all));
  const lo = Math.min(yt[0], ...all);
  const hi = Math.max(yt.at(-1)!, ...all);
  const w = width - PAD.left - PAD.right;
  const h = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (i / (labels.length - 1)) * w;
  const y = (v: number) => PAD.top + h - ((v - lo) / (hi - lo || 1)) * h;
  const bw = Math.max(1, w / labels.length);

  // 음수 구간 (연속된 음수 막대)을 배경 음영으로
  const bands: [number, number][] = [];
  values.forEach((v, i) => {
    if (v == null || v >= 0) return;
    const b = bands.at(-1);
    if (b && b[1] >= i - 3) b[1] = i;
    else bands.push([i, i]);
  });

  const xLabelIdx = Array.from(new Set([0, ...[1, 2, 3].map((k) => Math.round(((labels.length - 1) * k) / 4)), labels.length - 1]));

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - rect.left) / rect.width) * (labels.length - 1));
    setHover(Math.min(labels.length - 1, Math.max(0, i)));
  }

  return (
    <div ref={ref} className="relative w-full min-w-0">
      {width === 0 ? (
        <div style={{ height }} />
      ) : (
        <svg width={width} height={height} className="block overflow-visible">
          {bands.map(([a, b]) => (
            <rect key={a} x={x(a) - bw / 2} y={PAD.top} width={x(b) - x(a) + bw} height={h} fill={negColor} opacity={0.08} />
          ))}
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
              {/^\d{4}-\d{2}-\d{2}$/.test(labels[i]) ? labels[i].slice(0, 7) : labels[i]}
            </text>
          ))}
          {values.map((v, i) =>
            v == null ? null : (
              <rect
                key={i}
                x={x(i) - bw / 2}
                y={Math.min(y(v), y(0))}
                width={bw}
                height={Math.max(0.5, Math.abs(y(v) - y(0)))}
                fill={v < 0 ? negColor : posColor}
                opacity={hover == null || hover === i ? 0.85 : 0.6}
              />
            ),
          )}
          {hover != null && (
            <line pointerEvents="none" x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + h} stroke="var(--chart-zero)" strokeDasharray="3 3" />
          )}
          <rect x={PAD.left} y={PAD.top} width={w} height={h} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
        </svg>
      )}
      {hover != null && (
        <div
          className="pointer-events-none absolute top-2 z-10 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
          style={x(hover) > width / 2 ? { right: width - x(hover) + 8 } : { left: x(hover) + 8 }}
        >
          <div className="mb-0.5 text-zinc-500">{labels[hover]}</div>
          <div className="tabular-nums text-zinc-900 dark:text-zinc-100">
            <span className="text-zinc-500">{name}</span> {values[hover] == null ? "-" : format(values[hover]!)}
          </div>
        </div>
      )}
    </div>
  );
}
