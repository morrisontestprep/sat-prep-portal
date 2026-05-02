-- ─────────────────────────────────────────────────────────────────
-- SAT Rush: game sessions + per-question answers
-- Run this in the Supabase SQL editor
-- ─────────────────────────────────────────────────────────────────

-- Game sessions
CREATE TABLE IF NOT EXISTS sat_rush_games (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  completed_at             TIMESTAMPTZ,
  status                   TEXT NOT NULL DEFAULT 'active', -- active | completed | abandoned

  -- Settings chosen by student
  total_duration_seconds   INT NOT NULL,
  time_per_question_seconds INT NOT NULL,
  subject_filter           TEXT[],     -- null = all subjects
  domain_filter            TEXT[],     -- null = all domains
  skill_filter             TEXT[],     -- null = all skills
  difficulty_filter        TEXT[],     -- null = all difficulties

  -- Shuffled list of question IDs for this game
  question_queue           TEXT[] NOT NULL DEFAULT '{}',
  current_position         INT NOT NULL DEFAULT 0,

  -- Running totals (updated as answers come in)
  total_score              INT NOT NULL DEFAULT 0,
  questions_attempted      INT NOT NULL DEFAULT 0,
  questions_correct        INT NOT NULL DEFAULT 0,
  questions_incorrect      INT NOT NULL DEFAULT 0,
  ended_reason             TEXT  -- time_up | three_wrong | manual
);

-- Per-question answers within a game
CREATE TABLE IF NOT EXISTS sat_rush_answers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id               UUID NOT NULL REFERENCES sat_rush_games(id) ON DELETE CASCADE,
  student_id            UUID NOT NULL,  -- denormalised for easy "seen questions" queries
  question_id           TEXT NOT NULL,
  question_order        INT  NOT NULL,
  selected_answer       TEXT,           -- null if time expired before answer
  correct_answer        TEXT NOT NULL,
  is_correct            BOOLEAN NOT NULL,
  time_taken_seconds    FLOAT NOT NULL,
  within_time_limit     BOOLEAN NOT NULL,
  points_earned         INT NOT NULL DEFAULT 0,
  answered_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ── RLS ──────────────────────────────────────────────────────────

ALTER TABLE sat_rush_games   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sat_rush_answers ENABLE ROW LEVEL SECURITY;

-- Students: full access to their own games
CREATE POLICY "student_own_sat_rush_games"
  ON sat_rush_games FOR ALL
  USING (auth.uid() = student_id);

-- Teacher: read all games
CREATE POLICY "teacher_read_sat_rush_games"
  ON sat_rush_games FOR SELECT
  USING ((auth.jwt() ->> 'email') = 'morrisontestprep@gmail.com');

-- Students: full access to their own answers
CREATE POLICY "student_own_sat_rush_answers"
  ON sat_rush_answers FOR ALL
  USING (auth.uid() = student_id);

-- Teacher: read all answers
CREATE POLICY "teacher_read_sat_rush_answers"
  ON sat_rush_answers FOR SELECT
  USING ((auth.jwt() ->> 'email') = 'morrisontestprep@gmail.com');
