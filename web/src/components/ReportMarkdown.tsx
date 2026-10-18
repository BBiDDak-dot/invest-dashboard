import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ReportChart } from "@/components/ReportChart";
import { parseChart } from "@/lib/reportChart";

// AI가 쓴 마크다운 본문. ```chart 블록은 차트로 그림
export function ReportMarkdown({ text }: { text: string }) {
  const parts: ({ kind: "md"; text: string } | { kind: "chart"; raw: string })[] = [];
  let last = 0;
  for (const m of text.matchAll(/```chart\s*\n([\s\S]*?)```/g)) {
    parts.push({ kind: "md", text: text.slice(last, m.index) });
    parts.push({ kind: "chart", raw: m[1] });
    last = m.index! + m[0].length;
  }
  parts.push({ kind: "md", text: text.slice(last) });
  return parts.map((p, i) => {
    if (p.kind === "md")
      return (
        <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={{ a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a> }}>
          {p.text}
        </ReactMarkdown>
      );
    const spec = parseChart(p.raw);
    return spec ? <ReportChart key={i} spec={spec} /> : null;
  });
}
