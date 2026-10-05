import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, authToken } from "@/lib/auth";

// SITE_PASSWORD가 설정돼 있으면 로그인한 사람만 사이트를 볼 수 있음
export async function proxy(request: NextRequest) {
  const token = await authToken();
  if (!token || request.nextUrl.pathname === "/login") return NextResponse.next();
  if (request.cookies.get(AUTH_COOKIE)?.value === token) return NextResponse.next();
  const login = new URL("/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
