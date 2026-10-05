import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import "./globals.css";

// 모든 화면을 요청 때마다 새로 그림 (편집·수집 결과가 바로 보이도록)
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "투자 대시보드",
  description: "개인 맞춤형 투자 분석 대시보드",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <Nav />
        <main className="mx-auto w-full max-w-7xl flex-1 space-y-4 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
