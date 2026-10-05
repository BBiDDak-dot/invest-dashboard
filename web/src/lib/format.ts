export function num(v: number | null | undefined, digits = 2) {
  if (v === null || v === undefined) return "-";
  return v.toLocaleString("ko-KR", { maximumFractionDigits: digits });
}

export function pct(v: number | null | undefined) {
  if (v === null || v === undefined) return "-";
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
}

// 한국식 색상: 상승 빨강, 하락 파랑
export function changeColor(v: number | null | undefined) {
  if (!v) return "text-zinc-500";
  return v > 0 ? "text-red-600" : "text-blue-600";
}

// 오늘 날짜(한국 시간) YYYY-MM-DD
export function kstToday() {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}
