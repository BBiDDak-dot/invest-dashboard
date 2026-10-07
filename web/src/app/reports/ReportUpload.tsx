"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createReportSummary, prepareReportUpload, readYoutube } from "@/app/actions";

const MAX_FILE_MB = 50; // 파일당 한도 (Supabase 저장소·Gemini 파일 업로드 기본 한도). 파일마다 따로 요약하므로 합계는 상관없음

export function ReportUpload({ today }: { today: string }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [links, setLinks] = useState("");
  const [date, setDate] = useState(today);
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const busy = status != null && !status.error;

  // 파일 선택·드래그앤드롭 모두 기존 목록에 더함 (PDF만, 같은 이름은 한 번)
  function addFiles(list: FileList | null) {
    const pdfs = Array.from(list ?? []).filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    if (list?.length && pdfs.length === 0) return setStatus({ text: "PDF 파일만 올릴 수 있음", error: true });
    setStatus(null);
    setFiles((prev) => [...prev, ...pdfs.filter((f) => !prev.some((p) => p.name === f.name && p.size === f.size))]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const youtube = links.split(/\s+/).filter(Boolean);
    if (files.length === 0 && youtube.length === 0) return setStatus({ text: "PDF 파일이나 유튜브 링크를 넣을 것", error: true });
    const big = files.find((f) => f.size > MAX_FILE_MB * 1024 * 1024);
    if (big) return setStatus({ text: `파일 하나당 ${MAX_FILE_MB}MB까지 가능 (${big.name}: ${(big.size / 1024 / 1024).toFixed(1)}MB)`, error: true });

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

    // 리포트(PDF)는 파일마다 한 장씩. 유튜브는 영상마다 따로 먼저 읽은 뒤(동시에) 메모를 모아 한 장으로 정리.
    // 서버 함수가 시간 제한으로 끊기면 응답 대신 예외가 나서, 잡아서 오류로 바꿈
    const call = <T,>(p: Promise<T>, what: string) =>
      p.catch(() => ({ error: `${what} 시간 초과 또는 연결 끊김 (서버 5분 제한). 잠시 뒤 다시 시도` }) as T & { error: string });
    const pdfJobs = uploads.map((u, i) => ({ label: files[i].name, run: () => call(createReportSummary([{ path: u.path, name: files[i].name }], [], date), "요약") }));
    const ytJob = async () => {
      let done = 0;
      const show = () => setStatus({ text: `유튜브 영상 읽는 중… (${done}/${youtube.length}개, 영상당 1~4분)${pdfJobs.length ? ` · 리포트 ${pdfJobs.length}장 요약 중` : ""}` });
      show();
      const read = await Promise.all(
        youtube.map((url) =>
          call(readYoutube(url), "영상 읽기").then((r) => {
            done++;
            show();
            return { url, ...r };
          }),
        ),
      );
      const ok = read.filter((r) => r.notes);
      const bad = read.filter((r) => !r.notes).map((r) => `${r.url}: ${r.error}`);
      if (ok.length === 0) return { error: bad.join(" / ") };
      setStatus({ text: `영상 ${ok.length}개 메모를 한 장으로 정리하는 중…` });
      const res = await call(createReportSummary([], [], date, ok.map((r) => ({ url: r.url, notes: r.notes! }))), "정리");
      return bad.length && res.id ? { ...res, partial: `못 읽은 영상: ${bad.join(" / ")}` } : res;
    };
    const jobs = [...pdfJobs, ...(youtube.length ? [{ label: `유튜브 ${youtube.length}건`, run: ytJob }] : [])];
    if (!youtube.length) setStatus({ text: `Gemini가 요약하는 중… (${jobs.length}장, 1~3분 걸림)` });
    const results: { id?: string; error?: string; partial?: string }[] = await Promise.all(jobs.map((j) => j.run()));
    const partial = results.map((r) => r.partial).filter(Boolean);
    if (partial.length && results.every((r) => r.id)) {
      setStatus({ text: `완료. ${partial.join(" / ")}`, error: true });
      return router.refresh();
    }
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
    <form
      onSubmit={submit}
      onDragOver={(e) => {
        e.preventDefault();
        if (!busy) setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!busy) addFiles(e.dataTransfer.files);
      }}
      className="space-y-3"
    >
      <label
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-5 text-center text-sm transition-colors ${
          dragging ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30" : "border-zinc-300 hover:border-zinc-400 dark:border-zinc-700"
        } ${busy ? "pointer-events-none opacity-50" : ""}`}
      >
        <input
          type="file"
          accept="application/pdf"
          multiple
          disabled={busy}
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
          className="sr-only"
        />
        <span className="font-medium">리포트 PDF를 여기로 끌어다 놓거나 눌러서 선택</span>
        <span className="mt-0.5 text-xs text-zinc-500">여러 개 가능, 파일마다 한 장씩 요약 (파일당 {MAX_FILE_MB}MB까지)</span>
      </label>
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2 text-xs">
          {files.map((f, i) => (
            <li key={f.name + f.size} className="flex items-center gap-1 rounded bg-zinc-100 py-1 pl-2 pr-1 dark:bg-zinc-800">
              {f.name}
              <span className="text-zinc-400">{(f.size / 1024 / 1024).toFixed(1)}MB</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                aria-label={`${f.name} 빼기`}
                className="px-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3">
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
      {status && <p className={`text-sm ${status.error ? "text-amber-600" : "text-zinc-500"}`}>{status.text}</p>}
    </form>
  );
}
