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

    // 리포트(PDF)는 파일마다 한 장씩, 유튜브 링크는 모두 합쳐 한 장으로 요약 (동시에 요청)
    const jobs = [
      ...uploads.map((u, i) => ({ label: files[i].name, files: [{ path: u.path, name: files[i].name }], youtube: [] as string[] })),
      ...(youtube.length ? [{ label: `유튜브 ${youtube.length}건`, files: [], youtube }] : []),
    ];
    setStatus({ text: `Gemini가 요약하는 중… (${jobs.length}장, 1~3분 걸림)` });
    const results = await Promise.all(jobs.map((j) => createReportSummary(j.files, j.youtube, date)));
    const ok = results.filter((r) => r.id);
    const failed = results.map((r, i) => (r.id ? null : `${jobs[i].label}: ${r.error ?? "요약 실패"}`)).filter(Boolean);
    if (ok.length === 0) return setStatus({ text: failed.join(" / "), error: true });
    if (failed.length) {
      // 일부만 실패하면 실패 내역을 남기고 목록을 새로 고침
      setStatus({ text: `${ok.length}장 완료, 실패: ${failed.join(" / ")}`, error: true });
      return router.refresh();
    }
    router.push(ok.length === 1 ? `/reports/${ok[0].id}` : "/reports");
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
