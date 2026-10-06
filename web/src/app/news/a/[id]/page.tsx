import { notFound } from "next/navigation";
import { ArticleView } from "@/components/ArticleView";
import { getArticle, isArticleId } from "@/lib/news";
import { getNewsNote } from "@/lib/queries";

// 네이버 기사 전문을 사이트 안에서 읽고 바로 메모함
export default async function ArticlePage({ params }: PageProps<"/news/a/[id]">) {
  const { id } = await params;
  if (!isArticleId(id)) notFound();
  const [oid, aid] = id.split("-");
  const original = `https://n.news.naver.com/mnews/article/${oid}/${aid}`;
  const [article, note] = await Promise.all([getArticle(id).catch(() => null), getNewsNote(id).catch(() => undefined)]);
  const item = article?.item ?? { id, title: note?.title ?? "기사", summary: "", source: note?.source ?? "", time: note?.news_time ?? "", url: original, thumb: null };
  return <ArticleView item={item} original={original} lead={article?.lead ?? null} blocks={article?.blocks ?? null} note={note === undefined ? undefined : (note?.note ?? null)} />;
}
