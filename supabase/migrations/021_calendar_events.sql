-- 주요 일정 달력(FOMC·실적발표·경제지표·행사). Supabase SQL Editor에 붙여넣고 한 번 실행함.
create table if not exists calendar_events (
  id         text primary key,             -- 자동: {grp}-{날짜}, 직접 입력: m-{난수}
  date       date not null,                -- 한국 날짜(KST)
  time_kst   text,                         -- 한국 시각 'HH:MM' (모르면 비움)
  category   text not null,                -- FOMC | 경제지표 | 실적 | 행사 | 기타
  title      text not null,
  note       text,                         -- 현지 시각, 장 전/후, 점도표 등
  url        text,
  tentative  boolean not null default false,  -- true=예상 날짜(미확정)
  grp        text,                         -- 자동 수집 묶음(fomc, cpi, earn-NVDA ...). 직접 입력은 null
  source     text not null default 'auto', -- auto | manual
  updated_at timestamptz not null default now()
);
create index if not exists calendar_events_date on calendar_events (date);
alter table calendar_events enable row level security;
