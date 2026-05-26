-- ─────────────────────────────────────────────────────────────────────────────
-- Practice Test Assignments
-- Teacher assigns a practice test to a student with an optional due date.
-- Student sees it on their /practice-test page and starts it from there.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists practice_test_assignments (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid references auth.users(id) on delete cascade not null,
  student_id  uuid references auth.users(id) on delete cascade not null,
  due_date    date,
  assigned_at timestamptz default now() not null,
  -- 'pending'   = student hasn't started yet
  -- 'started'   = student has a linked practice_tests row in progress
  -- 'completed' = linked practice_tests row is completed
  status      text default 'pending' not null,
  -- filled in when student clicks "Start Assigned Test"
  test_id     uuid references practice_tests(id) on delete set null,
  created_at  timestamptz default now() not null
);

-- RLS
alter table practice_test_assignments enable row level security;

-- Teacher can do anything with their own assignments
create policy "Teacher manages own assignments"
  on practice_test_assignments
  for all
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

-- Students can see and update their own assignments
create policy "Students see their assignments"
  on practice_test_assignments
  for select
  using (auth.uid() = student_id);

create policy "Students update their assignments"
  on practice_test_assignments
  for update
  using (auth.uid() = student_id)
  with check (auth.uid() = student_id);
