-- Perfect Run game mode: campaigns + XP on profile.
-- Run this in the Supabase SQL editor.

-- 1. XP counter on the existing profiles table.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS perfect_run_xp INTEGER NOT NULL DEFAULT 0;

-- 2. Campaigns table (one row per campaign, active/completed/failed).
CREATE TABLE IF NOT EXISTS perfect_run_campaigns (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id                INTEGER     NOT NULL,
  status                 TEXT        NOT NULL CHECK (status IN ('active', 'completed', 'failed')),
  opponents_beaten       INTEGER     NOT NULL DEFAULT 0,
  goals_for              INTEGER     NOT NULL DEFAULT 0,
  goals_against          INTEGER     NOT NULL DEFAULT 0,
  eliminated_by_team_id  INTEGER,
  opponent_order         INTEGER[]   NOT NULL,
  started_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at               TIMESTAMPTZ,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS perfect_run_campaigns_user_idx
  ON perfect_run_campaigns(user_id);

-- Only one active campaign per user.
CREATE UNIQUE INDEX IF NOT EXISTS perfect_run_campaigns_one_active_idx
  ON perfect_run_campaigns(user_id)
  WHERE status = 'active';

-- 3. RLS: users can only touch their own rows.
ALTER TABLE perfect_run_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "perfect_run_select_own" ON perfect_run_campaigns;
CREATE POLICY "perfect_run_select_own" ON perfect_run_campaigns
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "perfect_run_insert_own" ON perfect_run_campaigns;
CREATE POLICY "perfect_run_insert_own" ON perfect_run_campaigns
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "perfect_run_update_own" ON perfect_run_campaigns;
CREATE POLICY "perfect_run_update_own" ON perfect_run_campaigns
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "perfect_run_delete_own" ON perfect_run_campaigns;
CREATE POLICY "perfect_run_delete_own" ON perfect_run_campaigns
  FOR DELETE USING (auth.uid() = user_id);
