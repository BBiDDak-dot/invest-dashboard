import "server-only";

// Supabase REST(PostgREST)를 fetch로 직접 호출함. 서버에서만 실행되므로 키가 브라우저로 나가지 않음.
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;

export const dbConfigured = Boolean(url && key);

export async function select<T>(table: string, query = ""): Promise<T[]> {
  if (!url || !key) return [];
  const res = await fetch(`${url}/rest/v1/${table}?${query}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`${table} 조회 실패: ${res.status}`);
  return res.json();
}

export type WatchItem = {
  ticker: string;
  market: "KR" | "US";
  name: string;
};

export type Price = {
  ticker: string;
  date: string;
  close: number;
  change_pct: number | null;
};

export type MacroSeries = {
  series_id: string;
  name: string;
  unit: string | null;
  country: string;
};

export type MacroObservation = {
  series_id: string;
  date: string;
  value: number;
};

export type Disclosure = {
  id: string;
  ticker: string;
  date: string;
  title: string;
  url: string;
};
