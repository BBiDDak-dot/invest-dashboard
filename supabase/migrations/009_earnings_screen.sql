-- 실적 스크리닝 탭: 잠정실적 공시의 매출액·영업이익(억원). Supabase SQL Editor에 붙여넣고 한 번 실행함.
create table if not exists earnings_screen (
  id              text primary key,   -- DART 접수번호
  date            date not null,
  stock_code      text,
  corp_name       text not null,
  market          text,
  title           text not null,
  period          text,               -- 예: 2026.3Q
  consolidated    boolean,
  corrected       boolean,
  url             text not null,
  revenue         numeric, revenue_prev_q numeric, revenue_qoq numeric, revenue_prev_y numeric, revenue_yoy numeric, revenue_turn text,
  op              numeric, op_prev_q numeric, op_qoq numeric, op_prev_y numeric, op_yoy numeric, op_turn text,
  note            text,               -- 내 메모 (수집기는 건드리지 않음)
  note_updated_at timestamptz
);
create index if not exists earnings_screen_date on earnings_screen (date desc);
alter table earnings_screen enable row level security;
