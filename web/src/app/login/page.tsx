import { LoginForm } from "./LoginForm";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const next = (await searchParams).next;
  return (
    <div className="mx-auto mt-16 max-w-xs space-y-4">
      <h1 className="text-lg font-semibold">로그인</h1>
      <LoginForm next={typeof next === "string" ? next : "/"} />
    </div>
  );
}
