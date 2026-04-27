-- Add signup_notified flag to profiles
-- Lets auth/callback reliably detect new/re-created profiles needing a notification

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS signup_notified BOOLEAN NOT NULL DEFAULT FALSE;

-- Mark every existing profile as already notified so we don't spam on next login
UPDATE profiles SET signup_notified = TRUE;
