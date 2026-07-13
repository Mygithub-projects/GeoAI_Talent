-- ============================================================
-- Migration 024: Phase 8 — soft delete + cost actuals
--
-- 1. Adds deleted_at to the four curated reference tables
--    (schools, master_trainers, skills_subjects, trainer_skills)
--    so the Admin Database Console can soft-delete (hide +
--    restorable) instead of hard-deleting. NULL = live row.
-- 2. Adds actual_cost_myr / actual_cost_note to travel_logs so
--    admins can record the real claimed cost per (engagement,
--    trainer) — powers the Phase 8 cost-estimate-accuracy KPI.
-- 3. Recreates the three spatial functions so soft-deleted
--    trainers, skill links, and taxonomy items never appear in
--    the heatmap, pins, or availability search. Signatures are
--    unchanged (CREATE OR REPLACE is safe — no DROP needed).
--    NOTE: this migration also carries forward the AND-filter
--    patch (COUNT(DISTINCT) = array_length) that was applied
--    live in Supabase after migration 014 but never captured in
--    a numbered migration file — do not "simplify" it back to
--    EXISTS/ANY, which is OR logic.
--
-- Safe to re-run. Run in Supabase SQL Editor (DDL is blocked
-- via the service key).
-- ============================================================

-- ── 1. Soft-delete columns ──────────────────────────────────
ALTER TABLE public.schools         ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.master_trainers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.skills_subjects ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.trainer_skills  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- ── 2. travel_logs actual-cost fields ───────────────────────
ALTER TABLE public.travel_logs ADD COLUMN IF NOT EXISTS actual_cost_myr  NUMERIC(10,2);
ALTER TABLE public.travel_logs ADD COLUMN IF NOT EXISTS actual_cost_note TEXT;

-- ── 3a. fn_trainer_heatmap ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_trainer_heatmap(
  p_item_ids    INTEGER[] DEFAULT NULL,
  p_center_lat  FLOAT     DEFAULT NULL,
  p_center_long FLOAT     DEFAULT NULL,
  p_radius_km   FLOAT     DEFAULT NULL
)
RETURNS TABLE (lat FLOAT, lng FLOAT)
LANGUAGE sql STABLE
AS $$
  SELECT mt.workstation_lat, mt.workstation_long
  FROM   master_trainers mt
  WHERE  mt.workstation_lat  IS NOT NULL
    AND  mt.workstation_long IS NOT NULL
    AND  mt.deleted_at       IS NULL
    AND (
      p_item_ids IS NULL
      OR array_length(p_item_ids, 1) IS NULL
      OR (
        SELECT COUNT(DISTINCT ts.item_id) FROM trainer_skills ts
        WHERE  ts.trainer_id = mt.trainer_id
          AND  ts.item_id    = ANY(p_item_ids)
          AND  ts.deleted_at IS NULL
      ) = array_length(p_item_ids, 1)
    )
    AND (
      p_center_lat  IS NULL OR p_center_long IS NULL OR p_radius_km IS NULL
      OR ST_DWithin(
           mt.workstation_geom::geography,
           ST_SetSRID(ST_MakePoint(p_center_long, p_center_lat), 4326)::geography,
           p_radius_km * 1000
         )
    );
$$;

GRANT EXECUTE ON FUNCTION public.fn_trainer_heatmap TO authenticated, service_role;

-- ── 3b. fn_trainer_pins ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_trainer_pins(
  p_item_ids    INTEGER[] DEFAULT NULL,
  p_center_lat  FLOAT     DEFAULT NULL,
  p_center_long FLOAT     DEFAULT NULL,
  p_radius_km   FLOAT     DEFAULT NULL
)
RETURNS TABLE (
  trainer_id   TEXT,
  trainer_name TEXT,
  school_name  TEXT,
  ppd_district TEXT,
  lat          FLOAT,
  lng          FLOAT,
  skills       TEXT[],
  subjects     TEXT[],
  roles        TEXT[]
)
LANGUAGE sql STABLE
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
        AND  ts.deleted_at IS NULL AND ss.deleted_at IS NULL
      ORDER BY ss.name_en
    ) AS skills,
    ARRAY(
      SELECT ss.name_en FROM trainer_skills ts
      JOIN   skills_subjects ss ON ss.item_id = ts.item_id
      WHERE  ts.trainer_id = mt.trainer_id AND ss.type = 'SUBJECT'
        AND  ts.deleted_at IS NULL AND ss.deleted_at IS NULL
      ORDER BY ss.name_en
    ) AS subjects,
    ARRAY(
      SELECT tr.role FROM trainer_roles tr
      WHERE  tr.trainer_id = mt.trainer_id
      ORDER BY tr.role
    ) AS roles
  FROM master_trainers mt
  LEFT JOIN schools s ON s.school_code = mt.workstation_school_code
  WHERE  mt.workstation_lat  IS NOT NULL
    AND  mt.workstation_long IS NOT NULL
    AND  mt.deleted_at       IS NULL
    AND (
      p_item_ids IS NULL
      OR array_length(p_item_ids, 1) IS NULL
      OR (
        SELECT COUNT(DISTINCT ts.item_id) FROM trainer_skills ts
        WHERE  ts.trainer_id = mt.trainer_id
          AND  ts.item_id    = ANY(p_item_ids)
          AND  ts.deleted_at IS NULL
      ) = array_length(p_item_ids, 1)
    )
    AND (
      p_center_lat  IS NULL OR p_center_long IS NULL OR p_radius_km IS NULL
      OR ST_DWithin(
           mt.workstation_geom::geography,
           ST_SetSRID(ST_MakePoint(p_center_long, p_center_lat), 4326)::geography,
           p_radius_km * 1000
         )
    );
$$;

GRANT EXECUTE ON FUNCTION public.fn_trainer_pins TO authenticated, service_role;

-- ── 3c. fn_available_trainers ───────────────────────────────
-- Same signature as migration 017 (incl. p_exclude_engagement_id).
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
        AND  ts.deleted_at IS NULL AND ss.deleted_at IS NULL
      ORDER BY ss.name_en
    ) AS skills,
    ARRAY(
      SELECT ss.name_en FROM trainer_skills ts
      JOIN   skills_subjects ss ON ss.item_id = ts.item_id
      WHERE  ts.trainer_id = mt.trainer_id AND ss.type = 'SUBJECT'
        AND  ts.deleted_at IS NULL AND ss.deleted_at IS NULL
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
    AND  mt.deleted_at        IS NULL
    AND  ST_DWithin(
           mt.workstation_geom::geography,
           ST_SetSRID(ST_MakePoint(p_venue_long, p_venue_lat), 4326)::geography,
           p_radius_km * 1000
         )
    AND (
      p_item_ids IS NULL
      OR array_length(p_item_ids, 1) IS NULL
      OR (
        SELECT COUNT(DISTINCT ts.item_id) FROM trainer_skills ts
        WHERE  ts.trainer_id = mt.trainer_id
          AND  ts.item_id    = ANY(p_item_ids)
          AND  ts.deleted_at IS NULL
      ) = array_length(p_item_ids, 1)
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
