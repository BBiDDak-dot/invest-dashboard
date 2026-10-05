import Link from "next/link";
import { logout } from "@/app/actions";

const links = [
  { href: "/", label: "요약" },
  { href: "/portfolio", label: "포트폴리오" },
  { href: "/watchlist", label: "관심종목" },
  { href: "/macro", label: "투자 지표" },
  { href: "/flows", label: "수급" },
  { href: "/reports", label: "리포트" },
];

export function Nav() {
  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <nav className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="font-semibold">
          투자 대시보드
        </Link>
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="text-sm text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50">
            {l.label}
          </Link>
        ))}
        {process.env.SITE_PASSWORD && (
          <form action={logout} className="ml-auto">
            <button className="text-xs text-zinc-400 hover:text-zinc-600">로그아웃</button>
          </form>
        )}
      </nav>
    </header>
  );
}
