-- 일반 계좌 순자산 일별 기록(연도별 수익률 계산용). Supabase SQL Editor에 붙여넣고 한 번 실행함.
-- 수집기(collect)가 돌 때마다 그날(KST) 값을 덮어씀. 연말 마지막 값이 다음 해 수익률의 기준이 됨.
create table if not exists portfolio_snapshots (
  snap_date  date primary key,
  net_worth  numeric not null,   -- 주식 평가금액 + 현금 (원)
  stock_krw  numeric not null,
  cash_krw   numeric not null,
  updated_at timestamptz not null default now()
);
alter table portfolio_snapshots enable row level security;
