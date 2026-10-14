-- Migration 030 — trainer engagement limit + history (2026-10-14)
--
-- Rule (JPN): a trainer may be engaged at most 21 times per year. The app
-- shows a SOFT warning only — it never blocks an invitation.
--
-- Counting rules (user decisions 2026-10-14):
--   * only CONFIRMED invitations count; Pending Invite is reported
--     separately so a coordinator can see a trainer nearing the limit
--   * cancelled workshops never count (same rule as migration 029)
--   * a workshop counts ONCE however many days it runs
--   * the year is the CALENDAR year of the workshop's start_date
--   * the limit lives in app_settings (admin-editable in the Database
--     Console), never hardcoded
--   * every active user may read every trainer's history, including
--     workshop titles created by other coordinators (user decision — the
--     point is to see a trainer's overall load and avoid over-use)
--
-- Additive only: one new table, two new read-only functions. No existing
-- table or row is changed. Safe to re-run.

-- ── 1. app_settings ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_settings (
  setting_key  TEXT        PRIMARY KEY,
  value_int    INTEGER     NOT NULL,
  note         TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- a 0 or absurd limit would make every warning meaningless
  CONSTRAINT app_settings_engagement_limit_range CHECK (
    setting_key <> 'trainer_max_engagements_per_year'
    OR value_int BETWEEN 1 AND 366
  )
);

COMMENT ON TABLE public.app_settings IS
  'Editable app-wide numeric settings (admin Database Console). Read by the app; nothing hardcoded.';

INSERT INTO public.app_settings (setting_key, value_int, note)
VALUES ('trainer_max_engagements_per_year', 21,
        'Max confirmed workshops per trainer per calendar year (soft warning only)')
ON CONFLICT (setting_key) DO NOTHING;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS settings_select    ON public.app_settings;
DROP POLICY IF EXISTS settings_admin_all ON public.app_settings;
CREATE POLICY settings_select ON public.app_settings
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY settings_admin_all ON public.app_settings
  FOR ALL USING (public.is_admin());

-- ── 2. Per-trainer counts for one calendar year ─────────────
-- p_exclude_engagement_id: the workshop being staffed right now, so it is
-- never counted against its own trainers. SECURITY DEFINER (it must see
-- every coordinator's workshops for the count to be true), so it checks
-- the caller is an ACTIVE user itself.
CREATE OR REPLACE FUNCTION public.fn_trainer_engagement_summary(
  p_trainer_ids           TEXT[],
  p_year                  INTEGER,
  p_exclude_engagement_id UUID DEFAULT NULL
)
RETURNS TABLE (
  trainer_id      TEXT,
  confirmed_count INTEGER,
  pending_count   INTEGER
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    et.trainer_id,
    (COUNT(DISTINCT te.engagement_id) FILTER (WHERE et.status = 'Confirmed'))::INTEGER,
    (COUNT(DISTINCT te.engagement_id) FILTER (WHERE et.status = 'Pending Invite'))::INTEGER
  FROM engagement_trainers et
  JOIN training_engagements te ON te.engagement_id = et.engagement_id
  WHERE et.trainer_id = ANY(p_trainer_ids)
    AND et.status IN ('Confirmed', 'Pending Invite')
    AND te.workflow_status <> 'Cancelled'
    AND te.start_date >= make_date(p_year, 1, 1)
    AND te.start_date <  make_date(p_year + 1, 1, 1)
    AND (p_exclude_engagement_id IS NULL OR te.engagement_id <> p_exclude_engagement_id)
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.status = 'active')
  GROUP BY et.trainer_id;
$$;

REVOKE ALL ON FUNCTION public.fn_trainer_engagement_summary FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_trainer_engagement_summary TO authenticated;

-- ── 3. One trainer's workshops in one calendar year ─────────
-- Confirmed + Pending Invite on non-cancelled workshops, newest first.
CREATE OR REPLACE FUNCTION public.fn_trainer_engagement_history(
  p_trainer_id TEXT,
  p_year       INTEGER
)
RETURNS TABLE (
  engagement_id   UUID,
  training_title  TEXT,
  venue           TEXT,
  start_date      DATE,
  end_date        DATE,
  trainer_status  TEXT
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    te.engagement_id,
    te.training_title,
    COALESCE(te.dynamic_venue_name, s.school_name),
    te.start_date,
    te.end_date,
    et.status
  FROM engagement_trainers et
  JOIN training_engagements te ON te.engagement_id = et.engagement_id
  LEFT JOIN schools s ON s.school_code = te.venue_school_code
  WHERE et.trainer_id = p_trainer_id
    AND et.status IN ('Confirmed', 'Pending Invite')
    AND te.workflow_status <> 'Cancelled'
    AND te.start_date >= make_date(p_year, 1, 1)
    AND te.start_date <  make_date(p_year + 1, 1, 1)
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.status = 'active')
  ORDER BY te.start_date DESC;
$$;

REVOKE ALL ON FUNCTION public.fn_trainer_engagement_history FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_trainer_engagement_history TO authenticated;
