import "server-only";

// Supabase REST(PostgREST)를 fetch로 직접 호출함. 서버에서만 실행되므로 키가 브라우저로 나가지 않음.
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;

export const dbConfigured = Boolean(url && key);

async function call(path: string, init: RequestInit = {}) {
  if (!url || !key) throw new Error("DB 미연결 (SUPABASE_URL, SUPABASE_KEY 확인)");
  const res = await fetch(`${url}${path}`, {
    ...init,
    // 편집 결과가 바로 보이도록 캐시하지 않음
    cache: "no-store",
    headers: { apikey: key, Authorization: `Bearer ${key}`, ...init.headers },
  });
  if (!res.ok) throw new Error(`${path.split("?")[0]} 요청 실패: ${res.status} ${await res.text()}`);
  return res;
}

export async function select<T>(table: string, query = ""): Promise<T[]> {
  if (!dbConfigured) return [];
  return (await call(`/rest/v1/${table}?${query}`)).json();
}

// PostgREST는 한 번에 최대 1000행만 돌려주므로 1000행씩 나눠 끝까지 읽음
export async function selectAll<T>(table: string, query = ""): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await select<T>(table, `${query}&limit=1000&offset=${offset}`);
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

export async function insert<T>(table: string, rows: object | object[], { upsert = false } = {}): Promise<T[]> {
  const res = await call(`/rest/v1/${table}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: `return=representation${upsert ? ",resolution=merge-duplicates" : ""}`,
    },
    body: JSON.stringify(rows),
  });
  return res.json();
}

export async function update(table: string, query: string, patch: object) {
  await call(`/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export async function remove(table: string, query: string) {
  await call(`/rest/v1/${table}?${query}`, { method: "DELETE" });
}

// Supabase Storage: 브라우저가 서버를 거치지 않고 바로 올릴 수 있도록 서명된 업로드 주소를 발급함
export const storage = {
  async signUpload(bucket: string, path: string): Promise<string> {
    const res = await call(`/storage/v1/object/upload/sign/${bucket}/${path}`, { method: "POST" });
    const { url: signed } = (await res.json()) as { url: string };
    return `${url}/storage/v1${signed}`;
  },
  // 비공개 파일을 잠시(기본 1시간) 열어볼 수 있는 주소
  async signDownload(bucket: string, path: string, expiresIn = 3600): Promise<string> {
    const res = await call(`/storage/v1/object/sign/${bucket}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn }),
    });
    const { signedURL } = (await res.json()) as { signedURL: string };
    return `${url}/storage/v1${signedURL}`;
  },
  async download(bucket: string, path: string): Promise<ArrayBuffer> {
    return (await call(`/storage/v1/object/${bucket}/${path}`)).arrayBuffer();
  },
};

export const inList = (values: string[]) => `in.(${values.map((v) => `"${v}"`).join(",")})`;

export type WatchItem = {
  ticker: string;
  market: "KR" | "US";
  name: string;
  corp_code: string | null;
  group_name: string | null;
  sector: string | null;
  target_price: number | null;
  fwd_pe: number | null;
  idea: string | null;
  risk: string | null;
  sell_signal: string | null;
  sort_order: number;
  avg_price?: number | null;
  quantity?: number | null;
  starred?: boolean;
  debt_ratio?: number | null; // 직접 입력 (없으면 재무제표로 계산)
  reserve_ratio?: number | null;
};

export type Security = {
  ticker: string;
  market: "KR" | "US";
  name: string;
  corp_code: string | null;
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

// 뉴스 기사에 단 내 메모
export type NewsNote = {
  id: string;
  title: string;
  url: string;
  source: string | null;
  summary: string | null;
  news_time: string | null;
  note: string;
  updated_at: string;
};

// 전체 상장사 중 투자 시그널 공시 (전자공시 탭)
export type SignalDisclosure = {
  id: string;
  date: string;
  stock_code: string | null;
  corp_name: string;
  market: string | null;
  category: string;
  title: string;
  note: string | null;
  direction: "buy" | "sell" | null;
  url: string;
};

export type Financial = {
  ticker: string;
  period_end: string;
  revenue: number | null;
  operating_income: number | null;
  total_liabilities: number | null;
  total_equity: number | null;
  capital_stock: number | null;
  currency: string | null;
};

export type MarketFlow = {
  market: "KOSPI" | "KOSDAQ";
  date: string;
  individual: number | null;
  foreigner: number | null;
  institution: number | null;
};

export type Report = {
  id: string;
  created_at: string;
  report_date: string;
  file_names: string[];
  file_paths?: string[] | null; // 원본 PDF 저장 경로 (007 SQL 이후)
  title: string | null;
  summary: string;
  model: string | null;
};
