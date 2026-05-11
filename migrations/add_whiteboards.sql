-- ── Whiteboards ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS whiteboards (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT         NOT NULL    DEFAULT 'Untitled Board',
  created_by  UUID         NOT NULL    REFERENCES auth.users(id) ON DELETE CASCADE,
  canvas_json TEXT         NOT NULL    DEFAULT '{"version":1,"elements":[]}',
  created_at  TIMESTAMPTZ  NOT NULL    DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL    DEFAULT now()
);

-- ── Shares ────────────────────────────────────────────────────────────────────
-- Both teacher→student and student→teacher use the same table.

CREATE TABLE IF NOT EXISTS whiteboard_shares (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  whiteboard_id  UUID         NOT NULL REFERENCES whiteboards(id) ON DELETE CASCADE,
  shared_with    UUID         NOT NULL REFERENCES auth.users(id)  ON DELETE CASCADE,
  access_level   TEXT         NOT NULL DEFAULT 'view'
                              CHECK (access_level IN ('view','edit')),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  revoked_at     TIMESTAMPTZ,
  UNIQUE(whiteboard_id, shared_with)
);

-- ── Row-Level Security ────────────────────────────────────────────────────────

ALTER TABLE whiteboards       ENABLE ROW LEVEL SECURITY;
ALTER TABLE whiteboard_shares ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER helpers to break circular RLS recursion between
-- whiteboards ↔ whiteboard_shares policies.
CREATE OR REPLACE FUNCTION auth_wb_shared_ids()
RETURNS SETOF uuid LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT whiteboard_id FROM whiteboard_shares
  WHERE shared_with = auth.uid() AND revoked_at IS NULL
$$;

CREATE OR REPLACE FUNCTION auth_wb_edit_ids()
RETURNS SETOF uuid LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT whiteboard_id FROM whiteboard_shares
  WHERE shared_with = auth.uid() AND access_level = 'edit' AND revoked_at IS NULL
$$;

CREATE OR REPLACE FUNCTION auth_wb_owned_share_ids()
RETURNS SETOF uuid LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM whiteboards WHERE created_by = auth.uid()
$$;

-- Drop old versions in case of re-run
DROP POLICY IF EXISTS "wb_owner_all"        ON whiteboards;
DROP POLICY IF EXISTS "wb_shared_read"      ON whiteboards;
DROP POLICY IF EXISTS "wb_shared_edit"      ON whiteboards;
DROP POLICY IF EXISTS "wbs_owner_all"       ON whiteboard_shares;
DROP POLICY IF EXISTS "wbs_recipient_select" ON whiteboard_shares;

-- Owner has full access to their boards
CREATE POLICY "wb_owner_all" ON whiteboards
  FOR ALL USING (created_by = auth.uid());

-- Shared user can read a board shared with them (uses DEFINER fn — no recursion)
CREATE POLICY "wb_shared_read" ON whiteboards
  FOR SELECT USING (id IN (SELECT auth_wb_shared_ids()));

-- Shared user with edit access can update canvas_json / name
CREATE POLICY "wb_shared_edit" ON whiteboards
  FOR UPDATE USING (id IN (SELECT auth_wb_edit_ids()));

-- Owner of the whiteboard can manage its shares (uses DEFINER fn — no recursion)
CREATE POLICY "wbs_owner_all" ON whiteboard_shares
  FOR ALL USING (whiteboard_id IN (SELECT auth_wb_owned_share_ids()));

-- User can read shares where they are the recipient
CREATE POLICY "wbs_recipient_select" ON whiteboard_shares
  FOR SELECT USING (shared_with = auth.uid());

-- ── Storage bucket for pasted images ─────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('whiteboard-images', 'whiteboard-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "wb_img_auth_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'whiteboard-images' AND auth.uid() IS NOT NULL
  );

CREATE POLICY "wb_img_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'whiteboard-images');
