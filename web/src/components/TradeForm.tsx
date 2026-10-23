"use client";

import { useActionState, useState, useTransition } from "react";
import { addCashFlow, addTrade, deleteCashFlow, deleteTrade, saveFeeRates } from "@/app/actions";
import { estimateFee, KR_SELL_TAX_PCT, type FeeRates } from "@/lib/trades";

const input = "rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700";
const button = "rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900";

type Option = { ticker: string; name: string; market: "KR" | "US"; avg_price?: number | null; quantity?: number | null };

// 매매 기록 입력. 저장하면 포트폴리오의 매입단가·보유수량과 현금이 자동으로 바뀜
export function TradeForm({ options, fx, today, rates }: { options: Option[]; fx: number | null; today: string; rates: FeeRates }) {
  const [state, action, pending] = useActionState(addTrade, null);
  const [ticker, setTicker] = useState("");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("");
  const picked = options.find((o) => o.ticker === ticker);
  const us = picked?.market === "US";
  const toNum = (v: string) => Number(v.replace(/,/g, "")) || 0;
  const fee = picked ? estimateFee(picked.market, side, toNum(price), toNum(qty), rates) : 0;
  // 보유 종목을 위로
  const sorted = [...options].sort((a, b) => Number((b.quantity ?? 0) > 0) - Number((a.quantity ?? 0) > 0));
  return (
    <form
      action={action}
      onReset={() => {
        setPrice("");
        setQty("");
      }}
      className="space-y-2"
    >
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
        <input name="price" inputMode="decimal" placeholder={us ? "체결 평단($)" : "체결 평단"} onChange={(e) => setPrice(e.target.value)} className={`${input} w-28`} />
        <input name="quantity" inputMode="decimal" placeholder="체결 수량" onChange={(e) => setQty(e.target.value)} className={`${input} w-24`} />
        {us && <input key={`fx-${ticker}`} name="fx" inputMode="decimal" placeholder="환율" defaultValue={fx ?? ""} className={`${input} w-24`} title="체결 당시 원/달러" />}
        <label className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
          <input type="checkbox" name="cash" defaultChecked />
          현금에 반영
        </label>
      </div>
      <details className="text-xs text-zinc-500">
        <summary className="cursor-pointer">
          수수료·세금 자동 계산: <span className="tabular-nums">{fee ? `${us ? "$" : ""}${fee.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}${us ? "" : "원"}` : "-"}</span>
          {picked && (us ? ` (수수료 ${rates.us}%)` : ` (수수료 ${rates.kr}%${side === "sell" ? ` + 거래세 ${KR_SELL_TAX_PCT}%` : ""})`)}
        </summary>
        <div className="mt-1.5 flex items-center gap-2">
          <input name="fee" inputMode="decimal" placeholder="직접 입력 (비우면 자동)" className={`${input} w-44`} />
          <span>실제 금액이 다를 때만 입력</span>
        </div>
      </details>
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

// 현금 입금·출금 기록. 저장하면 현금 잔고가 바로 바뀜
export function CashFlowForm({ today }: { today: string }) {
  const [state, action, pending] = useActionState(addCashFlow, null);
  const [kind, setKind] = useState<"deposit" | "withdraw">("deposit");
  return (
    <form action={action} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" name="flow_date" defaultValue={today} className={input} />
        <div className="flex overflow-hidden rounded-md border border-zinc-300 text-sm dark:border-zinc-700">
          {(["deposit", "withdraw"] as const).map((k) => (
            <label key={k} className={`cursor-pointer px-3 py-1.5 ${kind === k ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : ""}`}>
              <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
              {k === "deposit" ? "입금" : "출금"}
            </label>
          ))}
        </div>
        <input name="amount" inputMode="numeric" placeholder="금액(원)" className={`${input} w-36`} />
        <input name="memo" placeholder="메모 (예: 월급 적립)" className={`${input} min-w-0 flex-1`} />
        <label className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400" title="이미 현금에 들어가 있는 지난 입금을 기록만 할 때는 끔">
          <input type="checkbox" name="cash" defaultChecked />
          현금에 반영
        </label>
        <button disabled={pending} className={button}>
          기록
        </button>
      </div>
      {state && <p className={`text-xs ${state.error ? "text-amber-600" : "text-zinc-500"}`}>{state.error ?? state.ok}</p>}
    </form>
  );
}

export function DeleteCashFlowButton({ id, label }: { id: number; label: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      className="text-xs text-zinc-400 hover:text-red-600 disabled:opacity-50"
      onClick={() => {
        if (!confirm(`${label} 기록을 지울까? 현금도 되돌아감`)) return;
        start(async () => {
          const r = await deleteCashFlow(id);
          if (r?.error) alert(r.error);
        });
      }}
    >
      삭제
    </button>
  );
}

// 수수료율(%) 설정. 자동 계산에 씀
export function FeeRateForm({ rates }: { rates: FeeRates }) {
  const [state, action, pending] = useActionState(saveFeeRates, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
      <span>수수료율</span>
      <label className="flex items-center gap-1">
        국내 <input name="fee_kr_pct" inputMode="decimal" defaultValue={rates.kr} className={`${input} w-24 text-right`} />%
      </label>
      <label className="flex items-center gap-1">
        미국 <input name="fee_us_pct" inputMode="decimal" defaultValue={rates.us} className={`${input} w-20 text-right`} />%
      </label>
      <button disabled={pending} className="rounded-md border border-zinc-300 px-2 py-1 disabled:opacity-50 dark:border-zinc-700">
        저장
      </button>
      {state && <span className={state.error ? "text-amber-600" : ""}>{state.error ?? state.ok}</span>}
      <span className="w-full text-zinc-400">기본값은 나무증권 온라인(국내 0.0036396%, 미국 0.25%). 국내 매도는 거래세 {KR_SELL_TAX_PCT}%가 자동으로 더해짐. 이벤트 요율을 받고 있으면 그 값으로 바꿀 것.</span>
    </form>
  );
}
