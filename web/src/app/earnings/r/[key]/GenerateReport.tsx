"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { generateEarningsReport } from "@/app/actions";

// 리포트가 없으면 화면을 열 때 바로 작성 시작. 있으면 "다시 작성" 버튼
export function GenerateReport({ id, auto }: { id: string; auto: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const started = useRef(false);

  const run = () =>
    start(async () => {
      setError(null);
      try {
        const r = await generateEarningsReport(id);
        if (r?.error) return setError(r.error);
        router.refresh();
      } catch {
        setError("서버 응답이 끊김 (시간 초과일 수 있음). 잠시 뒤 다시 시도");
      }
    });

  useEffect(() => {
    if (auto && !started.current) {
      started.current = true;
      run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  if (pending)
    return <p className="text-sm text-zinc-500">Gemini가 실적 발표·기사를 찾아 리포트를 쓰는 중임 (보통 30초~2분)…</p>;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {error && <span className="text-red-600">{error}</span>}
      <button onClick={run} className="rounded border border-zinc-300 px-2 py-0.5 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900">
        {auto ? "다시 시도" : "다시 작성"}
      </button>
    </div>
  );
}
