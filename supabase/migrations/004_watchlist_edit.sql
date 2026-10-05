-- 관심종목 표 직접 편집·톱픽. Supabase SQL Editor에 붙여넣고 한 번 실행함.

-- 톱픽(별표) 표시
alter table watchlist add column if not exists starred boolean not null default false;

-- 부채비율·유보율 직접 입력값 (비어 있으면 재무제표로 자동 계산한 값을 씀)
alter table watchlist add column if not exists debt_ratio    numeric;
alter table watchlist add column if not exists reserve_ratio numeric;
