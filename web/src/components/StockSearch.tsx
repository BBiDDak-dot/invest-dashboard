"use client";

import { useEffect, useState, useTransition } from "react";
import { addStock, searchSecurities, type ActionState } from "@/app/actions";
import type { Security } from "@/lib/db";

export function StockSearch() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Security[]>([]);
  const [message, setMessage] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!q.trim()) return;
    const t = setTimeout(() => {
      searchSecurities(q)
        .then((r) => {
          setResults(r);
          setMessage(r.length ? null : { error: "검색 결과 없음 (종목 목록이 비어 있으면 securities 워크플로를 한 번 실행)" });
        })
        .catch((e: Error) => setMessage({ error: e.message }));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  function add(s: Security) {
    startTransition(async () => {
      setMessage(await addStock(s));
      setResults([]);
      setQ("");
    });
  }

  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          if (!e.target.value.trim()) setResults([]);
        }}
        placeholder="종목명 또는 코드로 검색해서 추가 (예: 한미반도체, 042700, NVDA)"
        className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700"
      />
      {results.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-80 w-full overflow-auto rounded-md border border-zinc-200 bg-white text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {results.map((s) => (
            <li key={s.ticker}>
              <button
                type="button"
                disabled={pending}
                onClick={() => add(s)}
                className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800"
              >
                <span>
                  {s.name} <span className="text-zinc-400">{s.ticker}</span>
                </span>
                <span className="text-xs text-zinc-500">{s.market === "KR" ? "국내" : "미국"} · 추가</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {pending && <p className="mt-1 text-xs text-zinc-500">추가하는 중…</p>}
      {message && <p className={`mt-1 text-xs ${message.error ? "text-amber-600" : "text-zinc-500"}`}>{message.error ?? message.ok}</p>}
    </div>
  );
}
