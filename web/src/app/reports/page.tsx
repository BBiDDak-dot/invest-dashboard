import Link from "next/link";
import { Card, Empty } from "@/components/Card";
import { SetupNotice } from "@/components/SetupNotice";
import { kstToday } from "@/lib/format";
import { getReports } from "@/lib/queries";
import { ReportUpload } from "./ReportUpload";

// 요약 서버 액션이 이 페이지에서 실행되므로 Claude 응답을 기다릴 시간을 넉넉히 줌
export const maxDuration = 300;

export default async function ReportsPage() {
  const reports = await getReports();
  const today = kstToday();
  return (
    <>
      <SetupNotice />
      <Card title="증권사 리포트 올리기 (PDF 여러 개 가능, 한 페이지로 묶어 요약)">
        <ReportUpload today={today} />
      </Card>
      <Card title="지난 요약">
        {reports.length === 0 ? (
          <Empty>아직 요약한 리포트가 없음.</Empty>
        ) : (
          <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-900">
            {reports.map((r) => (
              <li key={r.id} className="py-2">
                <Link href={`/reports/${r.id}`} className="hover:underline">
                  <span className="mr-2 text-zinc-400 tabular-nums">{r.report_date}</span>
                  {r.title ?? r.file_names.join(", ")}
                </Link>
                <div className="text-xs text-zinc-400">{r.file_names.length}건 · {r.file_names.join(", ")}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
