-- Add student notes and confidence level to student_answers
ALTER TABLE student_answers
  ADD COLUMN IF NOT EXISTS student_notes TEXT,
  ADD COLUMN IF NOT EXISTS confidence_level INTEGER CHECK (confidence_level BETWEEN 1 AND 5);
