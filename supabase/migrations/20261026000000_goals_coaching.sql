-- SyncDay 목표 단위 관리 + 미루기 코칭
-- Supabase 대시보드 → SQL Editor에 붙여 넣고 Run. 여러 번 실행해도 안전합니다.
-- 20261024..., 20261025... SQL을 먼저 실행한 뒤에 실행하세요.

-- =========================================================
-- 1) 목표 테이블: AI 계획 하나 = 목표 하나
-- =========================================================
create table if not exists public.goals (
  goal_id         bigint generated always as identity primary key,
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title           text not null,
  deadline        date,
  minutes_per_day int,
  created_at      timestamptz not null default now()
);
alter table public.goals enable row level security;
drop policy if exists "syncday_own_rows" on public.goals;
create policy "syncday_own_rows" on public.goals
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 목표를 지우면 그 목표의 투두·일정도 함께 삭제
alter table public.ai_subtasks           add column if not exists goal_id bigint references public.goals(goal_id) on delete cascade;
alter table public.recommended_schedules add column if not exists goal_id bigint references public.goals(goal_id) on delete cascade;

-- =========================================================
-- 2) 투두 ↔ 캘린더 일정 연결 + 미룬 횟수
-- =========================================================
alter table public.recommended_schedules add column if not exists task_id bigint;   -- 이 일정과 짝인 투두
alter table public.ai_subtasks           add column if not exists postpone_count int not null default 0;

create index if not exists ai_subtasks_goal_idx           on public.ai_subtasks (goal_id);
create index if not exists recommended_schedules_task_idx on public.recommended_schedules (task_id);

-- 완료 전 투두의 날짜를 뒤로 옮기면 '미룬 횟수' +1
create or replace function public.syncday_count_postpone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not coalesce(new.is_completed, false)
     and old.target_date is not null and new.target_date is not null
     and new.target_date > old.target_date then
    new.postpone_count := coalesce(old.postpone_count, 0) + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists syncday_todo_postpone on public.ai_subtasks;
create trigger syncday_todo_postpone
  before update of target_date on public.ai_subtasks
  for each row execute function public.syncday_count_postpone();

-- 투두 날짜를 옮기면 짝인 캘린더 일정도 같은 만큼 이동 (시간은 그대로)
create or replace function public.syncday_move_schedule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.target_date is not null and new.target_date is not null
     and new.target_date <> old.target_date then
    begin
      update public.recommended_schedules
         set start_time = start_time + (new.target_date - old.target_date) * interval '1 day',
             end_time   = end_time   + (new.target_date - old.target_date) * interval '1 day'
       where task_id = new.task_id and user_id = new.user_id;
    exception when others then
      raise warning 'syncday schedule move failed: %', sqlerrm;  -- 일정 이동이 실패해도 투두 수정은 막지 않음
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists syncday_todo_move_schedule on public.ai_subtasks;
create trigger syncday_todo_move_schedule
  after update of target_date on public.ai_subtasks
  for each row execute function public.syncday_move_schedule();

-- 투두를 지우면 짝인 캘린더 일정도 삭제
create or replace function public.syncday_delete_schedule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.recommended_schedules where task_id = old.task_id and user_id = old.user_id;
  return old;
end;
$$;

drop trigger if exists syncday_todo_delete_schedule on public.ai_subtasks;
create trigger syncday_todo_delete_schedule
  after delete on public.ai_subtasks
  for each row execute function public.syncday_delete_schedule();
