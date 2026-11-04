-- SyncDay 공지사항
-- Supabase 대시보드 → SQL Editor에 붙여 넣고 Run. 여러 번 실행해도 안전합니다.
--  - 로그인한 사용자는 공지를 읽기만 할 수 있습니다 (RLS).
--  - 공지 작성·수정·삭제는 운영자가 대시보드 Table Editor → notices 에서 합니다.
--    category 예: 안내 / 업데이트 / 이벤트,  is_pinned = true 이면 맨 위에 고정
create table if not exists public.notices (
  id         bigint generated always as identity primary key,
  category   text not null default '안내',
  title      text not null,
  content    text not null default '',
  is_pinned  boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.notices enable row level security;

drop policy if exists "syncday_notices_read" on public.notices;
create policy "syncday_notices_read" on public.notices
  for select to authenticated using (true);

-- 첫 공지 (이미 같은 제목이 있으면 넣지 않음)
insert into public.notices (category, title, content, is_pinned)
select '안내', 'Sync Day 서비스 오픈 안내',
       E'안녕하세요. Sync Day 팀입니다.\n\nAI를 활용한 개인 일정 올인원 웹 서비스 Sync Day를 오픈했습니다.\n\n- 구글 계정 하나로 가입·로그인\n- AI 챗봇: 목표와 마감일을 알려주면 날짜별 할 일로 나눠 투두에 추가\n- 미루기 코칭: 자꾸 미룬 할 일을 AI가 작은 단계로 다시 나눔\n- 캘린더 · 투두 · 루틴을 한 화면에서 관리\n\n불편한 점은 설정의 1:1 문의로 알려주세요.',
       true
where not exists (select 1 from public.notices where title = 'Sync Day 서비스 오픈 안내');
