"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AUTH_COOKIE, authToken } from "@/lib/auth";
import { insert, remove, select, storage, update, type Security, type WatchItem } from "@/lib/db";
import { getWatchItems } from "@/lib/queries";
import { summarizeReports } from "@/lib/summarize";
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
    await update("watchlist", `ticker=eq.${encodeURIComponent(ticker)}`, patch);
    revalidatePath("/", "layout");
  });
}

// 포트폴리오: 매입단가·보유수량 저장 (수량 0이면 포트폴리오에서 빠짐)
export async function saveHolding(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const ticker = String(form.get("ticker") ?? "");
    if (!ticker) throw new Error("종목을 고를 것");
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

export async function createReportSummary(
  files: { path: string; name: string }[],
  youtube: string[],
  reportDate: string,
): Promise<{ id?: string; error?: string }> {
  try {
    await requireAuth();
    const links = youtube.map((u) => u.trim()).filter(Boolean);
    const bad = links.find((u) => !YOUTUBE.test(u));
    if (bad) throw new Error(`유튜브 영상 주소가 아님: ${bad}`);
    if (files.length === 0 && links.length === 0) throw new Error("PDF나 유튜브 링크가 없음");
    const [pdfs, watch] = await Promise.all([
      Promise.all(files.map(async (f) => ({ name: f.name, pdf: await storage.download("reports", f.path) }))),
      getWatchItems(),
    ]);
    const sources = [...pdfs, ...links.map((u) => ({ name: u, youtube: u }))];
    const { text, model } = await summarizeReports(sources, watch);
    const title = text.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? null;
    const [row] = await insert<{ id: string }>("reports", {
      report_date: /^\d{4}-\d{2}-\d{2}$/.test(reportDate) ? reportDate : undefined,
      file_names: sources.map((s) => s.name),
      title,
      summary: text,
      model,
    });
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
