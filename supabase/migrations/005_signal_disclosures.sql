-- 전자공시 탭: 전체 상장사 중 투자 시그널 공시. Supabase SQL Editor에 붙여넣고 한 번 실행함.
create table if not exists signal_disclosures (
  id          text primary key,   -- DART 접수번호
  date        date not null,
  stock_code  text,
  corp_name   text not null,
  market      text,               -- KOSPI / KOSDAQ
  category    text not null,      -- 실적, 수주·계약, 내부자 매매 ...
  title       text not null,
  note        text,               -- 예: "홍길동 대표이사 매수 1,000주"
  direction   text,               -- buy / sell / null
  url         text not null
);
create index if not exists signal_disclosures_date on signal_disclosures (date desc);
alter table signal_disclosures enable row level security;
