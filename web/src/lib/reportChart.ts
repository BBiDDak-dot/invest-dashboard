// 리포트 요약 속 ```chart 블록 (Gemini가 원문 숫자를 옮겨 적은 것)
export type ChartSpec = {
  title?: string;
  unit?: string;
  type?: "bar" | "line";
  labels: string[];
  series: { name: string; values: (number | null)[] }[];
  source?: string;
};

export function parseChart(raw: string): ChartSpec | null {
  try {
    const c = JSON.parse(raw) as ChartSpec;
    const n = c.labels?.length ?? 0;
    if (n < 2 || !Array.isArray(c.series) || c.series.length === 0) return null;
    // 계열은 최대 2개 (색 구분이 확실한 범위), 길이가 안 맞으면 버림
    c.series = c.series.slice(0, 2).filter((s) => Array.isArray(s.values) && s.values.length === n);
    if (c.series.length === 0) return null;
    c.series.forEach((s) => (s.values = s.values.map((v) => (typeof v === "number" && isFinite(v) ? v : null))));
    return c;
  } catch {
    return null;
  }
}
