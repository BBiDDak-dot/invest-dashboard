import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/Card";
import { NewsNote } from "@/components/NewsNote";
import { getArticle, isArticleId, newsTime } from "@/lib/news";
import { getNewsNote } from "@/lib/queries";

// 기사 전문을 사이트 안에서 읽고 바로 메모함
export default async function ArticlePage({ params }: PageProps<"/news/a/[id]">) {
  const { id } = await params;
  if (!isArticleId(id)) notFound();
  const [oid, aid] = id.split("-");
  const original = `https://n.news.naver.com/mnews/article/${oid}/${aid}`;
  const [article, note] = await Promise.all([getArticle(id).catch(() => null), getNewsNote(id).catch(() => undefined)]);

  if (!article) {
    return (
      <Card title="기사">
        <p className="text-sm text-zinc-500">
          기사 본문을 가져오지 못했음.{" "}
          <a href={original} target="_blank" rel="noreferrer" className="underline">
            원문에서 보기
          </a>
        </p>
      </Card>
    );
  }
  const { item, lead, blocks } = article;
  return (
    <>
      <Link href="/news" className="text-sm text-zinc-500 hover:underline">
        ← 뉴스
      </Link>
      <article className="mx-auto w-full max-w-3xl space-y-4">
        <header>
          <h1 className="text-xl font-semibold leading-snug">{item.title}</h1>
          <div className="mt-1 text-xs text-zinc-500">
            {item.source} · {newsTime(item.time)} ·{" "}
            <a href={original} target="_blank" rel="noreferrer" className="underline">
              원문
            </a>
          </div>
        </header>
        <section className="rounded-lg border border-amber-200 p-3 dark:border-amber-900/50">
          <h2 className="mb-1 text-xs font-medium text-zinc-500">내 메모</h2>
          {note === undefined ? (
            <p className="text-xs text-zinc-400">메모 테이블을 불러오지 못했음.</p>
          ) : (
            <NewsNote item={item} note={note?.note} />
          )}
        </section>
        {lead && <p className="whitespace-pre-line border-l-2 border-zinc-300 pl-3 font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-300">{lead}</p>}
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
      </article>
    </>
  );
}
