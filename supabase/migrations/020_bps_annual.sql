-- 12M Fwd PBR 밴드용 연간 BPS(실적 + 컨센서스 추정치). Supabase SQL Editor에 붙여넣고 한 번 실행함.
create table if not exists bps_annual (
  ticker     text not null references watchlist(ticker) on delete cascade,
  fy_end     date not null,             -- 결산일 (예: 2026-12-31)
  bps        numeric not null,          -- 주당순자산(원)
  estimate   boolean not null default false,  -- true=컨센서스 추정치
  source     text,                      -- naver | fnguide
  updated_at timestamptz not null default now(),
  primary key (ticker, fy_end)
);
alter table bps_annual enable row level security;
