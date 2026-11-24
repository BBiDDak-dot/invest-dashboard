import Link from "next/link";
import { Card, Empty } from "@/components/Card";
import { CalendarForm } from "@/components/CalendarParts";
import { addDays, Badge, CATEGORY_STYLE, EventLine, shiftMonth, WEEK, weekday } from "@/components/CalendarView";
import { SetupNotice } from "@/components/SetupNotice";
import type { CalendarEvent } from "@/lib/db";
import { kstToday } from "@/lib/format";
import { getCalendarEvents } from "@/lib/queries";

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const sp = await searchParams;
  const today = kstToday();
  const ym = typeof sp.m === "string" && /^\d{4}-\d{2}$/.test(sp.m) ? sp.m : today.slice(0, 7);
  const first = `${ym}-01`;
  const gridStart = addDays(first, -weekday(first));
  const last = addDays(`${shiftMonth(ym, 1)}-01`, -1);
  const gridEnd = addDays(last, 6 - weekday(last));
  const upEnd = addDays(today, 14);
  const from = gridStart < today ? gridStart : today;
  const to = gridEnd > upEnd ? gridEnd : upEnd;
  const { rows, missing } = await getCalendarEvents(from, to);

  const byDate = new Map<string, CalendarEvent[]>();
  for (const e of rows) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
  const upcoming = rows.filter((e) => e.date >= today && e.date <= upEnd);
  const monthRows = rows.filter((e) => e.date >= first && e.date <= last);
  const days: string[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);

  return (
    <>
      <SetupNotice />
      {missing && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          calendar_events 테이블이 없음. supabase/migrations/021_calendar_events.sql을 Supabase SQL Editor에서 실행해야 함.
        </div>
      )}
      <Card title="다가오는 일정 (2주, 한국 시간)">
        {upcoming.length === 0 ? (
          <Empty>2주 안에 등록된 일정이 없음.</Empty>
        ) : (
          <ul className="space-y-1.5">
            {upcoming.map((e) => (
              <EventLine key={e.id} e={e} />
            ))}
          </ul>
        )}
      </Card>
      <Card title="달력 (한국 시간 기준)">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <Link href={`/calendar?m=${shiftMonth(ym, -1)}`} className="rounded border border-zinc-300 px-2 py-0.5 text-sm dark:border-zinc-700">
            ‹
          </Link>
          <span className="font-medium">
            {ym.slice(0, 4)}년 {Number(ym.slice(5))}월
          </span>
          <Link href={`/calendar?m=${shiftMonth(ym, 1)}`} className="rounded border border-zinc-300 px-2 py-0.5 text-sm dark:border-zinc-700">
            ›
          </Link>
          {ym !== today.slice(0, 7) && (
            <Link href="/calendar" className="text-sm text-zinc-500 hover:underline">
              이번 달
            </Link>
          )}
          <span className="ml-auto flex flex-wrap gap-1">
            {Object.entries(CATEGORY_STYLE).map(([c, s]) => (
              <span key={c} className={`rounded px-1.5 py-0.5 text-xs ${s}`}>
                {c}
              </span>
            ))}
          </span>
        </div>
        {/* PC: 달력 칸 */}
        <div className="hidden grid-cols-7 border-l border-t border-zinc-200 sm:grid dark:border-zinc-800">
          {WEEK.map((w, i) => (
            <div key={w} className={`border-b border-r border-zinc-200 px-1 py-1 text-center text-xs dark:border-zinc-800 ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-zinc-500"}`}>
              {w}
            </div>
          ))}
          {days.map((d) => {
            const inMonth = d.slice(0, 7) === ym;
            return (
              <div key={d} className={`min-h-24 min-w-0 space-y-0.5 border-b border-r border-zinc-200 p-1 dark:border-zinc-800 ${inMonth ? "" : "opacity-40"} ${d === today ? "bg-zinc-50 dark:bg-zinc-900" : ""}`}>
                <div className={`text-xs ${d === today ? "font-bold" : "text-zinc-500"}`}>{Number(d.slice(8))}</div>
                {(byDate.get(d) ?? []).map((e) => (
                  <Badge key={e.id} e={e} compact />
                ))}
              </div>
            );
          })}
        </div>
        {/* 휴대폰: 이달 일정 목록 */}
        <div className="sm:hidden">
          {monthRows.length === 0 ? (
            <Empty>이달 일정이 없음.</Empty>
          ) : (
            <ul className="space-y-1.5">
              {monthRows.map((e) => (
                <EventLine key={e.id} e={e} />
              ))}
            </ul>
          )}
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          미국 일정은 한국 시각으로 바꿔 표시함(서머타임 반영). 미국 장 마감 후 실적은 한국 다음 날 새벽임. 흐린 일정은 예상 날짜. 미국 실적일은 회사 확정 전엔 Yahoo 추정일일 수 있음. 마우스를 올리면 현지 시각이 보임.
        </p>
      </Card>
      <Card title="일정 직접 추가">
        <CalendarForm today={today} />
        <p className="mt-2 text-xs text-zinc-500">
          자동 수집: FOMC, 미국 CPI·고용보고서, 주요 기업(M7·반도체·AI 인프라·델·오라클 등 미국 31곳, 삼성전자·SK하이닉스 등 국내 16곳)과 관심종목 전체 실적, CES. 그 밖의 행사는 여기서 추가함(직접 추가한 일정만 × 로 삭제 가능).
        </p>
      </Card>
    </>
  );
}
