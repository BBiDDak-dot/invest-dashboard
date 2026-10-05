-- 뉴스 메모: 기사마다 내 코멘트를 남김. Supabase SQL Editor에 붙여넣고 한 번 실행함.
-- 뉴스 자체는 저장하지 않으므로, 메모한 기사는 제목·주소를 함께 보관해 목록에서 사라져도 다시 볼 수 있게 함.
create table if not exists news_notes (
  id          text primary key,   -- 네이버 기사 id (언론사id-기사id)
  title       text not null,
  url         text not null,
  source      text,
  summary     text,
  news_time   text,               -- 기사 시각 YYYYMMDDHHmm
  note        text not null,
  updated_at  timestamptz not null default now()
);
alter table news_notes enable row level security;
