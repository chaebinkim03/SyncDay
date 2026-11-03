-- SyncDay 날짜별 완료 기록 (설계도 Database 칸의 "할 일 · 루틴 완료 기록")
-- Supabase 대시보드 → SQL Editor에 붙여 넣고 Run. 여러 번 실행해도 안전합니다.
-- 먼저 20261024000000_syncday_google_ai.sql을 실행한 뒤에 실행하세요.
--
-- 동작 방식: 화면 코드는 그대로 두고, DB가 체크 상태 변화를 보고 기록을 자동으로 남깁니다.
--  - 루틴을 체크하면 그날(last_date) 기록 추가, 체크를 풀면 그날 기록 삭제
--  - 날이 바뀌어 루틴 체크가 자동 해제될 때(last_date는 그대로)는 기록을 지우지 않음
--  - 투두를 완료하면 오늘(한국 시간) 기록 추가, 완료를 풀면 그 투두의 기록 삭제

create table if not exists public.completion_logs (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  item_type  text not null check (item_type in ('routine', 'todo')),
  item_id    bigint not null,           -- routines.routine_id 또는 ai_subtasks.task_id
  title      text,                      -- 나중에 항목이 지워져도 기록은 남도록 이름을 같이 저장
  done_date  date not null,
  created_at timestamptz not null default now(),
  unique (user_id, item_type, item_id, done_date)
);

create index if not exists completion_logs_user_date_idx on public.completion_logs (user_id, done_date);

alter table public.completion_logs enable row level security;
drop policy if exists "syncday_own_logs_read" on public.completion_logs;
create policy "syncday_own_logs_read" on public.completion_logs
  for select to authenticated using (user_id = auth.uid());
-- 기록 추가·삭제는 아래 트리거만 합니다 (화면에서 직접 쓰지 않음)

-- ---------------------------------------------------------
-- 루틴 체크 → 기록
-- ---------------------------------------------------------
create or replace function public.syncday_log_routine()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is null then
    return new;
  end if;

  -- 체크함: 체크한 날(last_date, 없으면 오늘)로 기록
  if coalesce(new.is_completed, false) and not coalesce(old.is_completed, false) then
    insert into public.completion_logs (user_id, item_type, item_id, title, done_date)
    values (new.user_id, 'routine', new.routine_id, new.routine_name,
            coalesce(new.last_date::date, (now() at time zone 'Asia/Seoul')::date))
    on conflict (user_id, item_type, item_id, done_date) do nothing;

  -- 체크를 풂: 사용자가 직접 푼 경우(last_date가 바뀜)만 그날 기록 삭제
  elsif not coalesce(new.is_completed, false) and coalesce(old.is_completed, false)
        and new.last_date is distinct from old.last_date and old.last_date is not null then
    delete from public.completion_logs
     where user_id = new.user_id and item_type = 'routine'
       and item_id = new.routine_id and done_date = old.last_date::date;
  end if;
  return new;
end;
$$;

drop trigger if exists syncday_routine_log on public.routines;
create trigger syncday_routine_log
  after update of is_completed on public.routines
  for each row execute function public.syncday_log_routine();

-- ---------------------------------------------------------
-- 투두 완료 → 기록
-- ---------------------------------------------------------
create or replace function public.syncday_log_todo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is null then
    return new;
  end if;

  if coalesce(new.is_completed, false)
     and (tg_op = 'INSERT' or not coalesce(old.is_completed, false)) then
    insert into public.completion_logs (user_id, item_type, item_id, title, done_date)
    values (new.user_id, 'todo', new.task_id, new.task_content, (now() at time zone 'Asia/Seoul')::date)
    on conflict (user_id, item_type, item_id, done_date) do nothing;

  elsif tg_op = 'UPDATE' and not coalesce(new.is_completed, false) and coalesce(old.is_completed, false) then
    delete from public.completion_logs
     where user_id = new.user_id and item_type = 'todo' and item_id = new.task_id;
  end if;
  return new;
end;
$$;

drop trigger if exists syncday_todo_log on public.ai_subtasks;
create trigger syncday_todo_log
  after insert or update of is_completed on public.ai_subtasks
  for each row execute function public.syncday_log_todo();
