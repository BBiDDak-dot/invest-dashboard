-- 매매 일지. Supabase SQL Editor에 붙여넣고 한 번 실행함.
-- 매매를 기록하면 관심종목의 매입단가·보유수량과 현금(settings.cash_krw)이 자동으로 바뀜.
-- 종목을 관심종목에서 지워도 일지는 남도록 watchlist를 참조하지 않음.
create table if not exists trades (
  id           bigint generated always as identity primary key,
  ticker       text not null,
  market       text not null check (market in ('KR', 'US')),
  name         text not null,
  trade_date   date not null,
  side         text not null check (side in ('open', 'buy', 'sell')),  -- open: 일지 시작 전 보유분(기초 잔고)
  price        numeric not null check (price >= 0),                    -- 종목 통화 기준
  quantity     numeric not null check (quantity > 0),
  fee          numeric not null default 0,                             -- 수수료·세금 (종목 통화)
  fx           numeric,                                                -- 해외: 체결 당시 원/달러
  cash_applied boolean not null default false,                         -- 현금에 반영했는지 (삭제 시 되돌림)
  reason       text,                                                   -- 매매 이유
  created_at   timestamptz not null default now()
);
create index if not exists trades_ticker_idx on trades (ticker, trade_date);
alter table trades enable row level security;
