-- Migration 029 — cancelled workshops no longer block trainers (2026-10-14)
--
-- Bug: cancelling a whole workshop (POST /api/engagements/cancel) sets
-- training_engagements.workflow_status = 'Cancelled' but leaves each
-- engagement_trainers row at 'Confirmed' / 'Pending Invite'. The
-- availability check in fn_available_trainers looked ONLY at those
-- trainer rows, so every trainer on a cancelled workshop stayed hidden
-- from recommendations for the cancelled dates, permanently.
--
-- Fix: the overlap check now ignores Cancelled workshops — the same rule
-- Lexi's check_availability tool and GET /api/trainers/engaged already
-- apply. Fixing it in the query (not by rewriting trainer rows) also frees
-- every trainer stuck on past cancellations, with no data clean-up, and
-- leaves the Backlog/Reports history of who was invited untouched.
--
-- The function body is migration 024's verbatim except for the single
-- `te.workflow_status <> 'Cancelled'` line. Same signature, so
-- CREATE OR REPLACE is enough. Safe to re-run.

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
    -- ANY OTHER date-overlapping, NOT-CANCELLED engagement
    AND (
      p_start_date IS NULL OR p_end_date IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM engagement_trainers et
        JOIN training_engagements te ON te.engagement_id = et.engagement_id
        WHERE et.trainer_id = mt.trainer_id
          AND et.status IN ('Confirmed', 'Pending Invite')
          AND te.workflow_status <> 'Cancelled'  -- 029: a cancelled workshop frees its trainers
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
