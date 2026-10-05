-- 리포트 요약에서 원본 PDF의 해당 쪽으로 바로 가기 위해 저장 경로를 남김. Supabase SQL Editor에서 한 번 실행함.
alter table reports add column if not exists file_paths text[];
