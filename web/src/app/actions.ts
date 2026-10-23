"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AUTH_COOKIE, authToken } from "@/lib/auth";
import { count, insert, remove, select, storage, update, type Security, type WatchItem } from "@/lib/db";
import { writeEarningsReport, reportInput } from "@/lib/earningsReport";
import { getCash, getEarningsTarget, getFeeRates, getWatchItems } from "@/lib/queries";
import { kstToday } from "@/lib/format";
import { buildLedger, cashDelta, estimateFee, flowDelta, type CashFlow, type Trade } from "@/lib/trades";
import { summarizeReports, summarizeVideo } from "@/lib/summarize";
import { fetchYearPrices } from "@/lib/yahoo";

export type ActionState = { ok?: string; error?: string } | null;

// 편집은 SITE_PASSWORD로 로그인한 경우에만 허용 (사이트가 공개 주소라서)
async function requireAuth() {
  const token = await authToken();
  if (!token) throw new Error("SITE_PASSWORD가 설정되지 않아 편집이 막혀 있음 (Vercel 환경변수에 추가 필요)");
  if ((await cookies()).get(AUTH_COOKIE)?.value !== token) throw new Error("로그인이 필요함");
}

async function run(fn: () => Promise<string | void>): Promise<ActionState> {
  try {
    await requireAuth();
    return { ok: (await fn()) || "저장됨" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------- 로그인 ----------

export async function login(_: ActionState, form: FormData): Promise<ActionState> {
  const token = await authToken();
  if (!token) return { error: "SITE_PASSWORD가 설정되지 않음" };
  if (form.get("password") !== process.env.SITE_PASSWORD) return { error: "비밀번호가 틀림" };
  (await cookies()).set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 180,
    path: "/",
  });
  const next = String(form.get("next") || "/");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  (await cookies()).delete(AUTH_COOKIE);
  redirect("/login");
}

// ---------- 관심종목 ----------

export async function searchSecurities(q: string): Promise<Security[]> {
  await requireAuth();
  const term = q.trim().replace(/[,()*%"\\]/g, "");
  if (!term) return [];
  const pattern = encodeURIComponent(`*${term}*`);
  const rows = await select<Security>(
    "securities",
    `select=ticker,market,name,corp_code&or=(name.ilike.${pattern},ticker.ilike.${pattern})&limit=50`,
  );
  const t = term.toLowerCase();
  const rank = (s: Security) =>
    s.ticker.toLowerCase() === t || s.name.toLowerCase() === t ? 0 : s.name.toLowerCase().startsWith(t) ? 1 : 2;
  return rows.sort((a, b) => rank(a) - rank(b) || a.name.length - b.name.length).slice(0, 15);
}

export async function addStock(s: Security): Promise<ActionState> {
  return run(async () => {
    const existing = await getWatchItems();
    if (existing.some((w) => w.ticker === s.ticker)) return `${s.name}은 이미 등록돼 있음`;
    await insert("watchlist", {
      ticker: s.ticker,
      market: s.market,
      name: s.name,
      corp_code: s.corp_code,
      sort_order: Math.max(0, ...existing.map((w) => w.sort_order)) + 1,
    });
    let note = "";
    try {
      const prices = await fetchYearPrices(s.ticker, s.market);
      if (prices.length) await insert("prices", prices, { upsert: true });
      else note = " (시세는 다음 수집 때 채워짐)";
    } catch {
      note = " (시세는 다음 수집 때 채워짐)";
    }
    revalidatePath("/", "layout");
    return `${s.name} 추가함${note}. 재무는 다음 수집 때 채워짐`;
  });
}

const numOrNull = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").replace(/,/g, "").trim();
  return s === "" || Number.isNaN(Number(s)) ? null : Number(s);
};
const textOrNull = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;

export async function updateStock(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const ticker = String(form.get("ticker"));
    const patch: Partial<WatchItem> = {
      name: textOrNull(form.get("name")) ?? undefined,
      group_name: textOrNull(form.get("group_name")),
      sector: textOrNull(form.get("sector")),
      target_price: numOrNull(form.get("target_price")),
      fwd_pe: numOrNull(form.get("fwd_pe")),
      idea: textOrNull(form.get("idea")),
      risk: textOrNull(form.get("risk")),
      sell_signal: textOrNull(form.get("sell_signal")),
      sort_order: numOrNull(form.get("sort_order")) ?? 0,
      avg_price: numOrNull(form.get("avg_price")),
      quantity: numOrNull(form.get("quantity")),
    };
    // 매매 일지로 관리하는 종목은 매입단가·수량을 일지가 정함
    if (await hasTrades(ticker)) {
      delete patch.avg_price;
      delete patch.quantity;
    }
    await update("watchlist", `ticker=eq.${encodeURIComponent(ticker)}`, patch);
    revalidatePath("/", "layout");
  });
}

// 표에서 칸 하나 직접 편집
const NUM_FIELDS = ["target_price", "fwd_pe", "debt_ratio", "reserve_ratio", "avg_price", "quantity"] as const;
const TEXT_FIELDS = ["group_name", "sector", "idea", "risk", "sell_signal"] as const;
export type EditField = (typeof NUM_FIELDS)[number] | (typeof TEXT_FIELDS)[number];

export async function updateField(ticker: string, field: EditField, value: string): Promise<ActionState> {
  return run(async () => {
    let v: number | string | null;
    if ((NUM_FIELDS as readonly string[]).includes(field)) {
      v = numOrNull(value);
      if (v === null && value.replace(/,/g, "").trim() !== "") throw new Error("숫자로 입력할 것");
    } else if ((TEXT_FIELDS as readonly string[]).includes(field)) v = textOrNull(value);
    else throw new Error("편집할 수 없는 칸");
    if ((field === "avg_price" || field === "quantity") && (await hasTrades(ticker))) throw new Error(JOURNALED);
    await update("watchlist", `ticker=eq.${encodeURIComponent(ticker)}`, { [field]: v });
    revalidatePath("/", "layout");
  });
}

export async function setStarred(ticker: string, starred: boolean): Promise<ActionState> {
  return run(async () => {
    await update("watchlist", `ticker=eq.${encodeURIComponent(ticker)}`, { starred });
    revalidatePath("/", "layout");
  });
}

// 포트폴리오: 매입단가·보유수량 저장 (수량 0이면 포트폴리오에서 빠짐)
export async function saveHolding(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const ticker = String(form.get("ticker") ?? "");
    if (!ticker) throw new Error("종목을 고를 것");
    if (await hasTrades(ticker)) throw new Error(JOURNALED);
    await update("watchlist", `ticker=eq.${encodeURIComponent(ticker)}`, {
      avg_price: numOrNull(form.get("avg_price")),
      quantity: numOrNull(form.get("quantity")),
    });
    revalidatePath("/", "layout");
  });
}

export async function saveCash(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    await insert("settings", { key: "cash_krw", value: numOrNull(form.get("cash")) ?? 0 }, { upsert: true });
    revalidatePath("/", "layout");
  });
}

export async function removeStock(ticker: string): Promise<ActionState> {
  const state = await run(async () => {
    // 시세·재무·공시는 cascade로 함께 삭제됨
    await remove("watchlist", `ticker=eq.${encodeURIComponent(ticker)}`);
  });
  if (state?.error) return state;
  revalidatePath("/", "layout");
  redirect("/watchlist");
}

// ---------- 매매 일지 ----------
// 매매를 기록·삭제하면 관심종목의 매입단가·보유수량을 일지로 다시 계산하고, 현금도 함께 바꿈

const JOURNALED = "매매 일지로 관리 중인 종목이라 매입단가·수량은 매매 일지에서 기록함";

async function hasTrades(ticker: string) {
  try {
    return (await count("trades", `ticker=eq.${encodeURIComponent(ticker)}`)) > 0;
  } catch {
    return false; // 015_trades.sql 실행 전
  }
}

async function tradesOf(ticker: string) {
  return select<Trade>("trades", `select=*&ticker=eq.${encodeURIComponent(ticker)}`);
}

async function syncPosition(ticker: string, trades: Trade[]) {
  const p = buildLedger(trades).positions.get(ticker) ?? { quantity: 0, avgPrice: null };
  await update("watchlist", `ticker=eq.${encodeURIComponent(ticker)}`, { quantity: p.quantity, avg_price: p.avgPrice });
}

async function addCash(delta: number) {
  if (!delta) return;
  await insert("settings", { key: "cash_krw", value: Math.round((await getCash()) + delta) }, { upsert: true });
}

export async function addTrade(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const ticker = String(form.get("ticker") ?? "");
    const side = String(form.get("side") ?? "");
    const price = numOrNull(form.get("price"));
    const quantity = numOrNull(form.get("quantity"));
    const feeInput = numOrNull(form.get("fee")); // 비우면 수수료율로 자동 계산
    const date = String(form.get("trade_date") || kstToday());
    if (!ticker) throw new Error("종목을 고를 것");
    if (side !== "buy" && side !== "sell") throw new Error("매수·매도를 고를 것");
    if (price == null || price < 0) throw new Error("체결 단가를 입력할 것");
    if (!quantity || quantity <= 0) throw new Error("수량을 입력할 것");
    if (feeInput != null && feeInput < 0) throw new Error("수수료는 0 이상");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("날짜 형식이 맞지 않음");

    const [item] = await select<WatchItem>("watchlist", `select=*&ticker=eq.${encodeURIComponent(ticker)}`);
    if (!item) throw new Error("관심종목에 없는 종목");
    const fx = item.market === "US" ? numOrNull(form.get("fx")) : null;
    const applyCash = form.get("cash") === "on";
    if (item.market === "US" && applyCash && !fx) throw new Error("현금에 반영하려면 환율을 입력할 것");

    const fee = feeInput ?? estimateFee(item.market, side, price, quantity, await getFeeRates());

    const existing = await tradesOf(ticker);
    const base = { ticker, market: item.market, name: item.name };
    // 일지를 처음 쓰는 종목에 이미 보유분이 있으면 그 수량·단가를 기초 잔고로 먼저 남김
    const open =
      existing.length === 0 && (item.quantity ?? 0) > 0
        ? { ...base, trade_date: date, side: "open", price: item.avg_price ?? 0, quantity: item.quantity, fee: 0, fx: null, cash_applied: false, reason: "일지 시작 전 보유분" }
        : null;
    const trade = { ...base, trade_date: date, side, price, quantity, fee, fx, cash_applied: applyCash, reason: textOrNull(form.get("reason")) };

    // 저장 전에 계산해 보유수량보다 많이 파는지 확인
    const draft = [...existing, ...(open ? [{ ...open, id: 1e15 } as Trade] : []), { ...trade, id: 1e15 + 1 } as Trade];
    const ledger = buildLedger(draft, fx);
    if (ledger.error) throw new Error(ledger.error);

    if (open) await insert("trades", open);
    const [saved] = await insert<Trade>("trades", trade);
    await syncPosition(ticker, [...existing, ...(open ? [{ ...open, id: 0 } as Trade] : []), saved]);
    if (applyCash) await addCash(cashDelta(saved));
    revalidatePath("/", "layout");

    const r = ledger.realized.get(1e15 + 1);
    const label = `${item.name} ${side === "buy" ? "매수" : "매도"} 기록함`;
    return r?.pnlKrw != null ? `${label} · 실현손익 ${Math.round(r.pnlKrw).toLocaleString("ko-KR")}원` : label;
  });
}

export async function deleteTrade(id: number): Promise<ActionState> {
  return run(async () => {
    const [t] = await select<Trade>("trades", `select=*&id=eq.${id}`);
    if (!t) throw new Error("이미 지워진 기록");
    const rest = (await tradesOf(t.ticker)).filter((x) => x.id !== id);
    const { error } = buildLedger(rest);
    if (error) throw new Error(`이 기록을 지우면 이후 매도가 맞지 않음 (${error})`);
    await remove("trades", `id=eq.${id}`);
    await syncPosition(t.ticker, rest);
    if (t.cash_applied) await addCash(-cashDelta(t));
    revalidatePath("/", "layout");
    return "삭제함";
  });
}

// 수수료율(%) 저장
export async function saveFeeRates(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const kr = numOrNull(form.get("fee_kr_pct"));
    const us = numOrNull(form.get("fee_us_pct"));
    if (kr == null || us == null || kr < 0 || us < 0) throw new Error("수수료율을 숫자로 입력할 것");
    await insert("settings", [{ key: "fee_kr_pct", value: kr }, { key: "fee_us_pct", value: us }], { upsert: true });
    revalidatePath("/", "layout");
  });
}

// ---------- 퇴직연금 ----------
const PENSION_KINDS = ["etf", "fund", "deposit", "cash"] as const;

export async function addPensionHolding(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const kind = String(form.get("kind") ?? "");
    if (!(PENSION_KINDS as readonly string[]).includes(kind)) throw new Error("구분을 고를 것");
    const name = textOrNull(form.get("name"));
    if (!name) throw new Error("상품명을 입력할 것");
    const ticker = textOrNull(form.get("ticker"));
    if (ticker && !/^[0-9A-Z]{6}$/.test(ticker)) throw new Error("ETF 코드는 6자리 (예: 069500)");
    const row = {
      account: textOrNull(form.get("account")) ?? "IRP",
      kind,
      ticker: kind === "etf" ? ticker : null,
      name,
      quantity: kind === "etf" ? numOrNull(form.get("quantity")) : null,
      avg_price: kind === "etf" ? numOrNull(form.get("avg_price")) : null,
      principal: kind === "etf" ? null : numOrNull(form.get("principal")),
      amount: kind === "etf" ? null : numOrNull(form.get("amount")),
      safe: form.get("safe") === "on" || kind === "deposit" || kind === "cash",
      memo: textOrNull(form.get("memo")),
    };
    if (kind === "etf" && (!row.ticker || !row.quantity)) throw new Error("ETF는 코드와 수량을 입력할 것");
    if (kind !== "etf" && row.amount == null) throw new Error("평가금액을 입력할 것");
    await insert("pension_holdings", row);
    revalidatePath("/portfolio");
    return `${name} 추가함`;
  });
}

// 표에서 칸 하나 편집
const PENSION_NUM = ["quantity", "avg_price", "principal", "amount"] as const;
const PENSION_TEXT = ["account", "name", "memo"] as const;
export type PensionField = (typeof PENSION_NUM)[number] | (typeof PENSION_TEXT)[number] | "safe";

export async function updatePensionField(id: number, field: PensionField, value: string): Promise<ActionState> {
  return run(async () => {
    let v: number | string | boolean | null;
    if ((PENSION_NUM as readonly string[]).includes(field)) {
      v = numOrNull(value);
      if (v === null && value.replace(/,/g, "").trim() !== "") throw new Error("숫자로 입력할 것");
    } else if ((PENSION_TEXT as readonly string[]).includes(field)) {
      v = textOrNull(value);
      if (field !== "memo" && !v) throw new Error("비워 둘 수 없음");
    } else if (field === "safe") v = value === "true";
    else throw new Error("편집할 수 없는 칸");
    await update("pension_holdings", `id=eq.${Number(id)}`, { [field]: v });
    revalidatePath("/portfolio");
  });
}

export async function deletePensionHolding(id: number): Promise<ActionState> {
  return run(async () => {
    await remove("pension_holdings", `id=eq.${Number(id)}`);
    revalidatePath("/portfolio");
  });
}

// 현금 입금·출금: 기록하면 현금 잔고가 바뀌고, 지우면 되돌림
export async function addCashFlow(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const kind = String(form.get("kind") ?? "");
    const amount = numOrNull(form.get("amount"));
    const date = String(form.get("flow_date") || kstToday());
    if (kind !== "deposit" && kind !== "withdraw") throw new Error("입금·출금을 고를 것");
    if (!amount || amount <= 0) throw new Error("금액을 입력할 것");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("날짜 형식이 맞지 않음");
    const applyCash = form.get("cash") === "on";
    const [saved] = await insert<CashFlow>("cash_flows", { flow_date: date, kind, amount, memo: textOrNull(form.get("memo")), cash_applied: applyCash });
    if (applyCash) await addCash(flowDelta(saved));
    revalidatePath("/", "layout");
    return `${kind === "deposit" ? "입금" : "출금"} ${Math.round(amount).toLocaleString("ko-KR")}원 기록함`;
  });
}

export async function deleteCashFlow(id: number): Promise<ActionState> {
  return run(async () => {
    const [f] = await select<CashFlow>("cash_flows", `select=*&id=eq.${id}`);
    if (!f) throw new Error("이미 지워진 기록");
    await remove("cash_flows", `id=eq.${id}`);
    if (f.cash_applied) await addCash(-flowDelta(f));
    revalidatePath("/", "layout");
    return "삭제함";
  });
}

// ---------- 뉴스 메모 ----------

// 비워서 저장하면 메모 삭제
export async function saveNewsNote(
  item: { id: string; title: string; url: string; source: string; summary: string; time: string },
  note: string,
): Promise<ActionState> {
  const state = await run(async () => {
    const text = note.trim();
    if (!/^[\w-]+$/.test(item.id)) throw new Error("잘못된 기사 id");
    if (!text) {
      await remove("news_notes", `id=eq.${encodeURIComponent(item.id)}`);
      return "메모 삭제됨";
    }
    await insert(
      "news_notes",
      { id: item.id, title: item.title, url: item.url, source: item.source, summary: item.summary, news_time: item.time, note: text, updated_at: new Date().toISOString() },
      { upsert: true },
    );
  });
  if (!state?.error) revalidatePath("/news");
  return state;
}

// ---------- 실적 스크리닝 ----------

export async function saveEarningsNote(id: string, note: string): Promise<ActionState> {
  const state = await run(async () => {
    if (!/^\d{14}$/.test(id)) throw new Error("잘못된 공시 번호");
    const text = note.trim();
    await update("earnings_screen", `id=eq.${id}`, { note: text || null, note_updated_at: text ? new Date().toISOString() : null });
    return text ? "저장됨" : "메모 삭제됨";
  });
  if (!state?.error) revalidatePath("/earnings");
  return state;
}

export async function saveUsEarningsNote(id: string, note: string): Promise<ActionState> {
  const state = await run(async () => {
    if (!/^\d{1,10}-\d{4}\.[1-4]Q$/.test(id)) throw new Error("잘못된 실적 번호");
    const text = note.trim();
    await update("us_earnings", `id=eq.${id}`, { note: text || null, note_updated_at: text ? new Date().toISOString() : null });
    return text ? "저장됨" : "메모 삭제됨";
  });
  if (!state?.error) revalidatePath("/earnings/us");
  return state;
}

// 실적 스크리닝 종목을 누르면 보는 실적 상승 분석 리포트 (Gemini + 구글 검색). 있으면 새로 써서 바꿈
export async function generateEarningsReport(key: string): Promise<ActionState> {
  const state = await run(async () => {
    const target = await getEarningsTarget(key);
    if (!target) throw new Error("실적 공시를 찾지 못함");
    const input = reportInput(target);
    const { body, model } = await writeEarningsReport(input);
    await insert(
      "earnings_reports",
      { id: key, market: input.market, name: input.name, period: target.kr?.period ?? target.us?.period, body, model, created_at: new Date().toISOString() },
      { upsert: true },
    );
    return "작성됨";
  });
  if (!state?.error) revalidatePath(`/earnings/r/${key}`);
  return state;
}

// ---------- 리포트 ----------

export async function prepareReportUpload(names: string[]): Promise<{ uploads?: { path: string; url: string }[]; error?: string }> {
  try {
    await requireAuth();
    const day = new Date().toISOString().slice(0, 10);
    const uploads = await Promise.all(
      names.map(async (name, i) => {
        const path = `${day}/${Date.now()}-${i}.pdf`;
        return { path, url: await storage.signUpload("reports", path) };
      }),
    );
    return { uploads };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

const YOUTUBE = /^https:\/\/(www\.|m\.)?(youtube\.com\/(watch\?v=|shorts\/|live\/)|youtu\.be\/)[\w-]{6,}/;

// 유튜브 영상 하나를 먼저 읽어 메모로 돌려줌. 영상마다 따로 불러서 서버 시간 제한(300초)을 영상별로 씀
export async function readYoutube(url: string): Promise<{ notes?: string; error?: string }> {
  try {
    await requireAuth();
    const u = url.trim();
    if (!YOUTUBE.test(u)) throw new Error(`유튜브 영상 주소가 아님: ${u}`);
    return { notes: await summarizeVideo(u) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function createReportSummary(
  files: { path: string; name: string }[],
  youtube: string[],
  reportDate: string,
  videoNotes: { url: string; notes: string }[] = [],
): Promise<{ id?: string; error?: string }> {
  try {
    await requireAuth();
    const links = youtube.map((u) => u.trim()).filter(Boolean);
    const bad = [...links, ...videoNotes.map((v) => v.url)].find((u) => !YOUTUBE.test(u));
    if (bad) throw new Error(`유튜브 영상 주소가 아님: ${bad}`);
    if (files.length === 0 && links.length === 0 && videoNotes.length === 0) throw new Error("PDF나 유튜브 링크가 없음");
    const [pdfs, watch] = await Promise.all([
      Promise.all(files.map(async (f) => ({ name: f.name, pdf: await storage.download("reports", f.path) }))),
      getWatchItems(),
    ]);
    const sources = [
      ...pdfs,
      ...links.map((u) => ({ name: u, youtube: u })),
      ...videoNotes.map((v) => ({ name: v.url, notes: v.notes.slice(0, 30000) })),
    ];
    const { text, model } = await summarizeReports(sources, watch);
    const title = text.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? null;
    const base = {
      report_date: /^\d{4}-\d{2}-\d{2}$/.test(reportDate) ? reportDate : undefined,
      file_names: sources.map((s) => s.name),
      title,
      summary: text,
      model,
    };
    // 원본 PDF 경로도 저장 (007 SQL을 아직 안 돌렸으면 경로 없이 저장)
    const [row] = await insert<{ id: string }>("reports", { ...base, file_paths: files.map((f) => f.path) }).catch(() =>
      insert<{ id: string }>("reports", base),
    );
    revalidatePath("/reports");
    return { id: row.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteReport(id: string): Promise<ActionState> {
  const state = await run(async () => {
    await remove("reports", `id=eq.${encodeURIComponent(id)}`);
  });
  if (state?.error) return state;
  revalidatePath("/reports");
  redirect("/reports");
}
