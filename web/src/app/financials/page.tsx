import { redirect } from "next/navigation";

// 재무 탭은 없앰. 재무는 관심종목 → 종목 상세 화면에서 봄 (예전 주소 즐겨찾기 대비)
export default function FinancialsPage() {
  redirect("/watchlist");
}
