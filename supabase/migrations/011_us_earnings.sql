-- 미국 실적 스크리닝: SEC XBRL의 분기 매출·영업이익(백만 달러). Supabase SQL Editor에 붙여넣고 한 번 실행함.
create table if not exists us_earnings (
  id              text primary key,   -- CIK-분기 (예: 320193-2026.2Q)
  cik             bigint not null,
  ticker          text not null,
  name            text not null,
  period          text not null,      -- 달력 분기 (예: 2026.2Q)
  end_date        date,               -- 회계 분기 마지막 날
  filed           date,               -- 처음 확인한 보고서 제출일
  form            text,               -- 10-Q / 10-K
  accn            text,
  url             text,
  derived_q4      boolean,            -- 연간 - 세 분기로 계산한 값
  revenue         numeric, revenue_prev_y numeric, revenue_yoy numeric,
  op              numeric, op_prev_y numeric, op_yoy numeric, op_turn text,
  note            text,               -- 내 메모 (수집기는 건드리지 않음)
  note_updated_at timestamptz
);
create index if not exists us_earnings_period on us_earnings (period);
alter table us_earnings enable row level security;
