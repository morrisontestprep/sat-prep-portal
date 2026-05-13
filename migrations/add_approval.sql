-- ─────────────────────────────────────────────────────────────────────────────
-- Student approval gate
-- New students sign in → land on /pending-approval until the teacher approves.
-- Existing students are pre-approved so their access is unaffected.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS approved BOOLEAN NOT NULL DEFAULT FALSE;

-- Every profile that already exists (teacher + all current students) is approved.
-- New rows created after this migration will default to FALSE until the teacher approves.
UPDATE profiles SET approved = TRUE;
