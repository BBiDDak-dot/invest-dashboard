"use client";

import { useActionState, useTransition } from "react";
import { removeStock, updateStock } from "@/app/actions";
import type { WatchItem } from "@/lib/db";

const input = "w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700";
const label = "space-y-1 text-xs text-zinc-500";

export function StockEditForm({ item }: { item: WatchItem }) {
  const [state, action, saving] = useActionState(updateStock, null);
  const [removing, startRemove] = useTransition();

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="ticker" value={item.ticker} />
      <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <label className={label}>
          구분
          <input name="group_name" defaultValue={item.group_name ?? ""} placeholder="예: 반도체" className={input} />
        </label>
        <label className={label}>
          섹터
          <input name="sector" defaultValue={item.sector ?? ""} placeholder="예: IDM" className={input} />
        </label>
        <label className={label}>
          종목명
          <input name="name" defaultValue={item.name} className={input} />
        </label>
        <label className={label}>
          1년 목표주가
          <input name="target_price" inputMode="decimal" defaultValue={item.target_price ?? ""} className={input} />
        </label>
        <label className={label}>
          12M Fwd P/E
          <input name="fwd_pe" inputMode="decimal" defaultValue={item.fwd_pe ?? ""} className={input} />
        </label>
        <label className={label}>
          매입단가
          <input name="avg_price" inputMode="decimal" defaultValue={item.avg_price ?? ""} className={input} />
        </label>
        <label className={label}>
          보유주식수
          <input name="quantity" inputMode="decimal" defaultValue={item.quantity ?? ""} className={input} />
        </label>
        <label className={label}>
          정렬 순서
          <input name="sort_order" inputMode="numeric" defaultValue={item.sort_order} className={input} />
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <label className={label}>
          투자아이디어
          <textarea name="idea" rows={6} defaultValue={item.idea ?? ""} className={input} />
        </label>
        <label className={label}>
          리스크
          <textarea name="risk" rows={6} defaultValue={item.risk ?? ""} className={input} />
        </label>
        <label className={label}>
          매도 시그널
          <textarea name="sell_signal" rows={6} defaultValue={item.sell_signal ?? ""} className={input} />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button disabled={saving} className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
          {saving ? "저장 중…" : "저장"}
        </button>
        <button
          type="button"
          disabled={removing}
          onClick={() => {
            if (confirm(`${item.name}을 관심종목에서 삭제할까? 시세·재무·공시 기록도 함께 지워짐.`)) {
              startRemove(async () => {
                const r = await removeStock(item.ticker);
                if (r?.error) alert(r.error);
              });
            }
          }}
          className="rounded-md px-3 py-1.5 text-sm text-zinc-500 hover:text-red-600 disabled:opacity-50"
        >
          삭제
        </button>
        {state && <span className={`text-xs ${state.error ? "text-amber-600" : "text-zinc-500"}`}>{state.error ?? state.ok}</span>}
      </div>
    </form>
  );
}
