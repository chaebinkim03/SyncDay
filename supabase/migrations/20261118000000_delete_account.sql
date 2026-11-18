-- 회원 탈퇴 (Supabase 대시보드 → SQL Editor에 붙여 넣고 Run)
-- 로그인한 본인 계정과 모든 데이터를 지웁니다. 여러 번 실행해도 안전합니다.
-- 브라우저에서 supabaseClient.rpc('syncday_delete_my_account')로 호출합니다.

create or replace function public.syncday_delete_my_account()
returns void
language plpgsql
security definer          -- auth.users를 지우려면 관리자 권한이 필요해서, 함수 안에서만 권한을 빌려 씀
set search_path = ''
as $$
declare
  uid uuid := auth.uid(); -- 요청한 사람 본인만 (다른 사람 계정은 지울 수 없음)
begin
  if uid is null then
    raise exception '로그인이 필요해요.';
  end if;

  delete from public.completion_logs       where user_id = uid;
  delete from public.ai_subtasks           where user_id = uid;
  delete from public.recommended_schedules where user_id = uid;
  delete from public.goals                 where user_id = uid;
  delete from public.routines              where user_id = uid;
  delete from public.inquiries             where user_id = uid;
  delete from public.profiles              where id = uid;
  delete from auth.users                   where id = uid;  -- 로그인 계정 자체 삭제
end;
$$;

-- 로그인한 사용자만 호출 가능
revoke all on function public.syncday_delete_my_account() from public, anon;
grant execute on function public.syncday_delete_my_account() to authenticated;
