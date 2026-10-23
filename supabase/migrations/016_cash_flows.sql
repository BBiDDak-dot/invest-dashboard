-- 현금 입금·출금 기록 (포트폴리오 매매 일지). Supabase SQL Editor에 붙여넣고 한 번 실행함.
-- 기록하면 현금(settings.cash_krw)이 자동으로 바뀌고, 순입금(입금−출금)으로 실제 투자 손익을 계산함.
create table if not exists cash_flows (
  id         bigint generated always as identity primary key,
  flow_date  date not null,
  kind       text not null check (kind in ('deposit', 'withdraw')),
  amount     numeric not null check (amount > 0),   -- 원
  memo       text,
  cash_applied boolean not null default true,      -- 현금 잔고에 반영했는지 (지난 입금을 기록만 할 때는 false)
  created_at timestamptz not null default now()
);
create index if not exists cash_flows_date_idx on cash_flows (flow_date);
alter table cash_flows enable row level security;
