"use client";

import { useState, useTransition } from "react";
import { saveNewsNote } from "@/app/actions";
import type { NewsItem } from "@/lib/news";

// 기사 읽는 화면의 메모. 넓은 화면은 오른쪽에 붙어 따라오고, 휴대폰은 아래에 고정돼 눌러서 펼침
export function MemoPanel({ item, note }: { item: NewsItem; note: string | null | undefined }) {
  const [saved, setSaved] = useState(note ?? "");
  const [draft, setDraft] = useState(note ?? "");
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dirty = draft.trim() !== saved;

  const save = () =>
    start(async () => {
      const r = await saveNewsNote(
        { id: item.id, title: item.title, url: item.url, source: item.source, summary: item.summary, time: item.time },
        draft,
      );
      if (r?.error) return setMsg(r.error);
      setSaved(draft.trim());
      setMsg(draft.trim() ? "저장됨" : "삭제됨");
    });

  return (
    <aside className="fixed inset-x-0 bottom-0 z-20 border-t border-amber-200 bg-white/95 px-4 py-2 backdrop-blur dark:border-amber-900/50 dark:bg-zinc-950/95 lg:sticky lg:top-4 lg:rounded-lg lg:border lg:p-3">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-left lg:pointer-events-none">
        <span className="text-xs font-medium text-zinc-500">
          내 메모 {dirty ? <span className="text-amber-600">· 저장 안 됨</span> : saved && <span className="text-zinc-400">· 저장됨</span>}
        </span>
        <span className="text-xs text-zinc-400 lg:hidden">{open ? "접기 ▼" : "펼치기 ▲"}</span>
      </button>
      {!open && saved && <p className="truncate text-sm text-zinc-600 dark:text-zinc-300 lg:hidden">{saved}</p>}
      <div className={`${open ? "block" : "hidden"} mt-2 lg:block`}>
        {note === undefined ? (
          <p className="text-xs text-zinc-400">메모 테이블을 불러오지 못했음.</p>
        ) : (
          <>
            <textarea
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setMsg(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save();
              }}
              placeholder="읽으면서 떠오르는 생각 (비우고 저장하면 삭제)"
              className="h-32 w-full resize-y rounded border border-amber-300 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-amber-500 dark:border-amber-800 dark:bg-zinc-900 dark:text-zinc-100 lg:h-64"
            />
            <div className="mt-1 flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={save}
                disabled={pending || !dirty}
                className="rounded bg-zinc-900 px-2.5 py-1 text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
              >
                저장
              </button>
              <span className="text-zinc-400">Ctrl+Enter</span>
              {msg && <span className={msg.includes("됨") ? "text-zinc-500" : "text-amber-600"}>{msg}</span>}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
