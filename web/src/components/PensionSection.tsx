import { Card } from "@/components/Card";
import { DeletePensionButton, PensionCell, PensionForm, SafeToggle } from "@/components/PensionForms";
import { changeColor, num, pct } from "@/lib/format";
import type { PensionRow } from "@/lib/queries";

const th = "px-2 py-2 font-normal whitespace-nowrap";
const td = "px-2 py-2 text-right tabular-nums whitespace-nowrap";
const KIND = { etf: "ETF", fund: "펀드·TDF", deposit: "예금", cash: "현금" } as const;
const RISK_LIMIT = 70; // 퇴직연금(DC·IRP) 위험자산 투자 한도 %

const signed = (v: number | null) => (v == null ? "-" : `${v > 0 ? "+" : ""}${num(v, 0)}`);

function sum(rows: PensionRow[]) {
  const evalKrw = rows.reduce((s, r) => s + (r.evalKrw ?? 0), 0);
  const known = rows.filter((r) => r.pnl != null && r.costKrw);
  const costKrw = known.reduce((s, r) => s + r.costKrw!, 0);
  const pnl = known.reduce((s, r) => s + r.pnl!, 0);
  return { evalKrw, costKrw, pnl, returnPct: costKrw ? (pnl / costKrw) * 100 : null };
}

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${color ?? ""}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-zinc-500 tabular-nums">{sub}</div>}
    </div>
  );
}

// 포트폴리오 탭 안의 퇴직연금 영역. 일반 계좌 순자산과 섞지 않고 따로 집계함
export function PensionSection({ rows, ready, netWorth }: { rows: PensionRow[]; ready: boolean; netWorth: number }) {
  if (!ready)
    return (
      <Card title="퇴직연금">
        <p className="text-sm text-zinc-500">Supabase에서 018_pension.sql을 실행하면 퇴직연금 계좌를 따로 관리할 수 있음.</p>
      </Card>
    );
  const all = sum(rows);
  const risky = rows.filter((r) => !r.safe).reduce((s, r) => s + (r.evalKrw ?? 0), 0);
  const riskPct = all.evalKrw ? (risky / all.evalKrw) * 100 : null;
  const accounts = [...new Set(rows.map((r) => r.account))];

  return (
    <section id="pension" className="scroll-mt-4 space-y-4">
      <h2 className="pt-2 text-lg font-semibold">퇴직연금</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="평가금액" value={`${num(all.evalKrw, 0)}원`} sub={`일반 계좌 포함 총자산 ${num(netWorth + all.evalKrw, 0)}원`} />
        <Kpi label="평가손익" value={`${signed(all.pnl)}원`} sub={`원금 ${num(all.costKrw, 0)}원`} color={changeColor(all.pnl)} />
        <Kpi label="수익률" value={pct(all.returnPct)} color={changeColor(all.returnPct)} />
        <Kpi
          label={`위험자산 비중 (한도 ${RISK_LIMIT}%)`}
          value={riskPct == null ? "-" : `${num(riskPct, 1)}%`}
          sub={riskPct != null && riskPct > RISK_LIMIT ? "한도 초과: 추가 매수가 막힐 수 있음" : "안전자산 체크 안 한 상품 합계"}
          color={riskPct != null && riskPct > RISK_LIMIT ? "text-amber-600" : undefined}
        />
      </div>

      <Card title="퇴직연금 보유 상품">
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-zinc-500">
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  <th className={th}>계좌</th>
                  <th className={th}>구분</th>
                  <th className={th}>상품명</th>
                  <th className={`${th} text-right`}>수량</th>
                  <th className={`${th} text-right`}>매입단가</th>
                  <th className={`${th} text-right`}>현재가</th>
                  <th className={`${th} text-right`}>원금</th>
                  <th className={`${th} text-right`}>평가금액</th>
                  <th className={`${th} text-right`}>손익</th>
                  <th className={`${th} text-right`}>수익률</th>
                  <th className={`${th} text-right`}>비중</th>
                  <th className={th}>안전</th>
                  <th className={th}>메모</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody>
                {accounts.map((acc) => {
                  const list = rows.filter((r) => r.account === acc);
                  const s = sum(list);
                  return [
                    ...list.map((r) => {
                      const etf = r.kind === "etf";
                      return (
                        <tr key={r.id} className="border-b border-zinc-100 dark:border-zinc-900">
                          <td className="px-2 py-2 whitespace-nowrap">
                            <PensionCell id={r.id} field="account" value={r.account}>
                              {r.account}
                            </PensionCell>
                          </td>
                          <td className="px-2 py-2 text-xs whitespace-nowrap text-zinc-500">{KIND[r.kind]}</td>
                          <td className="px-2 py-2 whitespace-nowrap">
                            <PensionCell id={r.id} field="name" value={r.name}>
                              <span className="font-medium">{r.name}</span>
                              {r.ticker && <span className="ml-1 text-xs text-zinc-400">{r.ticker}</span>}
                            </PensionCell>
                          </td>
                          <td className={td}>
                            {etf ? (
                              <PensionCell id={r.id} field="quantity" value={r.quantity} num>
                                {num(r.quantity, 4)}
                              </PensionCell>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className={td}>
                            {etf ? (
                              <PensionCell id={r.id} field="avg_price" value={r.avg_price} num>
                                {num(r.avg_price)}
                              </PensionCell>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className={td}>{etf ? num(r.price) : "-"}</td>
                          <td className={td}>
                            {etf ? (
                              num(r.costKrw, 0)
                            ) : (
                              <PensionCell id={r.id} field="principal" value={r.principal} num>
                                {num(r.principal, 0)}
                              </PensionCell>
                            )}
                          </td>
                          <td className={td}>
                            {etf ? (
                              num(r.evalKrw, 0)
                            ) : (
                              <PensionCell id={r.id} field="amount" value={r.amount} num>
                                {num(r.evalKrw, 0)}
                              </PensionCell>
                            )}
                          </td>
                          <td className={`${td} ${changeColor(r.pnl)}`}>{signed(r.pnl)}</td>
                          <td className={`${td} ${changeColor(r.returnPct)}`}>{pct(r.returnPct)}</td>
                          <td className={td}>{all.evalKrw && r.evalKrw != null ? `${num((r.evalKrw / all.evalKrw) * 100, 1)}%` : "-"}</td>
                          <td className="px-2 py-2 text-center">
                            <SafeToggle id={r.id} safe={r.safe} />
                          </td>
                          <td className="max-w-56 px-2 py-2 text-xs text-zinc-600 dark:text-zinc-400">
                            <PensionCell id={r.id} field="memo" value={r.memo}>
                              {r.memo || <span className="text-zinc-400">-</span>}
                            </PensionCell>
                          </td>
                          <td className="px-2 py-2">
                            <DeletePensionButton id={r.id} name={r.name} />
                          </td>
                        </tr>
                      );
                    }),
                    <tr key={`sum-${acc}`} className="border-b border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
                      <td colSpan={6} className="px-2 py-1.5 text-right text-xs">
                        {acc} 소계
                      </td>
                      <td className={`${td} py-1.5`}>{num(s.costKrw, 0)}</td>
                      <td className={`${td} py-1.5 font-medium`}>{num(s.evalKrw, 0)}</td>
                      <td className={`${td} py-1.5 ${changeColor(s.pnl)}`}>{signed(s.pnl)}</td>
                      <td className={`${td} py-1.5 ${changeColor(s.returnPct)}`}>{pct(s.returnPct)}</td>
                      <td className={`${td} py-1.5`}>{all.evalKrw ? `${num((s.evalKrw / all.evalKrw) * 100, 1)}%` : "-"}</td>
                      <td colSpan={3} />
                    </tr>,
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className={rows.length ? "mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-900" : ""}>
          <PensionForm accounts={accounts} />
        </div>
        <p className="mt-2 text-xs text-zinc-400">
          ETF는 코드를 넣으면 현재가가 자동으로 들어감. 펀드·TDF·예금은 평가금액을 직접 입력함(칸을 누르면 바로 수정). 예금·현금은 안전자산으로 자동 체크됨. 일반 계좌 순자산·매매 일지와는 섞이지 않음.
        </p>
      </Card>
    </section>
  );
}
