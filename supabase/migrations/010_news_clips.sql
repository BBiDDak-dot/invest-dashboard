-- 산업 클리핑: 국내·해외 산업 매체 기사 중 산업 변화(수요·상용화·사업모델·생산성·경쟁·공급망·제도)를 보여 주는 기사.
-- 수집기가 거른 기사도 함께 남겨 다시 판단하지 않음(selected=false). Supabase SQL Editor에 붙여넣고 한 번 실행함.
create table if not exists news_clips (
  id            text primary key,     -- 기사 주소의 해시
  url           text not null,
  title         text not null,
  title_ko      text,                 -- 해외 기사는 한국어 번역 제목
  summary       text,                 -- RSS 요약
  source        text,
  region        text,                 -- 국내 / 해외
  published_at  timestamptz,
  collected_at  timestamptz not null default now(),
  category      text,                 -- 수요 / 상용화 / 사업모델 / 생산성 / 경쟁·공급망 / 제도 / 없음
  industry      text,
  score         smallint,             -- 0~3
  what          text,                 -- 무엇이 바뀌었나 (한 줄)
  companies     text[],
  selected      boolean not null default false,
  model         text                  -- 분류한 Gemini 모델, rule(키워드 규칙), filter(주가·홍보 제목 거름)
);
create index if not exists news_clips_selected on news_clips (published_at desc) where selected;
create index if not exists news_clips_collected on news_clips (collected_at);
alter table news_clips enable row level security;
