import { redirect } from "next/navigation";
import { storage } from "@/lib/db";
import { getReport } from "@/lib/queries";

// 원본 PDF를 해당 쪽으로 열기: /reports/{id}/pdf?p=5 (사이트 로그인 뒤에만 접근됨)
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const report = await getReport((await params).id);
  const sp = new URL(req.url).searchParams;
  const path = report?.file_paths?.[Number(sp.get("f") ?? 0)];
  if (!path) return new Response("원본 PDF가 없음", { status: 404 });
  const page = Number(sp.get("p"));
  redirect((await storage.signDownload("reports", path)) + (page > 0 ? `#page=${page}` : ""));
}
