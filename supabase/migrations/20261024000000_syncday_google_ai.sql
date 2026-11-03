-- SyncDay DB 보강 (Supabase 대시보드 → SQL Editor에 붙여 넣고 Run)
-- 여러 번 실행해도 안전하도록 작성했습니다.

-- =========================================================
-- 1) 컬럼 보강
--    - ai_subtasks.target_date : AI가 정한 '할 날짜'
--    - user_id 기본값 auth.uid() : 브라우저에서 user_id를 안 보내도 본인 것으로 저장
-- =========================================================
alter table public.ai_subtasks           add column if not exists target_date date;
alter table public.ai_subtasks           add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.recommended_schedules add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.ai_subtasks           alter column user_id set default auth.uid();
alter table public.recommended_schedules alter column user_id set default auth.uid();
alter table public.routines              alter column user_id set default auth.uid();

-- =========================================================
-- 2) RLS: 로그인한 사람은 자기 데이터만 읽고 쓸 수 있음
--    (publishable 키는 누구나 볼 수 있으므로 이 설정이 실제 보안 역할을 합니다)
-- =========================================================
alter table public.ai_subtasks           enable row level security;
alter table public.recommended_schedules enable row level security;
alter table public.routines              enable row level security;
alter table public.profiles              enable row level security;

drop policy if exists "syncday_own_rows" on public.ai_subtasks;
create policy "syncday_own_rows" on public.ai_subtasks
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "syncday_own_rows" on public.recommended_schedules;
create policy "syncday_own_rows" on public.recommended_schedules
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "syncday_own_rows" on public.routines;
create policy "syncday_own_rows" on public.routines
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "syncday_own_profile" on public.profiles;
create policy "syncday_own_profile" on public.profiles
  for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- =========================================================
-- 3) 구글로 처음 가입하면 프로필(닉네임 = 구글 이름) 자동 생성
--    프로필 생성에 실패해도 로그인은 막히지 않도록 예외 처리
-- =========================================================
create or replace function public.syncday_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    insert into public.profiles (id, nickname)
    values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'full_name',
               new.raw_user_meta_data ->> 'name',
               split_part(new.email, '@', 1))
    )
    on conflict (id) do nothing;
  exception when others then
    raise warning 'syncday profile create failed: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists syncday_on_auth_user_created on auth.users;
create trigger syncday_on_auth_user_created
  after insert on auth.users
  for each row execute function public.syncday_handle_new_user();

-- =========================================================
-- 4) 조회 속도용 인덱스
-- =========================================================
create index if not exists ai_subtasks_user_date_idx           on public.ai_subtasks (user_id, target_date);
create index if not exists recommended_schedules_user_start_idx on public.recommended_schedules (user_id, start_time);

-- =========================================================
-- (선택) 예전에 user_id 없이 저장된 테스트 데이터가 있다면
-- RLS 때문에 화면에 안 보입니다. 내 계정 id로 바꾸려면 아래 주석을 풀고 실행하세요.
-- 내 id는 Authentication → Users에서 확인할 수 있습니다.
-- update public.ai_subtasks           set user_id = '내-user-id' where user_id is null;
-- update public.recommended_schedules set user_id = '내-user-id' where user_id is null;
-- =========================================================
