-- ============================================================
--  EURIF Web · 0006_task_submissions.sql
--  과제 상세보기 + 파일 제출(용량·형식 제한 없음) + 조장 메시지
--  + 제출 시 자동 완료 + 조장 전용 상태변경/반려
--  Supabase SQL Editor 에 그대로 붙여넣고 실행하세요 (0001~0005 적용 후).
-- ============================================================

-- ── tasks: 제출 메타데이터 컬럼 추가 ──────────────────────────
alter table public.tasks
  add column if not exists submission_note text,
  add column if not exists submitted_at timestamptz,
  add column if not exists submitted_by uuid references public.profiles(id) on delete set null,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by uuid references public.profiles(id) on delete set null;

-- ── task_attachments: 과제 제출 첨부파일 (여러 개 가능) ──────
create table public.task_attachments (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.tasks(id) on delete cascade,
  storage_path text not null,
  file_name    text not null,
  file_size    bigint,
  mime_type    text,
  uploaded_by  uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now()
);
create index idx_task_attachments_task on public.task_attachments(task_id);

alter table public.task_attachments enable row level security;

create policy "task_attachments read (assignee or leader)" on public.task_attachments
  for select to authenticated
  using (
    public.is_leader()
    or exists (select 1 from public.tasks t where t.id = task_id and t.assignee_id = auth.uid())
  );

create policy "task_attachments insert (assignee)" on public.task_attachments
  for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and exists (select 1 from public.tasks t where t.id = task_id and t.assignee_id = auth.uid())
  );

create policy "task_attachments delete (leader or assignee)" on public.task_attachments
  for delete to authenticated
  using (
    public.is_leader()
    or exists (select 1 from public.tasks t where t.id = task_id and t.assignee_id = auth.uid())
  );

-- ── Storage 버킷: 형식 제한 없음(allowed_mime_types=null), 파일당 200MB
--    (실제 상한은 Supabase 플랜의 전역 업로드 한도가 더 낮으면 그쪽을 따름) ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('task-submissions', 'task-submissions', false, 209715200, null)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

create policy "task-submissions insert (assignee)" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'task-submissions'
    and exists (
      select 1 from public.tasks t
      where t.id::text = split_part(name, '/', 1) and t.assignee_id = auth.uid()
    )
  );

create policy "task-submissions read (assignee or leader)" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'task-submissions'
    and (
      public.is_leader()
      or exists (
        select 1 from public.tasks t
        where t.id::text = split_part(name, '/', 1) and t.assignee_id = auth.uid()
      )
    )
  );

create policy "task-submissions delete (leader or assignee)" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'task-submissions'
    and (
      public.is_leader()
      or exists (
        select 1 from public.tasks t
        where t.id::text = split_part(name, '/', 1) and t.assignee_id = auth.uid()
      )
    )
  );

-- ── tasks RLS 교체: 조원은 "제출(→완료)"만 가능, 그 외 필드/상태는 조장만 ──
drop policy if exists "tasks update (leader or assignee)" on public.tasks;

create policy "tasks update (leader)" on public.tasks
  for update to authenticated
  using (public.is_leader())
  with check (public.is_leader());

-- 조원은 '본인 과제 · 아직 완료 아님' 인 행만 건드릴 수 있음.
-- 실제 결과값(상태를 done으로, 제출자/시각 기록 등)은 아래 트리거가 강제하므로
-- 조원이 title/description/assignee 등을 몰래 바꾸는 것도 트리거에서 차단된다.
create policy "tasks update (assignee submit)" on public.tasks
  for update to authenticated
  using (assignee_id = auth.uid() and status <> 'done')
  with check (assignee_id = auth.uid());

create or replace function public.enforce_task_submit_only()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_leader() then
    return new;  -- 조장은 상태·내용 자유 변경 (거부 포함)
  end if;

  if new.assignee_id <> auth.uid() then
    raise exception '본인에게 배정된 과제만 제출할 수 있습니다.';
  end if;

  if new.title        is distinct from old.title
     or new.description is distinct from old.description
     or new.assignee_id  is distinct from old.assignee_id
     or new.created_by   is distinct from old.created_by
     or new.phase_id     is distinct from old.phase_id
     or new.due_date     is distinct from old.due_date
     or new.priority     is distinct from old.priority then
    raise exception '과제 내용(제목·설명·담당자·마감일·우선순위)은 조장만 수정할 수 있습니다.';
  end if;

  -- 조원이 보낼 수 있는 유일한 변화: "제출" → 상태는 서버가 강제로 done 처리
  new.status       := 'done';
  new.submitted_by := auth.uid();
  new.submitted_at := now();
  new.completed_at := now();
  new.rejected_at  := null;
  new.rejected_by  := null;

  return new;
end;
$$;

create trigger trg_tasks_submit_only
  before update on public.tasks
  for each row execute function public.enforce_task_submit_only();

-- 끝. task-board.tsx / task-detail-dialog.tsx 는 이 스키마를 전제로 동작합니다.
