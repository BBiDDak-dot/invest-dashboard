import Link from "next/link";
import { Card, Empty } from "@/components/Card";
import { MacroGrid } from "@/components/MacroGrid";
import { SentimentNote } from "@/components/SentimentNote";
import { SetupNotice } from "@/components/SetupNotice";
import { TopPicks } from "@/components/TopPicks";
import { getDisclosures, getMacro, getWatchlist, isSentiment } from "@/lib/queries";

export default async function Home() {
  const [watch, macro, disclosures] = await Promise.all([getWatchlist(), getMacro(), getDisclosures(10)]);
  return (
    <>
      <SetupNotice />
      <Card title="★ TOP PICK">
        <TopPicks rows={watch.filter((w) => w.starred)} />
      </Card>
      <Card title="경제 지표 (최근 3년)">
        <MacroGrid rows={macro.filter((r) => !isSentiment(r.series_id))} />
      </Card>
      <Card title="심리 지표 (최근 3년)">
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
