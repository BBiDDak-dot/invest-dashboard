-- 기능 추가(종목 관리·재무·수급·리포트). Supabase SQL Editor에 이 파일 내용을 붙여넣고 한 번 실행함.

-- 1. 종목 검색용 전체 상장종목 목록 (국내: DART, 미국: SEC)
create table if not exists securities (
  ticker     text primary key,
  market     text not null check (market in ('KR', 'US')),
  name       text not null,
  corp_code  text,                      -- 국내: DART 고유번호, 미국: SEC CIK
  updated_at timestamptz not null default now()
);
create index if not exists securities_name_idx on securities (name);

-- 2. 관심종목 스프레드시트 항목
alter table watchlist add column if not exists group_name    text;     -- 구분
alter table watchlist add column if not exists sector        text;
alter table watchlist add column if not exists target_price  numeric;  -- 1년 목표주가
alter table watchlist add column if not exists fwd_pe        numeric;  -- 12M Fwd P/E (직접 입력)
alter table watchlist add column if not exists idea          text;     -- 투자아이디어
alter table watchlist add column if not exists risk          text;
alter table watchlist add column if not exists sell_signal   text;
alter table watchlist add column if not exists sort_order    integer not null default 0;

-- 3. 분기 재무 (단일 분기 값, 4분기 누적은 화면에서 합산)
create table if not exists financials_quarterly (
  ticker             text not null references watchlist(ticker) on delete cascade,
  period_end         date not null,
  revenue            numeric,
  operating_income   numeric,
  total_liabilities  numeric,
  total_equity       numeric,
  capital_stock      numeric,           -- 자본금 (유보율 계산용)
  currency           text,
  primary key (ticker, period_end)
);

-- 4. 시장별 투자자 순매수 (억원)
create table if not exists market_flows (
  market      text not null check (market in ('KOSPI', 'KOSDAQ')),
  date        date not null,
  individual  numeric,
  foreigner   numeric,
  institution numeric,
  primary key (market, date)
);

-- 5. 리포트 요약
create table if not exists reports (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  report_date date not null default current_date,
  file_names  text[] not null,
  title       text,
  summary     text not null,
  model       text
);

alter table securities           enable row level security;
alter table financials_quarterly enable row level security;
alter table market_flows         enable row level security;
alter table reports              enable row level security;

-- 리포트 PDF 저장소 (비공개)
insert into storage.buckets (id, name, public)
values ('reports', 'reports', false)
on conflict (id) do nothing;
