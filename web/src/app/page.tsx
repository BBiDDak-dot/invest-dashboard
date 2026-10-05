import Link from "next/link";
import { Card, Empty } from "@/components/Card";
import { MacroGrid } from "@/components/MacroGrid";
import { SetupNotice } from "@/components/SetupNotice";
import { WatchTable } from "@/components/WatchTable";
import { getDisclosures, getMacro, getWatchlist } from "@/lib/queries";

export const revalidate = 3600;

export default async function Home() {
  const [watch, macro, disclosures] = await Promise.all([getWatchlist(), getMacro(12), getDisclosures(10)]);
  return (
    <>
      <SetupNotice />
      <Card title="관심종목">
        <WatchTable rows={watch} />
      </Card>
      <Card title="주요 경제지표">
        <MacroGrid rows={macro} />
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
