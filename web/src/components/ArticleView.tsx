import Link from "next/link";
import type { ArticleBlock, NewsItem } from "@/lib/news";
import { newsTime } from "@/lib/news";
import { MemoPanel } from "./MemoPanel";

// 기사 전문 + 따라오는 메모 칸. blocks가 없으면 요약과 원문 링크만
export function ArticleView({
  item,
  original,
  lead,
  blocks,
  note,
  badges,
}: {
  item: NewsItem;
  original: string;
  lead: string | null;
  blocks: ArticleBlock[] | null;
  note: string | null | undefined;
  badges?: React.ReactNode;
}) {
  return (
    <>
      <Link href="/news" className="text-sm text-zinc-500 hover:underline">
        ← 뉴스
      </Link>
      <div className="mx-auto w-full max-w-5xl pb-40 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-8 lg:pb-0">
        <article className="min-w-0 space-y-4">
          <header>
            {badges}
            <h1 className="text-xl font-semibold leading-snug">{item.title}</h1>
            <div className="mt-1 text-xs text-zinc-500">
              {item.source} · {newsTime(item.time)} ·{" "}
              <a href={original} target="_blank" rel="noreferrer" className="underline">
                원문
              </a>
            </div>
          </header>
          {lead && <p className="whitespace-pre-line border-l-2 border-zinc-300 pl-3 font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-300">{lead}</p>}
          {blocks ? (
            <div className="space-y-3 text-[15px] leading-7 text-zinc-800 dark:text-zinc-200">
              {blocks.map((b, i) =>
                b.kind === "img" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={b.src} alt="" loading="lazy" referrerPolicy="no-referrer" className="mx-auto max-h-[480px] rounded" />
                ) : b.kind === "caption" ? (
                  <p key={i} className="text-center text-xs text-zinc-500">
                    {b.text}
                  </p>
                ) : (
                  <p key={i}>{b.text}</p>
                ),
              )}
            </div>
          ) : (
            <p className="text-sm text-zinc-500">
              이 사이트는 본문을 가져오지 못했음.{" "}
              <a href={original} target="_blank" rel="noreferrer" className="underline">
                원문에서 보기
              </a>
            </p>
          )}
        </article>
        <MemoPanel item={item} note={note} />
      </div>
    </>
  );
}
