-- ─────────────────────────────────────────────────────────────────
-- Practice Sessions: analytics-generated practice problems
-- Run this in the Supabase SQL editor
-- ─────────────────────────────────────────────────────────────────

-- Tracks a generated practice set (one per "Generate Problems" click)
CREATE TABLE IF NOT EXISTS practice_sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  completed_at        TIMESTAMPTZ,

  -- Filters that were active when session was generated
  subject_filter      TEXT,
  domain_filter       TEXT,
  skill_filter        TEXT,
  difficulty_filter   TEXT[],

  -- Ordered list of question IDs for this session
  question_ids        TEXT[] NOT NULL DEFAULT '{}',

  -- Running totals (updated as answers come in)
  questions_attempted INT NOT NULL DEFAULT 0,
  questions_correct   INT NOT NULL DEFAULT 0
);

-- Individual question answers within a practice session
CREATE TABLE IF NOT EXISTS practice_answers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          UUID NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,
  student_id          UUID NOT NULL,
  question_id         TEXT NOT NULL,
  selected_answer     TEXT,
  is_correct          BOOLEAN NOT NULL,
  time_spent_seconds  FLOAT,
  answered_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ── RLS ──────────────────────────────────────────────────────────

ALTER TABLE practice_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_answers  ENABLE ROW LEVEL SECURITY;

-- Students: full access to their own sessions
CREATE POLICY "student_own_practice_sessions"
  ON practice_sessions FOR ALL
  USING (auth.uid() = student_id);

-- Teacher: read all sessions
CREATE POLICY "teacher_read_practice_sessions"
  ON practice_sessions FOR SELECT
  USING ((auth.jwt() ->> 'email') = 'morrisontestprep@gmail.com');

-- Students: full access to their own answers
CREATE POLICY "student_own_practice_answers"
  ON practice_answers FOR ALL
  USING (auth.uid() = student_id);

-- Teacher: read all answers
CREATE POLICY "teacher_read_practice_answers"
  ON practice_answers FOR SELECT
  USING ((auth.jwt() ->> 'email') = 'morrisontestprep@gmail.com');
