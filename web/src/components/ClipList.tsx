import type { NewsClip } from "@/lib/db";
import { newsTime, type NewsItem } from "@/lib/news";
import { Empty } from "./Card";
import { NewsNote } from "./NewsNote";

// published_at(UTC) → 한국 시각 "YYYYMMDDHHmm" (newsTime 형식)
function kst(iso: string | null) {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
  return d.toISOString().replace(/\D/g, "").slice(0, 12);
}

export const clipToItem = (c: NewsClip): NewsItem => ({
  id: c.id,
  title: c.title_ko || c.title,
  summary: c.what || c.summary || "",
  source: c.source ?? "",
  time: kst(c.published_at ?? c.collected_at),
  url: c.url,
  thumb: null,
});

const badge = "rounded px-1.5 py-0.5 text-[11px] font-normal";

export function ClipList({ clips, notes, empty }: { clips: NewsClip[]; notes?: Map<string, string>; empty: string }) {
  if (clips.length === 0) return <Empty>{empty}</Empty>;
  return (
    <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
      {clips.map((c) => {
        const item = clipToItem(c);
        return (
          <li key={c.id} className="py-3">
            <div className="mb-1 flex flex-wrap items-center gap-1">
              <span className={`${badge} bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900`}>{c.category}</span>
              {c.industry && c.industry !== "기타" && <span className={`${badge} bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300`}>{c.industry}</span>}
              {c.region === "해외" && <span className={`${badge} border border-zinc-200 text-zinc-500 dark:border-zinc-700`}>해외</span>}
              {c.score === 3 && <span className={`${badge} text-amber-600`}>구체적 사례</span>}
            </div>
            <a href={c.url} target="_blank" rel="noreferrer" className="group block">
              <div className="font-medium leading-snug group-hover:underline">{item.title}</div>
              {c.title_ko && c.title_ko !== c.title && <div className="text-xs text-zinc-400">{c.title}</div>}
              {c.what && <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">→ {c.what}</p>}
            </a>
            <div className="mt-1 text-xs text-zinc-400">
              {c.source} · {newsTime(item.time)}
              {c.companies && c.companies.length > 0 && ` · ${c.companies.join(", ")}`}
            </div>
            {notes && <NewsNote item={item} note={notes.get(c.id)} />}
          </li>
        );
      })}
    </ul>
  );
}
