-- 수급 탭: 종목별 외국인·기관 순매수(억원 추정). Supabase SQL Editor에 붙여넣고 한 번 실행함.
create table if not exists stock_flows (
  code         text not null,
  date         date not null,
  name         text not null,
  market       text not null,   -- KOSPI / KOSDAQ
  close        numeric,
  foreigner    numeric,         -- 외국인 순매수 금액 (억원, 수량 × 종가)
  institution  numeric,         -- 기관 순매수 금액 (억원)
  primary key (code, date)
);
create index if not exists stock_flows_date on stock_flows (date desc);
alter table stock_flows enable row level security;
