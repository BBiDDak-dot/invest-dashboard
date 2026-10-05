"use client";

import { useEffect, useRef, useState } from "react";
import type { ChartSpec } from "@/lib/reportChart";
import { LineChart } from "./LineChart";

const COLORS = ["var(--series-1)", "var(--series-2)"];
const PAD = { top: 18, right: 8, bottom: 22, left: 48 };

function ticks(min: number, max: number, count = 4) {
  const raw = (max - min) / count || 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out = [];
  for (let v = Math.floor(min / step) * step; v <= Math.ceil(max / step) * step + step * 0.001; v += step) out.push(Math.round(v / step) * step);
  return out;
}

const fmt = (v: number) => v.toLocaleString("ko-KR", { maximumFractionDigits: Math.abs(v) < 10 ? 2 : 1 });

// 묶음 막대 그래프 (항목 비교·연도별 전망). 0을 기준선으로 하고 막대 위에 값을 적음
function BarChart({ spec, height = 220 }: { spec: ChartSpec; height?: number }) {
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

  const all = spec.series.flatMap((s) => s.values.filter((v): v is number => v != null));
  const yt = ticks(Math.min(0, ...all), Math.max(0, ...all));
  const lo = yt[0];
  const hi = yt.at(-1)!;
  const w = width - PAD.left - PAD.right;
  const h = height - PAD.top - PAD.bottom;
  const y = (v: number) => PAD.top + h - ((v - lo) / (hi - lo || 1)) * h;
  const n = spec.labels.length;
  const slot = w / n;
  const k = spec.series.length;
  const barW = Math.min(36, (slot * 0.7) / k);
  const gap = 2;
  const showValues = n * k <= 12;

  return (
    <div ref={ref} className="relative w-full min-w-0">
      {width === 0 ? (
        <div style={{ height }} />
      ) : (
        <svg width={width} height={height} className="block overflow-visible">
          {yt.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--chart-zero)" : "var(--chart-grid)"} />
              <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-zinc-500 text-[10px] tabular-nums">
                {fmt(t)}
              </text>
            </g>
          ))}
          {spec.labels.map((label, i) => {
            const cx = PAD.left + slot * (i + 0.5);
            const left = cx - (k * barW + (k - 1) * gap) / 2;
            return (
              <g key={i} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
                <rect x={PAD.left + slot * i} y={PAD.top} width={slot} height={h} fill="transparent" />
                {spec.series.map((s, j) => {
                  const v = s.values[i];
                  if (v == null) return null;
                  const top = Math.min(y(v), y(0));
                  const bh = Math.max(1, Math.abs(y(v) - y(0)));
                  return (
                    <g key={j}>
                      <rect x={left + j * (barW + gap)} y={top} width={barW} height={bh} rx={3} fill={COLORS[j]} opacity={hover == null || hover === i ? 1 : 0.5} />
                      {showValues && (
                        <text x={left + j * (barW + gap) + barW / 2} y={v >= 0 ? top - 4 : top + bh + 11} textAnchor="middle" className="fill-zinc-600 text-[10px] tabular-nums dark:fill-zinc-400">
                          {fmt(v)}
                        </text>
                      )}
                    </g>
                  );
                })}
                <text x={cx} y={height - 6} textAnchor="middle" className="fill-zinc-500 text-[10px]">
                  {label}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      {hover != null && !showValues && (
        <div className="pointer-events-none absolute top-0 right-0 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
          <div className="text-zinc-500">{spec.labels[hover]}</div>
          {spec.series.map((s) => (
            <div key={s.name} className="tabular-nums">
              {s.name}: {s.values[hover] == null ? "-" : fmt(s.values[hover]!)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ReportChart({ spec, sourceHref }: { spec: ChartSpec; sourceHref?: string }) {
  const series = spec.series.map((s, i) => ({ name: s.name, color: COLORS[i], values: s.values }));
  return (
    <figure className="not-prose my-4 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <figcaption className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <span className="font-medium">
          {spec.title}
          {spec.unit && <span className="ml-1 text-xs font-normal text-zinc-500">({spec.unit})</span>}
        </span>
        {spec.series.length >= 2 && (
          <span className="flex gap-3 text-xs text-zinc-600 dark:text-zinc-400">
            {series.map((s) => (
              <span key={s.name} className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-sm" style={{ background: s.color }} />
                {s.name}
              </span>
            ))}
          </span>
        )}
      </figcaption>
      {spec.type === "line" ? <LineChart labels={spec.labels} series={series} height={200} decimals={2} /> : <BarChart spec={spec} />}
      {spec.source && (
        <div className="mt-1 text-right text-[11px] text-zinc-400">
          출처:{" "}
          {sourceHref ? (
            <a href={sourceHref} target="_blank" rel="noreferrer" className="underline">
              원문 {spec.source}
            </a>
          ) : (
            spec.source
          )}
        </div>
      )}
    </figure>
  );
}
