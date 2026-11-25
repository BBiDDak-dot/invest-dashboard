"use client";

import { useState } from "react";
import { LineChart, type ChartSeries } from "@/components/LineChart";

const DAY = 86400_000;
const dot = (d: Date) => d.toISOString().slice(0, 10).replaceAll("-", ".");
const ymd = (d: Date) => d.toISOString().slice(0, 10).replaceAll("-", "");
const mdy = (d: Date) => `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;

// 주간 점(그 주 마지막 거래일)의 한 주 구간에 나온 '종목명 주가' 기사 검색 주소
export function newsLinks(name: string, date: string) {
  const end = new Date(Date.parse(date) + DAY);
  const start = new Date(Date.parse(date) - 6 * DAY);
  const q = encodeURIComponent(`${name} 주가`);
  return {
    range: `${dot(start)} ~ ${dot(end)}`,
    naver: `https://search.naver.com/search.naver?where=news&query=${q}&sort=0&pd=3&ds=${dot(start)}&de=${dot(end)}&nso=so%3Ar%2Cp%3Afrom${ymd(start)}to${ymd(end)}`,
    google: `https://www.google.com/search?q=${q}&tbm=nws&tbs=cdr%3A1%2Ccd_min%3A${encodeURIComponent(mdy(start))}%2Ccd_max%3A${encodeURIComponent(mdy(end))}`,
  };
}

// PBR 밴드 차트 + 가리킨 시점의 기사 검색 링크. PC는 클릭하면 바로 네이버 검색, 휴대폰은 탭으로 시점을 고른 뒤 아래 링크를 누름.
export function PbrBandPlot({ labels, series, name }: { labels: string[]; series: ChartSeries[]; name: string }) {
  const [sel, setSel] = useState(labels.length - 1);
  const date = labels[sel];
  const links = date ? newsLinks(name, date) : null;
  return (
    <div>
      <LineChart
        labels={labels}
        series={series}
        height={280}
        decimals={0}
        onHoverIndex={setSel}
        onPick={(i, type) => {
          if (type === "mouse" && labels[i]) window.open(newsLinks(name, labels[i]).naver, "_blank", "noopener");
        }}
      />
      {links && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-zinc-50 px-2.5 py-1.5 text-xs dark:bg-zinc-900">
          <span className="text-zinc-500">
            {links.range} {name} 주가 기사
          </span>
          <a href={links.naver} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            네이버 뉴스 ↗
          </a>
          <a href={links.google} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">
            구글 뉴스 ↗
          </a>
          <span className="hidden text-zinc-400 sm:inline">· 차트를 클릭하면 그 주 네이버 기사 검색이 열림</span>
          <span className="text-zinc-400 sm:hidden">· 차트를 탭해 시점 선택</span>
        </div>
      )}
    </div>
  );
}
