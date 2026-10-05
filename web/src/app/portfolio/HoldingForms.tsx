"use client";

import { useActionState, useState } from "react";
import { saveCash, saveHolding } from "@/app/actions";

const input = "rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700";
const button = "rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900";

type Option = { ticker: string; name: string; avg_price?: number | null; quantity?: number | null };

// 관심종목 중 하나를 골라 매입단가·보유수량 입력 (수량 0이면 포트폴리오에서 빠짐)
// 종목을 고르면 관심종목에 저장된 매입단가·수량을 채워 넣음
export function HoldingForm({ options, initial = "" }: { options: Option[]; initial?: string }) {
  const [state, action, pending] = useActionState(saveHolding, null);
  const [ticker, setTicker] = useState(initial);
  const picked = options.find((o) => o.ticker === ticker);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <select name="ticker" className={input} value={ticker} onChange={(e) => setTicker(e.target.value)}>
        <option value="" disabled>
          종목 선택 (관심종목)
        </option>
        {options.map((o) => (
          <option key={o.ticker} value={o.ticker}>
            {o.name} {o.ticker}
            {o.quantity ? ` · ${o.quantity}주` : ""}
          </option>
        ))}
      </select>
      <input key={`p-${ticker}`} name="avg_price" inputMode="decimal" placeholder="매입단가" defaultValue={picked?.avg_price ?? ""} className={`${input} w-28`} />
      <input key={`q-${ticker}`} name="quantity" inputMode="decimal" placeholder="보유주식수" defaultValue={picked?.quantity ?? ""} className={`${input} w-28`} />
      <button disabled={pending} className={button}>
        저장
      </button>
      {state && <span className={`text-xs ${state.error ? "text-amber-600" : "text-zinc-500"}`}>{state.error ?? state.ok}</span>}
      <span className="w-full text-xs text-zinc-400">수량을 0으로 저장하면 포트폴리오에서 빠지고 관심종목에는 남음. 미국 종목 매입단가는 달러로 입력.</span>
    </form>
  );
}

export function CashForm({ cash }: { cash: number }) {
  const [state, action, pending] = useActionState(saveCash, null);
  return (
    <form action={action} className="flex items-center justify-end gap-2">
      <input name="cash" inputMode="numeric" defaultValue={cash} className={`${input} w-36 text-right tabular-nums`} />
      <button disabled={pending} className={button}>
        저장
      </button>
      {state?.error && <span className="text-xs text-amber-600">{state.error}</span>}
    </form>
  );
}
