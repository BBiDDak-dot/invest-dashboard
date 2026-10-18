-- 실적 스크리닝 종목을 누르면 보는 실적 상승 분석 리포트. Supabase SQL Editor에 붙여넣고 한 번 실행함.
create table if not exists earnings_reports (
  id         text primary key,   -- kr-DART 접수번호 / us-cik-분기 (화면 주소와 같음)
  market     text not null,      -- KR / US
  name       text not null,
  period     text,
  body       text not null,      -- 마크다운
  model      text,
  created_at timestamptz not null default now()
);
alter table earnings_reports enable row level security;
