import Link from "next/link";
import { DeleteEvent } from "@/components/CalendarParts";
import type { CalendarEvent } from "@/lib/db";

export const CATEGORY_STYLE: Record<string, string> = {
  FOMC: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  경제지표: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  실적: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  행사: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
  기타: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
};
export const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (s: string, n: number) => iso(new Date(Date.parse(s) + n * 86400_000));
export const weekday = (s: string) => new Date(`${s}T00:00:00Z`).getUTCDay();
export const label = (s: string) => `${Number(s.slice(5, 7))}/${Number(s.slice(8))}(${WEEK[weekday(s)]})`;

export function shiftMonth(ym: string, n: number) {
  const d = new Date(`${ym}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return iso(d).slice(0, 7);
}

export function Badge({ e, compact = false }: { e: CalendarEvent; compact?: boolean }) {
  const text = `${e.time_kst ? `${e.time_kst} ` : ""}${e.title}`;
  const tip = [e.title, e.time_kst ? `한국 ${e.time_kst}` : "시각 미정", e.note].filter(Boolean).join(" · ");
  const body = (
    <span className={`${compact ? "block truncate" : "inline"} rounded px-1 py-0.5 text-xs ${CATEGORY_STYLE[e.category] ?? CATEGORY_STYLE["기타"]} ${e.tentative ? "opacity-60" : ""}`} title={tip}>
      {text}
    </span>
  );
  return e.url ? (
    <Link href={e.url} target="_blank" className="block hover:opacity-80">
      {body}
    </Link>
  ) : (
    body
  );
}

// 일정 한 줄 (목록용)
export function EventLine({ e, showDate = true }: { e: CalendarEvent; showDate?: boolean }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 text-sm">
      {showDate && <span className="w-16 shrink-0 text-zinc-500">{label(e.date)}</span>}
      <span className="w-12 shrink-0 tabular-nums text-zinc-500">{e.time_kst ?? "—"}</span>
      <span className={`rounded px-1.5 py-0.5 text-xs ${CATEGORY_STYLE[e.category] ?? CATEGORY_STYLE["기타"]}`}>{e.category}</span>
      {e.url ? (
        <Link href={e.url} target="_blank" className="font-medium hover:underline">
          {e.title}
        </Link>
      ) : (
        <span className="font-medium">{e.title}</span>
      )}
      {e.tentative && <span className="text-xs text-amber-600">미확정</span>}
      {e.note && <span className="text-xs text-zinc-500">{e.note}</span>}
      {e.source === "manual" && <DeleteEvent id={e.id} />}
    </li>
  );
}

