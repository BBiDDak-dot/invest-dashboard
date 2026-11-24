"use client";

import { useActionState, useTransition } from "react";
import { addCalendarEvent, deleteCalendarEvent } from "@/app/actions";

const input = "rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700";
const button = "rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900";

// 일정 직접 추가 (한국 날짜·시각으로 입력)
export function CalendarForm({ today }: { today: string }) {
  const [state, action, pending] = useActionState(addCalendarEvent, null);
  return (
    <form action={action} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" name="date" defaultValue={today} className={input} />
        <input type="time" name="time" className={input} title="한국 시각 (모르면 비움)" />
        <select name="category" defaultValue="행사" className={input}>
          {["행사", "실적", "경제지표", "FOMC", "기타"].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <input name="title" placeholder="일정 이름 (예: 엔비디아 GTC 키노트)" className={`${input} min-w-0 flex-1`} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input name="note" placeholder="메모 (선택)" className={`${input} min-w-0 flex-1`} />
        <input name="url" placeholder="링크 (선택)" className={`${input} min-w-0 flex-1`} />
        <button className={button} disabled={pending}>
          {pending ? "저장 중…" : "추가"}
        </button>
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p className="text-sm text-green-600">{state.ok}</p>}
    </form>
  );
}

export function DeleteEvent({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      title="삭제"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await deleteCalendarEvent(id);
          if (r?.error) console.error(r.error);
        })
      }
      className="ml-1 text-zinc-400 hover:text-red-600 disabled:opacity-50"
    >
      ×
    </button>
  );
}
