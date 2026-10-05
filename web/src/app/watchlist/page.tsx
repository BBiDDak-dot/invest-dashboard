import { Card } from "@/components/Card";
import { SetupNotice } from "@/components/SetupNotice";
import { WatchTable } from "@/components/WatchTable";
import { getWatchlist } from "@/lib/queries";

export const revalidate = 3600;

export default async function WatchlistPage() {
  const rows = await getWatchlist();
  return (
    <>
      <SetupNotice />
      <Card title="관심종목">
        <WatchTable rows={rows} />
      </Card>
    </>
  );
}
