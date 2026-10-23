-- 퇴직연금(IRP·DC·연금저축 등) 계좌 별도 관리. Supabase SQL Editor에 붙여넣고 한 번 실행함.
-- 일반 포트폴리오(관심종목 보유분)와 섞이지 않게 따로 저장함.
create table if not exists pension_holdings (
  id         bigint generated always as identity primary key,
  account    text not null default 'IRP',   -- 계좌 이름 (IRP, DC, 연금저축 등)
  kind       text not null check (kind in ('etf', 'fund', 'deposit', 'cash')),  -- 상장 ETF / 펀드·TDF / 예금·원리금보장 / 현금
  ticker     text,                           -- 상장 ETF 6자리 코드 (현재가 자동 조회)
  name       text not null,
  quantity   numeric,                        -- ETF 수량
  avg_price  numeric,                        -- ETF 매입단가
  principal  numeric,                        -- 펀드·예금·현금: 넣은 원금
  amount     numeric,                        -- 펀드·예금·현금: 현재 평가금액 (직접 입력)
  safe       boolean not null default false, -- 안전자산 여부 (위험자산 70% 한도 계산용)
  memo       text,
  created_at timestamptz not null default now()
);
alter table pension_holdings enable row level security;
