import Link from "next/link";
import { Card, Empty } from "@/components/Card";
import { MacroGrid } from "@/components/MacroGrid";
import { MddChart } from "@/components/MddChart";
import { SentimentNote } from "@/components/SentimentNote";
import { AutoRefresh } from "@/components/AutoRefresh";
import { SetupNotice } from "@/components/SetupNotice";
import { TopPicks } from "@/components/TopPicks";
import { addDays, EventLine } from "@/components/CalendarView";
import { kstToday } from "@/lib/format";
import { getCalendarEvents, getDisclosures, getMacro, getMdd, getWatchlist, isEconomic, isSentiment } from "@/lib/queries";

// 요약 화면 에너지 카드는 원유 두 개만 (석유제품·곡선은 에너지 탭에서)
const ENERGY_SUMMARY = ["YF:CL=F", "YF:BZ=F"];

export default async function Home() {
  const today = kstToday();
  const [watch, macro, disclosures, mdd, cal] = await Promise.all([
    getWatchlist(),
    getMacro(),
    getDisclosures(10),
    getMdd(),
    getCalendarEvents(today, addDays(today, 7)),
  ]);
  return (
    <>
      <SetupNotice />
      <AutoRefresh />
      <Card title="★ TOP PICK">
        <TopPicks rows={watch.filter((w) => w.starred)} />
      </Card>
      <Card title="이번 주 일정 (7일, 한국 시간)">
        {cal.rows.length === 0 ? (
          <Empty>7일 안에 일정이 없음.</Empty>
        ) : (
          <ul className="space-y-1.5">
            {cal.rows.map((e) => (
              <EventLine key={e.id} e={e} />
            ))}
          </ul>
        )}
        <Link href="/calendar" className="mt-2 inline-block text-xs text-zinc-500 hover:underline">
          달력 보기 →
        </Link>
      </Card>
      <Card title="매크로 (최근 3년)">
        <MacroGrid rows={macro.filter((r) => isEconomic(r.series_id))} />
      </Card>
      <Card title="에너지 (최근 3년)">
        <MacroGrid rows={macro.filter((r) => ENERGY_SUMMARY.includes(r.series_id))} />
      </Card>
      <Card title="4대 지수 MDD (최근 20년)">
        <MddChart rows={mdd} />
      </Card>
      <Card title="심리 (최근 3년)">
        <MacroGrid rows={macro.filter((r) => isSentiment(r.series_id))} />
        <SentimentNote />
      </Card>
      <Card title="최근 공시">
        {disclosures.length === 0 ? (
          <Empty>최근 공시가 없음.</Empty>
        ) : (
          <ul className="space-y-1 text-sm">
            {disclosures.map((d) => (
              <li key={d.id}>
                <span className="text-zinc-400">{d.date}</span> <span className="text-zinc-500">{d.ticker}</span>{" "}
                <Link href={d.url} target="_blank" className="hover:underline">
                  {d.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
