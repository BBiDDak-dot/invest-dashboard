-- 텔레그램으로 이미 보낸 알림 기록(중복 발송 방지). Supabase SQL Editor에 붙여넣고 한 번 실행함.
create table if not exists sent_alerts (
  id      text primary key,   -- 종류:원본 id (예: disc:20261023000123, kr:20261023000456, us:320193-2026.3Q)
  kind    text not null,      -- disc / kr / us
  sent_at timestamptz not null default now()
);
alter table sent_alerts enable row level security;
