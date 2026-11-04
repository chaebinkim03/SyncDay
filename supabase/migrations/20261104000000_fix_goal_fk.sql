-- SyncDay: 할 일·일정의 goal_id가 goals 테이블을 가리키도록 바로잡기
-- (예전 스키마에 goal_id 칸이 이미 있어서 다른 테이블(long_term_goals 등)을 가리키던 문제 수정)
-- Supabase 대시보드 → SQL Editor에 붙여 넣고 Run. 여러 번 실행해도 안전합니다.
do $$
declare
  t text;
  c record;
begin
  foreach t in array array['ai_subtasks', 'recommended_schedules'] loop
    -- goal_id 칸이 없으면 만들기
    execute format('alter table public.%I add column if not exists goal_id bigint', t);

    -- goal_id에 걸린 기존 외래키를 모두 제거 (어느 테이블을 가리키든)
    for c in
      select con.conname
        from pg_constraint con
        join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any(con.conkey)
       where con.conrelid = format('public.%I', t)::regclass
         and con.contype = 'f'
         and att.attname = 'goal_id'
    loop
      execute format('alter table public.%I drop constraint %I', t, c.conname);
    end loop;

    -- 숫자형이 아니면 bigint로 (기존 값은 goals와 맞지 않으므로 비움)
    if (select data_type from information_schema.columns
         where table_schema = 'public' and table_name = t and column_name = 'goal_id')
       not in ('bigint', 'integer', 'smallint') then
      execute format('alter table public.%I alter column goal_id type bigint using null', t);
    end if;

    -- goals에 없는 번호는 연결 해제 (할 일 자체는 그대로 남음)
    execute format(
      'update public.%I set goal_id = null where goal_id is not null and goal_id not in (select goal_id from public.goals)', t);

    -- goals를 가리키는 외래키 다시 연결 (목표를 지우면 그 할 일·일정도 함께 삭제)
    execute format(
      'alter table public.%I add constraint %I foreign key (goal_id) references public.goals(goal_id) on delete cascade',
      t, t || '_goal_id_fkey');
  end loop;
end $$;
