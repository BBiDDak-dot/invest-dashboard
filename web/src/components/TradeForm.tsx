"use client";

import { useActionState, useState, useTransition } from "react";
import { addTrade, deleteTrade } from "@/app/actions";

const input = "rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700";
const button = "rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900";

type Option = { ticker: string; name: string; market: "KR" | "US"; avg_price?: number | null; quantity?: number | null };

// 매매 기록 입력. 저장하면 포트폴리오의 매입단가·보유수량과 현금이 자동으로 바뀜
export function TradeForm({ options, fx, today }: { options: Option[]; fx: number | null; today: string }) {
  const [state, action, pending] = useActionState(addTrade, null);
  const [ticker, setTicker] = useState("");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const picked = options.find((o) => o.ticker === ticker);
  const us = picked?.market === "US";
  // 보유 종목을 위로
  const sorted = [...options].sort((a, b) => Number((b.quantity ?? 0) > 0) - Number((a.quantity ?? 0) > 0));
  return (
    <form action={action} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" name="trade_date" defaultValue={today} className={input} />
        <div className="flex overflow-hidden rounded-md border border-zinc-300 text-sm dark:border-zinc-700">
          {(["buy", "sell"] as const).map((s) => (
            <label
              key={s}
              className={`cursor-pointer px-3 py-1.5 ${side === s ? (s === "buy" ? "bg-red-600 text-white" : "bg-blue-600 text-white") : ""}`}
            >
              <input type="radio" name="side" value={s} checked={side === s} onChange={() => setSide(s)} className="sr-only" />
              {s === "buy" ? "매수" : "매도"}
            </label>
          ))}
        </div>
        <select name="ticker" className={`${input} min-w-0 max-w-full`} value={ticker} onChange={(e) => setTicker(e.target.value)}>
          <option value="" disabled>
            종목 선택 (관심종목)
          </option>
          {sorted.map((o) => (
            <option key={o.ticker} value={o.ticker}>
              {o.name} {o.ticker}
              {o.quantity ? ` · ${o.quantity}주` : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input name="price" inputMode="decimal" placeholder={us ? "체결 단가($)" : "체결 단가"} className={`${input} w-28`} />
        <input name="quantity" inputMode="decimal" placeholder="수량" className={`${input} w-24`} />
        <input name="fee" inputMode="decimal" placeholder={us ? "수수료·세금($)" : "수수료·세금"} className={`${input} w-28`} />
        {us && <input key={`fx-${ticker}`} name="fx" inputMode="decimal" placeholder="환율" defaultValue={fx ?? ""} className={`${input} w-24`} title="체결 당시 원/달러" />}
        <label className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
          <input type="checkbox" name="cash" defaultChecked />
          현금에 반영
        </label>
      </div>
      <textarea name="reason" rows={2} placeholder="매매 이유 (왜 샀는지·팔았는지, 나중에 복기용)" className={`${input} w-full`} />
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={pending} className={button}>
          기록
        </button>
        {state && <span className={`text-xs ${state.error ? "text-amber-600" : "text-zinc-500"}`}>{state.error ?? state.ok}</span>}
      </div>
      {picked && (picked.quantity ?? 0) > 0 && (
        <p className="text-xs text-zinc-500">
          현재 보유 {picked.quantity}주 · 평단 {picked.avg_price?.toLocaleString("ko-KR", { maximumFractionDigits: 2 }) ?? "-"}
        </p>
      )}
      <p className="text-xs text-zinc-400">
        기록하면 매입단가(이동평균)·보유수량·현금이 자동으로 바뀜. 일지를 처음 쓰는 종목은 지금 보유분이 기초 잔고로 먼저 잡힘. 관심종목에 없는 종목은 먼저 관심종목에 추가할 것.
      </p>
    </form>
  );
}

export function DeleteTradeButton({ id, label }: { id: number; label: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      className="text-xs text-zinc-400 hover:text-red-600 disabled:opacity-50"
      onClick={() => {
        if (!confirm(`${label} 기록을 지울까? 보유수량·평단·현금도 되돌아감`)) return;
        start(async () => {
          const r = await deleteTrade(id);
          if (r?.error) alert(r.error);
        });
      }}
    >
      삭제
    </button>
  );
}
