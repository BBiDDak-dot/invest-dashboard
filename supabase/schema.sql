-- Supabase SQL Editor에서 한 번 실행함.

create table if not exists watchlist (
  ticker     text primary key,          -- KR: 005930, US: AAPL
  market     text not null check (market in ('KR', 'US')),
  name       text not null,
  corp_code  text,                      -- DART 고유번호(국내 공시 수집용, 8자리)
  added_at   timestamptz not null default now()
);

create table if not exists prices (
  ticker      text not null references watchlist(ticker) on delete cascade,
  date        date not null,
  close       numeric not null,
  change_pct  numeric,
  volume      bigint,
  primary key (ticker, date)
);

-- 종목별 최신 시세
create or replace view latest_prices with (security_invoker = true) as
select distinct on (ticker) ticker, date, close, change_pct, volume
from prices
order by ticker, date desc;

-- 재무(1단계 후반에 수집기 추가 예정)
create table if not exists fundamentals (
  ticker            text not null references watchlist(ticker) on delete cascade,
  period            text not null,      -- 예: 2025Q4, 2025
  revenue           numeric,
  operating_income  numeric,
  net_income        numeric,
  per               numeric,
  pbr               numeric,
  roe               numeric,
  primary key (ticker, period)
);

create table if not exists macro_series (
  series_id  text primary key,          -- 예: FRED:DGS10
  source     text not null,
  name       text not null,
  unit       text,
  country    text not null
);

create table if not exists macro_observations (
  series_id  text not null references macro_series(series_id) on delete cascade,
  date       date not null,
  value      numeric not null,
  primary key (series_id, date)
);

create table if not exists disclosures (
  id      text primary key,             -- DART 접수번호
  ticker  text not null references watchlist(ticker) on delete cascade,
  date    date not null,
  title   text not null,
  url     text not null
);

-- 외부 공개 차단: RLS를 켜고 정책을 두지 않으면 anon 키로는 읽기·쓰기 모두 막힘.
-- 웹과 수집기는 서버에서 service_role 키로 접근함.
alter table watchlist          enable row level security;
alter table prices             enable row level security;
alter table fundamentals       enable row level security;
alter table macro_series       enable row level security;
alter table macro_observations enable row level security;
alter table disclosures        enable row level security;

-- 예시 종목 (원하는 대로 수정)
insert into watchlist (ticker, market, name, corp_code) values
  ('005930', 'KR', '삼성전자', '00126380'),
  ('AAPL',   'US', 'Apple',    null)
on conflict do nothing;
