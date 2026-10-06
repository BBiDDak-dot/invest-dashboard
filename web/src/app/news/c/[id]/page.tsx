import { notFound } from "next/navigation";
import { clipToItem } from "@/components/ClipList";
import { ArticleView } from "@/components/ArticleView";
import { getPageArticle, isClipId } from "@/lib/news";
import { getNewsClip, getNewsNote } from "@/lib/queries";

const badge = "mr-1 rounded px-1.5 py-0.5 text-[11px] font-normal";

// 산업 클리핑 기사를 사이트 안에서 읽고 메모함. 클리핑이 지워졌으면(30일) 메모에 남은 주소로 엶
export default async function ClipPage({ params }: PageProps<"/news/c/[id]">) {
  const { id } = await params;
  if (!isClipId(id)) notFound();
  const [clip, note] = await Promise.all([getNewsClip(id).catch(() => null), getNewsNote(id).catch(() => undefined)]);
  const item = clip
    ? clipToItem(clip)
    : note
      ? { id, title: note.title, summary: note.summary ?? "", source: note.source ?? "", time: note.news_time ?? "", url: note.url, thumb: null }
      : null;
  if (!item) notFound();
  const article = await getPageArticle(item.url).catch(() => null);
  return (
    <ArticleView
      item={item}
      original={item.url}
      lead={clip?.what ? `→ ${clip.what}` : null}
      blocks={article?.blocks ?? null}
      note={note === undefined ? undefined : (note?.note ?? null)}
      badges={
        clip && (
          <div className="mb-1">
            <span className={`${badge} bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900`}>{clip.category}</span>
            {clip.industry && clip.industry !== "기타" && <span className={`${badge} bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300`}>{clip.industry}</span>}
            {clip.title_ko && clip.title_ko !== clip.title && <div className="mt-1 text-xs text-zinc-400">{clip.title}</div>}
          </div>
        )
      }
    />
  );
}
