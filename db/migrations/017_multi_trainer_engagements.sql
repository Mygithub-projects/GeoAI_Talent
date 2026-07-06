-- ============================================================
-- Migration 017: multi-trainer engagements
-- Run in Supabase SQL Editor.
-- ============================================================
-- Converts training_engagements from 1 engagement = 1 trainer to
-- 1 engagement (workshop) = many trainers. Adds trainers_needed,
-- drops assigned_trainer_id, introduces engagement_trainers as the
-- per-trainer invite/response record, and rewrites
-- fn_available_trainers to check availability + same-engagement
-- exclusion against engagement_trainers instead of
-- assigned_trainer_id.
--
-- workflow_status on training_engagements keeps its existing
-- 5-value CHECK unchanged; it becomes an engagement-level rollup
-- maintained by application code (src/lib/engagementRollup.ts)
-- instead of a per-trainer field.
-- ============================================================

-- ─── training_engagements alterations ─────────────────────────
ALTER TABLE public.training_engagements
  ADD COLUMN IF NOT EXISTS trainers_needed INTEGER NOT NULL DEFAULT 1
    CHECK (trainers_needed >= 1);

COMMENT ON COLUMN public.training_engagements.trainers_needed IS
  'How many trainers this workshop requires. Set at creation (recommend step).';

DROP INDEX IF EXISTS public.idx_eng_trainer;

ALTER TABLE public.training_engagements
  DROP COLUMN IF EXISTS assigned_trainer_id;

-- ─── New table: engagement_trainers ───────────────────────────
-- One row per (engagement, trainer) invite, ever. The UNIQUE
-- constraint is what enforces "never re-offer an already-invited
-- trainer for this workshop" at the DB level.
CREATE TABLE IF NOT EXISTS public.engagement_trainers (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID        NOT NULL REFERENCES public.training_engagements(engagement_id) ON DELETE CASCADE,
  trainer_id    TEXT        NOT NULL REFERENCES public.master_trainers(trainer_id),
  status        TEXT        NOT NULL DEFAULT 'Pending Invite'
                             CHECK (status IN ('Pending Invite','Confirmed','Declined')),
  invited_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at  TIMESTAMPTZ,
  invited_by    UUID        REFERENCES public.profiles(user_id),
  UNIQUE (engagement_id, trainer_id)
);

COMMENT ON TABLE public.engagement_trainers IS
  'One row per (engagement, trainer) invite. Multiple trainers can be invited to the same engagement; each independently accepts/declines. Superseded training_engagements.assigned_trainer_id.';
COMMENT ON COLUMN public.engagement_trainers.status IS
  'Pending Invite = awaiting trainer response; Confirmed = accepted; Declined = declined or admin-withdrawn.';

CREATE INDEX IF NOT EXISTS idx_engtr_engagement ON public.engagement_trainers (engagement_id);
CREATE INDEX IF NOT EXISTS idx_engtr_trainer    ON public.engagement_trainers (trainer_id);
CREATE INDEX IF NOT EXISTS idx_engtr_status     ON public.engagement_trainers (status);

ALTER TABLE public.engagement_trainers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS engtr_select    ON public.engagement_trainers;
DROP POLICY IF EXISTS engtr_admin_all ON public.engagement_trainers;

-- SELECT: admins see everything; a non-admin creator can see rows
-- for engagements they created (mirrors travel_logs' tlog_select).
CREATE POLICY engtr_select ON public.engagement_trainers
  FOR SELECT USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.training_engagements e
      WHERE e.engagement_id = engagement_trainers.engagement_id
        AND e.created_by = auth.uid()
    )
  );

-- ALL (insert/update/delete): admin only — writes happen from
-- admin-gated API routes using createAdminClient() (mirrors
-- invitation_tokens' tokens_admin_all).
CREATE POLICY engtr_admin_all ON public.engagement_trainers
  FOR ALL USING (public.is_admin());

-- ─── Rewrite fn_available_trainers ────────────────────────────
-- Adds p_exclude_engagement_id (default NULL, so any other caller
-- keeps working): excludes trainers already invited (any status)
-- for that engagement, and checks the date-overlap busy check via
-- engagement_trainers instead of the now-dropped assigned_trainer_id.
DROP FUNCTION IF EXISTS public.fn_available_trainers(
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DATE, DATE, INTEGER[]
);

CREATE OR REPLACE FUNCTION public.fn_available_trainers(
  p_venue_lat             DOUBLE PRECISION,
  p_venue_long            DOUBLE PRECISION,
  p_radius_km             DOUBLE PRECISION DEFAULT 50,
  p_start_date            DATE             DEFAULT NULL,
  p_end_date              DATE             DEFAULT NULL,
  p_item_ids              INTEGER[]        DEFAULT NULL,
  p_exclude_engagement_id UUID             DEFAULT NULL
)
RETURNS TABLE (
  trainer_id         TEXT,
  trainer_name       TEXT,
  school_name        TEXT,
  ppd_district       TEXT,
  lat                DOUBLE PRECISION,
  lng                DOUBLE PRECISION,
  skills             TEXT[],
  subjects           TEXT[],
  roles              TEXT[],
  accessibility_tier TEXT,
  straight_line_km   NUMERIC(8,2)
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    mt.trainer_id,
    mt.trainer_name,
    s.school_name,
    mt.ppd_district,
    mt.workstation_lat,
    mt.workstation_long,
    ARRAY(
      SELECT ss.name_en FROM trainer_skills ts
      JOIN   skills_subjects ss ON ss.item_id = ts.item_id
      WHERE  ts.trainer_id = mt.trainer_id AND ss.type = 'SKILL'
      ORDER BY ss.name_en
    ) AS skills,
    ARRAY(
      SELECT ss.name_en FROM trainer_skills ts
      JOIN   skills_subjects ss ON ss.item_id = ts.item_id
      WHERE  ts.trainer_id = mt.trainer_id AND ss.type = 'SUBJECT'
      ORDER BY ss.name_en
    ) AS subjects,
    ARRAY(
      SELECT tr.role FROM trainer_roles tr
      WHERE  tr.trainer_id = mt.trainer_id
      ORDER BY tr.role
    ) AS roles,
    COALESCE(s.accessibility_tier, 'road'),
    ROUND(
      (ST_Distance(
        mt.workstation_geom::geography,
        ST_SetSRID(ST_MakePoint(p_venue_long, p_venue_lat), 4326)::geography
      ) / 1000.0)::NUMERIC
    , 2)::NUMERIC(8,2) AS straight_line_km
  FROM master_trainers mt
  LEFT JOIN schools s ON s.school_code = mt.workstation_school_code
  WHERE  mt.workstation_lat   IS NOT NULL
    AND  mt.workstation_long  IS NOT NULL
    AND  mt.workstation_geom  IS NOT NULL
    AND  ST_DWithin(
           mt.workstation_geom::geography,
           ST_SetSRID(ST_MakePoint(p_venue_long, p_venue_lat), 4326)::geography,
           p_radius_km * 1000
         )
    AND (
      p_item_ids IS NULL
      OR array_length(p_item_ids, 1) IS NULL
      OR EXISTS (
        SELECT 1 FROM trainer_skills ts
        WHERE  ts.trainer_id = mt.trainer_id AND ts.item_id = ANY(p_item_ids)
      )
    )
    -- availability: exclude trainers already Pending/Confirmed on
    -- ANY OTHER date-overlapping engagement
    AND (
      p_start_date IS NULL OR p_end_date IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM engagement_trainers et
        JOIN training_engagements te ON te.engagement_id = et.engagement_id
        WHERE et.trainer_id = mt.trainer_id
          AND et.status IN ('Confirmed', 'Pending Invite')
          AND te.start_date <= p_end_date
          AND te.end_date   >= p_start_date
          AND (p_exclude_engagement_id IS NULL OR te.engagement_id <> p_exclude_engagement_id)
      )
    )
    -- same-engagement exclusion: never re-offer a trainer already
    -- invited (any status) for THIS engagement
    AND (
      p_exclude_engagement_id IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM engagement_trainers et2
        WHERE et2.engagement_id = p_exclude_engagement_id
          AND et2.trainer_id    = mt.trainer_id
      )
    )
  ORDER BY straight_line_km ASC;
$$;

GRANT EXECUTE ON FUNCTION public.fn_available_trainers TO authenticated, service_role;
