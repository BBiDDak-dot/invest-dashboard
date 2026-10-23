"use client";

import { useActionState, useState, useTransition } from "react";
import { addPensionHolding, deletePensionHolding, updatePensionField, type PensionField } from "@/app/actions";

const input = "rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700";
const button = "rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900";

const KINDS = [
  { v: "etf", label: "ETF" },
  { v: "fund", label: "펀드·TDF" },
  { v: "deposit", label: "예금·원리금보장" },
  { v: "cash", label: "현금" },
] as const;

// 퇴직연금 상품 추가. ETF는 코드·수량·평단, 나머지는 원금·평가금액
export function PensionForm({ accounts }: { accounts: string[] }) {
  const [state, action, pending] = useActionState(addPensionHolding, null);
  const [kind, setKind] = useState<(typeof KINDS)[number]["v"]>("etf");
  const etf = kind === "etf";
  return (
    <form action={action} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input name="account" list="pension-accounts" defaultValue={accounts[0] ?? "IRP"} placeholder="계좌 (IRP, DC…)" className={`${input} w-28`} />
        <datalist id="pension-accounts">
          {["IRP", "DC", "연금저축", ...accounts].filter((a, i, l) => l.indexOf(a) === i).map((a) => (
            <option key={a} value={a} />
          ))}
        </datalist>
        <select name="kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={input}>
          {KINDS.map((k) => (
            <option key={k.v} value={k.v}>
              {k.label}
            </option>
          ))}
        </select>
        <input name="name" placeholder="상품명" className={`${input} min-w-0 flex-1`} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {etf ? (
          <>
            <input name="ticker" placeholder="ETF 코드 6자리" className={`${input} w-32`} />
            <input name="quantity" inputMode="decimal" placeholder="수량" className={`${input} w-24`} />
            <input name="avg_price" inputMode="decimal" placeholder="매입단가" className={`${input} w-28`} />
            <label className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400" title="채권형 ETF 등 위험자산 한도에서 빠지는 상품">
              <input type="checkbox" name="safe" />
              안전자산
            </label>
          </>
        ) : (
          <>
            <input name="principal" inputMode="numeric" placeholder="원금(원)" className={`${input} w-32`} />
            <input name="amount" inputMode="numeric" placeholder="현재 평가금액(원)" className={`${input} w-36`} />
            {kind === "fund" && (
              <label className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400" title="채권형 펀드, 적격 TDF 등">
                <input type="checkbox" name="safe" />
                안전자산
              </label>
            )}
          </>
        )}
        <input name="memo" placeholder="메모" className={`${input} min-w-0 flex-1`} />
        <button disabled={pending} className={button}>
          추가
        </button>
      </div>
      {state && <p className={`text-xs ${state.error ? "text-amber-600" : "text-zinc-500"}`}>{state.error ?? state.ok}</p>}
    </form>
  );
}

// 칸을 누르면 바로 편집. Enter나 바깥 클릭으로 저장, Esc로 취소
export function PensionCell({
  id,
  field,
  value,
  num,
  children,
}: {
  id: number;
  field: PensionField;
  value: string | number | null;
  num?: boolean;
  children: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const original = value == null ? "" : String(value);
  const save = () => {
    if (draft.trim() === original.trim()) return setEditing(false);
    start(async () => {
      const r = await updatePensionField(id, field, draft);
      if (r?.error) setError(r.error);
      else setEditing(false);
    });
  };
  if (!editing)
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(original);
          setError(null);
          setEditing(true);
        }}
        className="w-full cursor-text rounded px-1 text-inherit hover:bg-zinc-100 dark:hover:bg-zinc-800"
        style={{ textAlign: "inherit" }}
      >
        {children}
      </button>
    );
  return (
    <span className="inline-flex flex-col">
      <input
        autoFocus
        disabled={pending}
        inputMode={num ? "decimal" : undefined}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Escape") setEditing(false);
          else if (e.key === "Enter") {
            e.preventDefault();
            save();
          }
        }}
        className={`${input} w-28 py-0.5 ${num ? "text-right" : ""}`}
      />
      {error && <span className="text-xs text-amber-600">{error}</span>}
    </span>
  );
}

export function SafeToggle({ id, safe }: { id: number; safe: boolean }) {
  const [pending, start] = useTransition();
  return (
    <input
      type="checkbox"
      checked={safe}
      disabled={pending}
      onChange={(e) => start(async () => void (await updatePensionField(id, "safe", String(e.target.checked))))}
      title="안전자산이면 체크 (위험자산 70% 한도 계산에서 빠짐)"
    />
  );
}

export function DeletePensionButton({ id, name }: { id: number; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      className="text-xs text-zinc-400 hover:text-red-600 disabled:opacity-50"
      onClick={() => {
        if (!confirm(`${name}을(를) 퇴직연금에서 지울까?`)) return;
        start(async () => {
          const r = await deletePensionHolding(id);
          if (r?.error) alert(r.error);
        });
      }}
    >
      삭제
    </button>
  );
}
