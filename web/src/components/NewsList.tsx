import Link from "next/link";
import { isArticleId, newsTime, type NewsItem } from "@/lib/news";
import { Empty } from "./Card";
import { NewsNote } from "./NewsNote";

// 네이버 기사는 사이트 안 전문 화면으로, 그 밖은 원문 새 창으로
function ItemLink({ n, children }: { n: NewsItem; children: React.ReactNode }) {
  const cls = "group flex gap-3";
  return isArticleId(n.id) ? (
    <Link href={`/news/a/${n.id}`} className={cls}>
      {children}
    </Link>
  ) : (
    <a href={n.url} target="_blank" rel="noreferrer" className={cls}>
      {children}
    </a>
  );
}

// notes를 넘기면 기사마다 메모 칸을 붙임 (기사 id → 메모)
export function NewsList({
  items,
  thumbs = true,
  tag,
  notes,
  empty,
}: {
  items: NewsItem[];
  thumbs?: boolean;
  tag?: (n: NewsItem) => string | undefined;
  notes?: Map<string, string>;
  empty?: string;
}) {
  if (items.length === 0) return <Empty>{empty ?? "뉴스를 가져오지 못했음. 잠시 후 다시 열어볼 것."}</Empty>;
  return (
    <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
      {items.map((n) => (
        <li key={n.id} className="py-3">
          <ItemLink n={n}>
            <div className="min-w-0 flex-1">
              <div className="font-medium leading-snug group-hover:underline">
                {tag?.(n) && (
                  <span className="mr-1.5 rounded bg-zinc-100 px-1.5 py-0.5 align-middle text-[11px] font-normal text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    {tag(n)}
                  </span>
                )}
                {n.title}
              </div>
              {n.summary && <p className="mt-1 line-clamp-2 text-sm text-zinc-500">{n.summary}</p>}
              <div className="mt-1 text-xs text-zinc-400">
                {n.source} · {newsTime(n.time)}
              </div>
            </div>
            {thumbs && n.thumb && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={n.thumb} alt="" loading="lazy" className="h-16 w-24 shrink-0 rounded object-cover" />
            )}
          </ItemLink>
          {notes && <NewsNote item={n} note={notes.get(n.id)} />}
        </li>
      ))}
    </ul>
  );
}
