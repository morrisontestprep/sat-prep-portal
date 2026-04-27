-- ── question_explanations ────────────────────────────────────────────────────
-- Stores per-student step-by-step explanations for individual questions.
-- assignment_id / student_id are NULL until sent to a student.
-- The "reuse bank" is all rows with the same question_id created by the teacher.

CREATE TABLE IF NOT EXISTS question_explanations (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id    text        NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  assignment_id  uuid        REFERENCES student_assignments(id) ON DELETE SET NULL,
  student_id     uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_by     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  steps          jsonb       NOT NULL DEFAULT '[]',
  sent_at        timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE question_explanations ENABLE ROW LEVEL SECURITY;

-- Teacher can do everything with their own explanations
CREATE POLICY "teacher_full_access_explanations"
  ON question_explanations
  FOR ALL
  USING (auth.jwt() ->> 'email' = 'morrisontestprep@gmail.com')
  WITH CHECK (auth.jwt() ->> 'email' = 'morrisontestprep@gmail.com');

-- Students can read explanations sent to them
CREATE POLICY "student_read_own_explanations"
  ON question_explanations
  FOR SELECT
  USING (student_id = auth.uid() AND sent_at IS NOT NULL);

-- ── notifications ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type        text        NOT NULL,
  data        jsonb       NOT NULL DEFAULT '{}',
  read        boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Students can read and update (mark read) their own notifications
CREATE POLICY "student_read_own_notifications"
  ON notifications
  FOR SELECT
  USING (student_id = auth.uid());

CREATE POLICY "student_update_own_notifications"
  ON notifications
  FOR UPDATE
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

-- Service role (API routes) can insert notifications
-- (No INSERT policy needed — service role bypasses RLS)

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_question_explanations_question_id ON question_explanations(question_id);
CREATE INDEX IF NOT EXISTS idx_question_explanations_student_id  ON question_explanations(student_id);
CREATE INDEX IF NOT EXISTS idx_notifications_student_id          ON notifications(student_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read                ON notifications(student_id, read) WHERE read = false;
