-- SyncDay 1:1 문의
-- Supabase 대시보드 → SQL Editor에 붙여 넣고 Run. 여러 번 실행해도 안전합니다.
--  - 사용자는 자기 문의만 쓰고 볼 수 있습니다 (RLS).
--  - 답변은 운영자가 대시보드 Table Editor → inquiries 에서 answer 칸에 적고 answered_at에 날짜를 넣습니다.
create table if not exists public.inquiries (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  email       text,
  content     text not null check (char_length(content) between 1 and 2000),
  answer      text,
  answered_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists inquiries_user_idx on public.inquiries (user_id, created_at desc);

alter table public.inquiries enable row level security;

drop policy if exists "syncday_own_inquiries_read" on public.inquiries;
create policy "syncday_own_inquiries_read" on public.inquiries
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "syncday_own_inquiries_insert" on public.inquiries;
create policy "syncday_own_inquiries_insert" on public.inquiries
  for insert to authenticated
  with check (user_id = auth.uid() and answer is null and answered_at is null);
