"use client";

import { useEffect, useRef, useState } from "react";
import { money, type ArrCompany, type ArrPoint } from "@/lib/aiArr";

const PAD = { top: 10, right: 12, bottom: 22, left: 60 };

// "2026-10" → 2026.79 (월 중앙)
const t = (d: string) => Number(d.slice(0, 4)) + (Number(d.slice(5, 7)) - 0.5) / 12;

type Hit = { c: ArrCompany; p: ArrPoint };

// 회사별 발표·보도 시점을 점으로 찍고 이은 선 그래프 (x=실제 날짜 간격, y=로그 또는 일반)
export function ArrChart({ companies, height = 300 }: { companies: ArrCompany[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [log, setLog] = useState(true);
  const [hit, setHit] = useState<Hit | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pts = companies.flatMap((c) => c.points);
  const x0 = Math.floor(Math.min(...pts.map((p) => t(p.date))));
  const x1 = Math.max(...pts.map((p) => t(p.date))) + 0.05;
  const vmax = Math.max(...pts.map((p) => p.value));
  const vmin = Math.min(...pts.map((p) => p.value));

  // y축 눈금: 로그는 1·10·100 단위, 일반은 20 단위
  const ylo = log ? 10 ** Math.floor(Math.log10(vmin)) : 0;
  const yhi = log ? 10 ** Math.ceil(Math.log10(vmax)) : Math.ceil(vmax / 20) * 20;
  const yticks: number[] = [];
  if (log) for (let v = ylo; v <= yhi * 1.0001; v *= 10) yticks.push(v);
  else for (let v = 0; v <= yhi; v += 20) yticks.push(v);

  const w = width - PAD.left - PAD.right;
  const h = height - PAD.top - PAD.bottom;
  const x = (d: string) => PAD.left + ((t(d) - x0) / (x1 - x0)) * w;
  const y = (v: number) =>
    PAD.top + h - (log ? (Math.log10(v) - Math.log10(ylo)) / (Math.log10(yhi) - Math.log10(ylo)) : v / yhi) * h;

  const years = [];
  for (let yr = x0; yr <= Math.floor(x1); yr++) years.push(yr);
  const tickLabel = money;

  // 마우스·손가락 위치에서 가장 가까운 점
  function pick(e: React.PointerEvent<SVGRectElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - r.left + PAD.left;
    const my = e.clientY - r.top + PAD.top;
    let best: Hit | null = null;
    let bd = Infinity;
    for (const c of companies)
      for (const p of c.points) {
        const d = (x(p.date) - mx) ** 2 + (y(p.value) - my) ** 2;
        if (d < bd) [bd, best] = [d, { c, p }];
      }
    setHit(bd < 40 ** 2 ? best : null);
  }

  return (
    <div ref={ref} className="relative w-full min-w-0">
      <div className="mb-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
        {companies.map((c) => (
          <span key={c.id} className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: c.color }} />
            {c.name}
          </span>
        ))}
        <span className="ml-auto flex overflow-hidden rounded border border-zinc-200 dark:border-zinc-700">
          {[true, false].map((v) => (
            <button
              key={String(v)}
              onClick={() => setLog(v)}
              className={`px-2 py-0.5 ${log === v ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100" : ""}`}
            >
              {v ? "로그" : "일반"}
            </button>
          ))}
        </span>
      </div>
      {width === 0 ? (
        <div style={{ height }} />
      ) : (
        <svg width={width} height={height} className="block overflow-visible">
          {yticks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--chart-grid)" />
              <text x={PAD.left - 6} y={y(v)} dy="0.32em" textAnchor="end" className="fill-zinc-500 text-[10px] tabular-nums">
                {tickLabel(v)}
              </text>
            </g>
          ))}
          {years.map((yr) => {
            const xx = PAD.left + ((yr - x0) / (x1 - x0)) * w;
            return (
              <g key={yr}>
                <line x1={xx} x2={xx} y1={PAD.top} y2={PAD.top + h} stroke="var(--chart-grid)" strokeDasharray="2 3" />
                <text x={xx + 3} y={height - 6} className="fill-zinc-500 text-[10px]">
                  {yr}
                </text>
              </g>
            );
          })}
          {companies.map((c) => (
            <g key={c.id}>
              <path
                d={c.points.map((p, i) => `${i ? "L" : "M"}${x(p.date)},${y(p.value)}`).join("")}
                fill="none"
                stroke={c.color}
                strokeWidth={2}
                strokeLinejoin="round"
              />
              {c.points.map((p) => (
                <circle key={p.date} cx={x(p.date)} cy={y(p.value)} r={hit?.p === p ? 5 : 3} fill={c.color} stroke="var(--background)" strokeWidth={1.5} />
              ))}
              {(() => {
                const last = c.points.at(-1)!;
                return (
                  <text x={x(last.date) - 6} y={y(last.value) - 7} textAnchor="end" className="text-[10px] font-medium tabular-nums" fill={c.color}>
                    {money(last.value)}
                  </text>
                );
              })()}
            </g>
          ))}
          <rect x={PAD.left} y={PAD.top} width={w} height={h} fill="transparent" onPointerMove={pick} onPointerDown={pick} />
        </svg>
      )}
      <div className="mt-1 min-h-[2.5rem] text-xs text-zinc-600 dark:text-zinc-400">
        {hit ? (
          <div>
            <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: hit.c.color }} />
            <b className="text-zinc-900 dark:text-zinc-100">{hit.c.name}</b> {hit.p.date} · <b className="tabular-nums">{money(hit.p.value)}</b> ·{" "}
            <a href={hit.p.url} target="_blank" rel="noreferrer" className="text-[var(--series-1)] underline underline-offset-2">
              {hit.p.src}
            </a>
            {hit.p.note && <div className="mt-0.5 text-zinc-500">{hit.p.note}</div>}
          </div>
        ) : (
          <span className="text-zinc-400">점을 가리키거나 누르면 값과 출처가 나옴.</span>
        )}
      </div>
    </div>
  );
}
