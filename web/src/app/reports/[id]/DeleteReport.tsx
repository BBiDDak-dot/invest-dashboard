"use client";

import { useTransition } from "react";
import { deleteReport } from "@/app/actions";

export function DeleteReport({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => {
        if (!confirm("이 요약을 삭제할까?")) return;
        start(async () => {
          const r = await deleteReport(id);
          if (r?.error) alert(r.error);
        });
      }}
      className="hover:text-red-600 disabled:opacity-50"
    >
      삭제
    </button>
  );
}
