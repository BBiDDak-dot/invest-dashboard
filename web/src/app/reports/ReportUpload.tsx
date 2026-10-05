"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createReportSummary, prepareReportUpload } from "@/app/actions";

const MAX_TOTAL_MB = 14; // Gemini 요청 한도(20MB)를 base64 변환 후에도 넘지 않도록

export function ReportUpload({ today }: { today: string }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [links, setLinks] = useState("");
  const [date, setDate] = useState(today);
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const busy = status != null && !status.error;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const youtube = links.split(/\s+/).filter(Boolean);
    if (files.length === 0 && youtube.length === 0) return setStatus({ text: "PDF 파일이나 유튜브 링크를 넣을 것", error: true });
    const totalMb = files.reduce((s, f) => s + f.size, 0) / 1024 / 1024;
    if (totalMb > MAX_TOTAL_MB) return setStatus({ text: `한 번에 ${MAX_TOTAL_MB}MB까지 가능 (현재 ${totalMb.toFixed(1)}MB)`, error: true });

    let uploads: { path: string; url: string }[] = [];
    if (files.length > 0) {
      setStatus({ text: "업로드 중…" });
      const prep = await prepareReportUpload(files.map((f) => f.name));
      if (!prep.uploads) return setStatus({ text: prep.error ?? "업로드 준비 실패", error: true });
      uploads = prep.uploads;
      try {
        await Promise.all(
          uploads.map(async (u, i) => {
            const res = await fetch(u.url, { method: "PUT", headers: { "Content-Type": "application/pdf" }, body: files[i] });
            if (!res.ok) throw new Error(`${files[i].name} 업로드 실패 (${res.status})`);
          }),
        );
      } catch (err) {
        return setStatus({ text: (err as Error).message, error: true });
      }
    }

    setStatus({ text: `Gemini가 ${files.length + youtube.length}건을 읽고 요약하는 중… (1~3분 걸림)` });
    const result = await createReportSummary(
      uploads.map((u, i) => ({ path: u.path, name: files[i].name })),
      youtube,
      date,
    );
    if (!result.id) return setStatus({ text: result.error ?? "요약 실패", error: true });
    router.push(`/reports/${result.id}`);
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept="application/pdf"
          multiple
          disabled={busy}
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm dark:file:bg-zinc-800"
        />
        <label className="flex items-center gap-2 text-sm text-zinc-500">
          리포트 날짜
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700"
          />
        </label>
        <button disabled={busy} className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
          요약하기
        </button>
      </div>
      <textarea
        value={links}
        onChange={(e) => setLinks(e.target.value)}
        disabled={busy}
        rows={2}
        placeholder="유튜브 영상 링크 (여러 개면 줄바꿈으로 구분)"
        className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
      />
      {files.length > 0 && <p className="text-xs text-zinc-500">{files.map((f) => f.name).join(", ")}</p>}
      {status && <p className={`text-sm ${status.error ? "text-amber-600" : "text-zinc-500"}`}>{status.text}</p>}
    </form>
  );
}
