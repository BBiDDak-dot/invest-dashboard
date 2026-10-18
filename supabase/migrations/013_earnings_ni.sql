-- 실적 스크리닝(국내)에 당기순이익(억원) 칸 추가. Supabase SQL Editor에 붙여넣고 한 번 실행함.
alter table earnings_screen
  add column if not exists ni         numeric,
  add column if not exists ni_prev_q  numeric,
  add column if not exists ni_qoq     numeric,
  add column if not exists ni_prev_y  numeric,
  add column if not exists ni_yoy     numeric,
  add column if not exists ni_turn    text;
