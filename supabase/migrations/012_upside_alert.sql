-- 상승여력 텔레그램 알림: 마지막으로 알림 보낸 시각 (기준 아래로 충분히 내려가면 비워서 다시 알림). Supabase SQL Editor에서 한 번 실행함.
alter table watchlist add column if not exists upside_alert_at timestamptz;
