-- 포트폴리오 탭. Supabase SQL Editor에 이 파일 내용을 붙여넣고 한 번 실행함.

-- 보유 종목: 관심종목에 매입단가·보유수량을 기록 (수량이 있으면 포트폴리오에 표시)
alter table watchlist add column if not exists avg_price numeric;   -- 매입단가 (종목 통화 기준)
alter table watchlist add column if not exists quantity  numeric;   -- 보유주식수

-- 현금 등 단일 값 설정
create table if not exists settings (
  key   text primary key,
  value numeric
);
alter table settings enable row level security;
insert into settings (key, value) values ('cash_krw', 0) on conflict do nothing;
