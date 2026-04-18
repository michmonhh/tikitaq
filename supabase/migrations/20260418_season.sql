-- Season / League mode: one season row per user with full schedule + results.
-- Run this in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS seasons (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  league_id         TEXT        NOT NULL,
  year              INTEGER     NOT NULL,
  user_team_id      INTEGER     NOT NULL,
  current_matchday  INTEGER     NOT NULL DEFAULT 1,
  schedule          JSONB       NOT NULL,
  results           JSONB       NOT NULL DEFAULT '[]'::jsonb,
  status            TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS seasons_user_idx ON seasons(user_id);

-- Max. eine aktive Saison pro User
CREATE UNIQUE INDEX IF NOT EXISTS seasons_one_active_idx
  ON seasons(user_id)
  WHERE status = 'active';

-- RLS: nur eigene Zeilen
ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "seasons_select_own" ON seasons;
CREATE POLICY "seasons_select_own" ON seasons
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "seasons_insert_own" ON seasons;
CREATE POLICY "seasons_insert_own" ON seasons
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "seasons_update_own" ON seasons;
CREATE POLICY "seasons_update_own" ON seasons
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "seasons_delete_own" ON seasons;
CREATE POLICY "seasons_delete_own" ON seasons
  FOR DELETE USING (auth.uid() = user_id);

-- updated_at automatisch pflegen (idempotent)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS seasons_set_updated_at ON seasons;
CREATE TRIGGER seasons_set_updated_at
  BEFORE UPDATE ON seasons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
