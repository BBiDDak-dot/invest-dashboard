// 사이트 비밀번호(SITE_PASSWORD) 기반의 간단한 로그인. 1인용이라 계정 없이 비밀번호 하나만 씀.
export const AUTH_COOKIE = "site_auth";

// 쿠키에는 비밀번호 자체가 아니라 해시값을 저장함 (proxy와 서버 액션에서 같이 씀)
export async function authToken(): Promise<string | null> {
  const password = process.env.SITE_PASSWORD;
  if (!password) return null;
  const data = new TextEncoder().encode(`invest-dashboard:${password}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}
