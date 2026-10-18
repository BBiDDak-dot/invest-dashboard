import Link from "next/link";
import { notFound } from "next/navigation";
import { ReportMarkdown } from "@/components/ReportMarkdown";
import { num } from "@/lib/format";
import { getEarningsReport, getEarningsTarget } from "@/lib/queries";
import { Pct, qLabel } from "../../shared";
import { GenerateReport } from "./GenerateReport";

// 리포트 작성(Gemini 검색)이 1~2분 걸릴 수 있음
export const maxDuration = 300;

const usd = (v: number | null) => (v == null ? "-" : `${num(v / 100, Math.abs(v) < 1000 ? 1 : 0)}억$`);
const krw = (v: number | null) => (v == null ? "-" : `${num(v, 0)}억`);

export default async function EarningsReportPage({ params }: PageProps<"/earnings/r/[key]">) {
  const key = (await params).key;
  const [target, report] = await Promise.all([getEarningsTarget(key), getEarningsReport(key)]);
  if (!target) notFound();
  const kr = target.kr;
  const r = (kr ?? target.us)!;
  const fmt = kr ? krw : usd;
  const name = kr ? kr.corp_name : target.us!.name;
  const period = r.period ?? "";
  const items = [
    ["매출액", r.revenue, r.revenue_prev_y, r.revenue_yoy, null],
    ["영업이익", r.op, r.op_prev_y, r.op_yoy, r.op_turn],
    ["순이익", r.ni, r.ni_prev_y, r.ni_yoy, r.ni_turn],
  ] as const;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-500">
        <Link href={`/earnings${kr ? "" : "/us"}?q=${period}`} className="hover:underline">
          ← 실적 스크리닝
        </Link>
        <span>
          {kr ? `${kr.market} · ${kr.stock_code} · ${kr.title} ${kr.date}` : `${target.us!.ticker} · 회계분기 말 ${target.us!.end_date ?? "-"}`}{" "}
          {(kr?.url ?? target.us!.url) && (
            <a href={kr?.url ?? target.us!.url!} target="_blank" rel="noreferrer" className="underline">
              {kr ? "공시 원문" : "SEC 원문"}
            </a>
          )}
        </span>
      </div>
      <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="font-medium">
          {name} <span className="text-sm text-zinc-500">{qLabel(period)} 실적</span>
        </div>
        <div className="mt-1 grid grid-cols-1 gap-x-4 gap-y-0.5 text-sm tabular-nums sm:grid-cols-3">
          {items.map(([label, now, prev, yoy, turn]) => (
            <div key={label}>
              <span className="text-xs text-zinc-500">{label} </span>
              {fmt(now)} <Pct v={yoy} turn={turn} />
              <div className="text-[11px] text-zinc-400">전년 동기 {fmt(prev)}</div>
            </div>
          ))}
        </div>
      </div>
      {report ? (
        <article className="report-md rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
          <ReportMarkdown text={report.body} />
        </article>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
        <span>{report ? `실적 분석 (${report.model ?? "AI"}, ${report.created_at.slice(0, 10)}) · AI가 검색해 쓴 글이라 원문 확인 후 판단할 것` : ""}</span>
        <GenerateReport id={key} auto={!report} />
      </div>
    </>
  );
}
