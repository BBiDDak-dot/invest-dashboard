"use client";

import { useActionState } from "react";
import { login } from "@/app/actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="next" value={next} />
      <input
        type="password"
        name="password"
        placeholder="비밀번호"
        autoFocus
        className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
      />
      <button disabled={pending} className="w-full rounded-md bg-zinc-900 py-2 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
        들어가기
      </button>
      {state?.error && <p className="text-xs text-amber-600">{state.error}</p>}
    </form>
  );
}
