-- Add attempt tracking to student_assignments
-- Run this in the Supabase SQL editor

-- 1. Add attempt_number column (existing rows become attempt 1)
ALTER TABLE student_assignments
  ADD COLUMN IF NOT EXISTS attempt_number integer DEFAULT 1 NOT NULL;

-- 2. Drop the old unique constraint (worksheet_id, student_id)
--    and replace with one that includes attempt_number
ALTER TABLE student_assignments
  DROP CONSTRAINT IF EXISTS student_assignments_worksheet_id_student_id_key;

ALTER TABLE student_assignments
  ADD CONSTRAINT student_assignments_worksheet_student_attempt_key
  UNIQUE (worksheet_id, student_id, attempt_number);
