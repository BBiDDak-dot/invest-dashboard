import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getReport } from "@/lib/queries";
import { DeleteReport } from "./DeleteReport";

export default async function ReportPage({ params }: PageProps<"/reports/[id]">) {
  const report = await getReport((await params).id);
  if (!report) notFound();
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-500">
        <Link href="/reports" className="hover:underline">
          ← 리포트 목록
        </Link>
        <span>
          {report.report_date} · {report.file_names.join(", ")}
        </span>
      </div>
      <article className="report-md rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.summary}</ReactMarkdown>
      </article>
      <div className="flex items-center justify-between text-xs text-zinc-400">
        <span>Claude 요약 ({report.model}) · 원문 확인 후 판단할 것</span>
        <DeleteReport id={report.id} />
      </div>
    </>
  );
}
