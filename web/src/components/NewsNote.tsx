"use client";

import { useState, useTransition } from "react";
import { saveNewsNote } from "@/app/actions";
import type { NewsItem } from "@/lib/news";

// 기사 아래 내 메모. 없으면 "메모" 버튼, 있으면 메모 내용을 보여 주고 누르면 편집
export function NewsNote({ item, note }: { item: NewsItem; note?: string }) {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(note ?? "");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const open = () => {
    setDraft(saved);
    setError(null);
    setEditing(true);
  };
  const save = () =>
    start(async () => {
      const r = await saveNewsNote(
        { id: item.id, title: item.title, url: item.url, source: item.source, summary: item.summary, time: item.time },
        draft,
      );
      if (r?.error) return setError(r.error);
      setSaved(draft.trim());
      setEditing(false);
    });

  if (editing) {
    return (
      <div className={`mt-2 ${pending ? "opacity-60" : ""}`}>
        <textarea
          autoFocus
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
            else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save();
          }}
          placeholder="이 기사에 대한 내 생각 (비우고 저장하면 삭제)"
          className="w-full rounded border border-amber-400 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none dark:bg-zinc-900 dark:text-zinc-100"
        />
        <div className="mt-1 flex items-center gap-2 text-xs">
          <button type="button" onClick={save} disabled={pending} className="rounded bg-zinc-900 px-2.5 py-1 text-white dark:bg-zinc-100 dark:text-zinc-900">
            저장
          </button>
          <button type="button" onClick={() => setEditing(false)} className="px-1 text-zinc-500">
            취소
          </button>
          <span className="text-zinc-400">Ctrl+Enter 저장 · Esc 취소</span>
          {error && <span className="text-amber-600">{error}</span>}
        </div>
      </div>
    );
  }
  if (saved) {
    return (
      <button
        type="button"
        onClick={open}
        title="눌러서 메모 편집"
        className="mt-2 block w-full whitespace-pre-line rounded border-l-2 border-amber-400 bg-amber-50 px-2 py-1.5 text-left text-sm text-zinc-800 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-zinc-200 dark:hover:bg-amber-950/50"
      >
        {saved}
      </button>
    );
  }
  return (
    <button type="button" onClick={open} className="mt-1 text-xs text-zinc-400 hover:text-amber-600">
      ✎ 메모
    </button>
  );
}
