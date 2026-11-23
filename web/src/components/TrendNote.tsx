import { num } from "@/lib/format";
import type { Trend } from "@/lib/trend";

// 차트 아래 추세 해석: 지금 방향의 의미를 진하게, 반대 방향은 흐리게
export function TrendNote({ trend, unit }: { trend: Trend; unit: string | null }) {
  const { dir, since, change, isPct } = trend;
  const sign = change > 0 ? "+" : "";
  const amount = isPct ? `${sign}${num(change, 1)}%` : `${sign}${num(change, 2)}${unit === "%" ? "%p" : ""}`;
  const head =
    !since ? "이력이 짧아 추세 판단 보류" :
    `${since}부터 ${amount} · ${dir === "up" ? "상승 추세" : dir === "down" ? "하락 추세" : "보합"}`;
  const line = (d: "up" | "down", text: string) => (
    <li className={dir === d ? "font-medium text-zinc-800 dark:text-zinc-100" : "text-zinc-400"}>
      {d === "up" ? "▲ 오르면" : "▼ 내리면"}: {text}
    </li>
  );
  return (
    <div className="mt-2 rounded bg-zinc-50 px-2 py-1.5 text-xs leading-relaxed dark:bg-zinc-900">
      <div className="text-zinc-500">{head}</div>
      {trend.level && <div className="font-medium text-zinc-700 dark:text-zinc-200">{trend.level}</div>}
      <ul>
        {line("up", trend.up)}
        {line("down", trend.down)}
      </ul>
    </div>
  );
}
