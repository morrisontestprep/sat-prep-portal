-- ─────────────────────────────────────────────────────────────────────────────
-- Practice Tests: full adaptive SAT practice tests (4 modules)
-- Run this in the Supabase SQL editor
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Main test session record ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS practice_tests (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id                UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  completed_at              TIMESTAMPTZ,
  status                    TEXT NOT NULL DEFAULT 'active',
    -- active | rw_m2_ready | break | math_m1 | math_m2_ready | math_m2 | completed | abandoned

  -- Ordered question ID arrays (set at start for M1s; M2s set after routing)
  rw_m1_question_ids        TEXT[] NOT NULL DEFAULT '{}',
  rw_m2_question_ids        TEXT[] NOT NULL DEFAULT '{}',
  math_m1_question_ids      TEXT[] NOT NULL DEFAULT '{}',
  math_m2_question_ids      TEXT[] NOT NULL DEFAULT '{}',

  -- Adaptive routing results (set after each M1 completes)
  rw_m2_difficulty          TEXT,   -- 'hard' | 'easy' (never revealed to student)
  math_m2_difficulty        TEXT,   -- 'hard' | 'easy'

  -- Raw correct counts per module (set when each module is submitted)
  rw_m1_correct             INT,
  rw_m2_correct             INT,
  math_m1_correct           INT,
  math_m2_correct           INT,

  -- Scaled scores (set when test is completed)
  rw_scaled_score           INT,
  math_scaled_score         INT,
  total_scaled_score        INT,

  -- Timer state: seconds remaining when student last paused (per module)
  rw_m1_seconds_remaining   INT,
  rw_m2_seconds_remaining   INT,
  math_m1_seconds_remaining INT,
  math_m2_seconds_remaining INT,

  -- Retake lineage: if this is a retake, points to the original test
  retake_of                 UUID REFERENCES practice_tests(id) ON DELETE SET NULL
);

-- ── Per-question answers ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS practice_test_answers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id             UUID NOT NULL REFERENCES practice_tests(id) ON DELETE CASCADE,
  student_id          UUID NOT NULL,   -- denormalised for easy "seen questions" queries
  module              TEXT NOT NULL,   -- 'rw_m1' | 'rw_m2' | 'math_m1' | 'math_m2'
  position            INT  NOT NULL,   -- 0-indexed position within the module
  question_id         TEXT NOT NULL,
  selected_answer     TEXT,            -- NULL if skipped/not answered
  correct_answer      TEXT NOT NULL,
  is_correct          BOOLEAN,         -- NULL if not answered
  flagged             BOOLEAN NOT NULL DEFAULT FALSE,
  time_spent_seconds  FLOAT,
  answered_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_practice_tests_student
  ON practice_tests (student_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_practice_test_answers_test
  ON practice_test_answers (test_id, module, position);

CREATE INDEX IF NOT EXISTS idx_practice_test_answers_student
  ON practice_test_answers (student_id, question_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE practice_tests        ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_test_answers ENABLE ROW LEVEL SECURITY;

-- Students: full access to their own tests
CREATE POLICY "student_own_practice_tests"
  ON practice_tests FOR ALL
  USING (auth.uid() = student_id);

-- Teacher: read all tests
CREATE POLICY "teacher_read_practice_tests"
  ON practice_tests FOR SELECT
  USING ((auth.jwt() ->> 'email') = 'morrisontestprep@gmail.com');

-- Students: full access to their own answers
CREATE POLICY "student_own_practice_test_answers"
  ON practice_test_answers FOR ALL
  USING (auth.uid() = student_id);

-- Teacher: read all answers
CREATE POLICY "teacher_read_practice_test_answers"
  ON practice_test_answers FOR SELECT
  USING ((auth.jwt() ->> 'email') = 'morrisontestprep@gmail.com');
