import { AI_ARR, money, type ArrCompany } from "@/lib/aiArr";
import { ArrChart } from "./ArrChart";

const t = (d: string) => Number(d.slice(0, 4)) + (Number(d.slice(5, 7)) - 0.5) / 12;

// 마지막 값이 1년 전(앞뒤 점 사이 로그 보간)의 몇 배인지. 1년 전 자료가 없으면 null
function yearMultiple(c: ArrCompany) {
  const last = c.points.at(-1)!;
  const target = t(last.date) - 1;
  for (let i = 1; i < c.points.length; i++) {
    const a = c.points[i - 1];
    const b = c.points[i];
    if (t(a.date) <= target && target <= t(b.date)) {
      const r = (target - t(a.date)) / (t(b.date) - t(a.date) || 1);
      return last.value / Math.exp(Math.log(a.value) + r * (Math.log(b.value) - Math.log(a.value)));
    }
  }
  return null;
}

export function ArrSection() {
  const rows = [...AI_ARR].sort((a, b) => b.points.at(-1)!.value - a.points.at(-1)!.value);
  return (
    <div className="grid gap-4">
      <ArrChart companies={AI_ARR} />
      <div className="overflow-x-auto">
        <table className="w-full whitespace-nowrap text-sm tabular-nums">
          <thead className="text-xs text-zinc-500">
            <tr className="border-b border-zinc-200 dark:border-zinc-800">
              <th className="py-1 text-left font-normal">회사</th>
              <th className="py-1 pl-3 text-right font-normal">최근 ARR</th>
              <th className="py-1 pl-3 text-right font-normal">시점</th>
              <th className="py-1 pl-3 text-right font-normal">1년 전 대비</th>
              <th className="py-1 pl-3 text-left font-normal">출처</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const last = c.points.at(-1)!;
              const m = yearMultiple(c);
              return (
                <tr key={c.id} className="border-b border-zinc-100 dark:border-zinc-900">
                  <td className="py-1.5">
                    <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: c.color }} />
                    {c.name} <span className="hidden text-xs text-zinc-500 sm:inline">{c.desc}</span>
                  </td>
                  <td className="py-1.5 pl-3 text-right font-medium">{money(last.value)}</td>
                  <td className="py-1.5 pl-3 text-right text-zinc-500">{last.date}</td>
                  <td className="py-1.5 pl-3 text-right">{m ? `${m.toFixed(1)}배` : "-"}</td>
                  <td className="max-w-[10rem] truncate py-1.5 pl-3 text-xs">
                    <a href={last.url} target="_blank" rel="noreferrer" className="text-[var(--series-1)] underline underline-offset-2">
                      {last.src}
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <details className="text-xs text-zinc-600 dark:text-zinc-400">
        <summary className="cursor-pointer text-zinc-500">전체 값·출처 보기</summary>
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          {AI_ARR.map((c) => (
            <div key={c.id}>
              <div className="mb-1 font-medium text-zinc-900 dark:text-zinc-100">{c.name}</div>
              <ul className="space-y-0.5">
                {[...c.points].reverse().map((p) => (
                  <li key={p.date} className="tabular-nums">
                    {p.date} · {money(p.value)} ·{" "}
                    <a href={p.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                      {p.src}
                    </a>
                    {p.note && <span className="text-zinc-500"> ({p.note})</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
