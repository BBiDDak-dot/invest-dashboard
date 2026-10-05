"use client";

import { useState, useTransition } from "react";
import { setStarred, updateField, type EditField } from "@/app/actions";

type Props = {
  ticker: string;
  field: EditField;
  value: string | number | null | undefined;
  kind?: "num" | "text" | "long";
  placeholder?: string; // 비워 두면 보일 값 (예: 자동 계산된 부채비율)
  children: React.ReactNode; // 평소 표시
};

// 칸을 누르면 바로 편집. Enter(긴 글은 Ctrl+Enter)나 바깥 클릭으로 저장, Esc로 취소
export function EditCell({ ticker, field, value, kind = "text", placeholder, children }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const original = value == null ? "" : String(value);

  const open = () => {
    setDraft(original);
    setError(null);
    setEditing(true);
  };
  const save = () => {
    if (draft.trim() === original.trim()) return setEditing(false);
    start(async () => {
      const r = await updateField(ticker, field, draft);
      if (r?.error) setError(r.error);
      else setEditing(false);
    });
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") setEditing(false);
    else if (e.key === "Enter" && (kind !== "long" || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      save();
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={open}
        title={kind === "long" && original ? original : "눌러서 편집"}
        className={`-mx-1 block w-[calc(100%+0.5rem)] rounded px-1 text-inherit hover:bg-amber-50 hover:outline hover:outline-1 hover:outline-amber-300 dark:hover:bg-amber-950/30 dark:hover:outline-amber-800 ${
          kind === "num" ? "text-right" : "text-left"
        }`}
      >
        {children}
      </button>
    );
  }

  const cls = "w-full rounded border border-amber-400 bg-white px-1.5 py-1 text-sm text-zinc-900 outline-none dark:bg-zinc-900 dark:text-zinc-100";
  return (
    <div className={pending ? "opacity-60" : ""}>
      {kind === "long" ? (
        <textarea
          autoFocus
          rows={Math.min(12, Math.max(4, draft.split("\n").length + 1))}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={onKey}
          className={`${cls} min-w-72 text-xs leading-relaxed`}
        />
      ) : (
        <input
          autoFocus
          inputMode={kind === "num" ? "decimal" : undefined}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={onKey}
          className={`${cls} ${kind === "num" ? "w-24 text-right tabular-nums" : "min-w-20"}`}
        />
      )}
      {kind === "long" && <div className="mt-0.5 text-[11px] text-zinc-400">Ctrl+Enter 저장 · Esc 취소</div>}
      {error && <div className="mt-0.5 text-xs text-amber-600">{error}</div>}
    </div>
  );
}

// 톱픽 별표
export function StarButton({ ticker, starred }: { ticker: string; starred: boolean }) {
  const [on, setOn] = useState(starred);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={on}
      aria-label={on ? "톱픽 해제" : "톱픽 지정"}
      title={on ? "톱픽 해제" : "톱픽 지정"}
      onClick={() => {
        const next = !on;
        setOn(next);
        start(async () => {
          const r = await setStarred(ticker, next);
          if (r?.error) {
            setOn(!next);
            alert(r.error);
          }
        });
      }}
      className={`text-lg leading-none ${on ? "text-amber-500" : "text-zinc-300 hover:text-amber-400 dark:text-zinc-700"}`}
    >
      {on ? "★" : "☆"}
    </button>
  );
}
