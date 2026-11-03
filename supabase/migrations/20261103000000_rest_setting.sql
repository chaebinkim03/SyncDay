-- SyncDay 휴무일 설정을 계정별로 저장
-- Supabase 대시보드 → SQL Editor에 붙여 넣고 Run. 여러 번 실행해도 안전합니다.
-- profiles 테이블은 이미 RLS로 '자기 프로필만' 읽고 쓸 수 있습니다.
alter table public.profiles add column if not exists rest_setting jsonb;
