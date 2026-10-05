import { dbConfigured } from "@/lib/db";

export function SetupNotice() {
  if (dbConfigured) return null;
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
      DB가 아직 연결되지 않음. 환경변수 SUPABASE_URL, SUPABASE_KEY를 설정해야 함. (README 참고)
    </div>
  );
}
