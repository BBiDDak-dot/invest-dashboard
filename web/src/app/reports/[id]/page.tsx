import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ReportChart } from "@/components/ReportChart";
import { parseChart } from "@/lib/reportChart";
import { getReport } from "@/lib/queries";
import { DeleteReport } from "./DeleteReport";

// 요약 본문을 마크다운 부분과 ```chart 블록으로 나눔
function split(md: string) {
  const parts: ({ kind: "md"; text: string } | { kind: "chart"; raw: string })[] = [];
  let last = 0;
  for (const m of md.matchAll(/```chart\s*\n([\s\S]*?)```/g)) {
    parts.push({ kind: "md", text: md.slice(last, m.index) });
    parts.push({ kind: "chart", raw: m[1] });
    last = m.index! + m[0].length;
  }
  parts.push({ kind: "md", text: md.slice(last) });
  return parts;
}

export default async function ReportPage({ params }: PageProps<"/reports/[id]">) {
  const report = await getReport((await params).id);
  if (!report) notFound();
  // PDF 하나짜리 요약이면 "p.5" 같은 쪽 표시를 원본 PDF 해당 쪽 링크로 바꿈
  const pdf = report.file_paths?.length === 1 ? `/reports/${report.id}/pdf` : null;
  const pageHref = (src?: string) => {
    const n = src?.match(/p\.\s?(\d{1,3})/)?.[1];
    return pdf && n ? `${pdf}?p=${n}` : undefined;
  };
  const linkPages = (text: string) => (pdf ? text.replace(/(?<![\w/[])p\.\s?(\d{1,3})\b/g, (m, n) => `[${m}](${pdf}?p=${n})`) : text);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-500">
        <Link href="/reports" className="hover:underline">
          ← 리포트 목록
        </Link>
        <span>
          {report.report_date} ·{" "}
          {pdf ? (
            <a href={pdf} target="_blank" rel="noreferrer" className="underline">
              {report.file_names.join(", ")}
            </a>
          ) : (
            report.file_names.join(", ")
          )}
        </span>
      </div>
      <article className="report-md rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
        {split(report.summary).map((p, i) => {
          if (p.kind === "md")
            return (
              <ReactMarkdown
                key={i}
                remarkPlugins={[remarkGfm]}
                components={{ a: ({ href, children }) => <a href={href} target={href?.startsWith("/reports/") ? "_blank" : undefined} rel="noreferrer">{children}</a> }}
              >
                {linkPages(p.text)}
              </ReactMarkdown>
            );
          const spec = parseChart(p.raw);
          return spec ? <ReportChart key={i} spec={spec} sourceHref={pageHref(spec.source)} /> : null;
        })}
      </article>
      <div className="flex items-center justify-between text-xs text-zinc-400">
        <span>AI 요약 ({report.model}) · 차트 숫자도 AI가 옮긴 것이라 원문 확인 후 판단할 것</span>
        <DeleteReport id={report.id} />
      </div>
    </>
  );
}
