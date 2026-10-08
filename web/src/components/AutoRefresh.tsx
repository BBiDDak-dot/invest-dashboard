"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// 화면을 띄워 둔 동안 현재가를 주기적으로 다시 받아옴. 입력 중이거나 다른 탭을 보고 있을 땐 건너뜀
export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.hidden) return;
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) return;
      router.refresh();
    };
    const id = setInterval(tick, seconds * 1000);
    const onVisible = () => !document.hidden && tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, seconds]);
  return null;
}
